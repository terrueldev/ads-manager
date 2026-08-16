/**
 * Integration tests (Phase 6 — Integration & E2E Testing). Run via `npm run test:integration`
 * (NOT part of the default `npm test` — see vitest.config.ts/vitest.integration.config.ts).
 *
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * @plan changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/PLAN.md
 *
 * test_full_oauth_flow_against_sandbox_account
 * test_persist_selected_accounts_writes_encrypted_tokens
 * test_list_connected_accounts_never_exposes_tokens
 * test_disconnect_account_removes_record_and_stops_future_calls
 * test_revoked_refresh_token_marks_account_needs_reconnect
 *
 * Requires a real local Postgres with the 001_initial_schema.sql migration applied — see
 * components/databases/ads-manager-db/README.md's "Local Integration Test Database" section.
 * Everything server-side is real (real Express router via createController, real DAL, real
 * Postgres via a real pg Pool). Only the Google-facing boundary — exchangeOAuthCode,
 * listAccessibleCustomerIds, fetchCustomerMetadata — is mocked (deterministically, via
 * config.mockGoogleAds — see src/integration/test_env.ts), since there is no real Google Cloud
 * OAuth client/developer token yet (a documented pending prerequisite in SPEC.md > Dependencies).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@ads-manager/contract';
import { decryptRefreshToken } from '../model';
import { handleTokenRefreshFailure } from '../model/use-cases/handle_token_refresh_failure';
import { createMockDependencies } from '../model/use-cases/test_helpers/mock_dependencies';
import {
  MOCK_ACCESSIBLE_CUSTOMER_IDS,
  MOCK_OAUTH_CODE,
  MOCK_REFRESH_TOKEN,
  TEST_TOKEN_ENCRYPTION_KEY,
  startTestServer,
  type TestServer,
} from './test_env';

type OAuthCallbackResponse = components['schemas']['OAuthCallbackResponse'];
type ConnectAccountsResponse = components['schemas']['ConnectAccountsResponse'];
type ListAccountsResponse = components['schemas']['ListAccountsResponse'];
type ErrorResponse = components['schemas']['ErrorResponse'];

// Drives GET /oauth/google-ads/start -> (mock) browser redirect -> GET /oauth/google-ads/callback,
// exactly like the real flow, just without an actual browser: the mock OAuth adapter's
// authorization_url already IS the redirectUri with ?code&state appended (see
// create_mock_oauth2_client.ts), so reading those query params off it and calling the callback
// endpoint directly is equivalent to a browser following that redirect.
const runOAuthCallback = async (baseUrl: string): Promise<OAuthCallbackResponse> => {
  const startRes = await fetch(`${baseUrl}/oauth/google-ads/start`);
  expect(startRes.status).toBe(200);
  const { authorization_url: authorizationUrl } = (await startRes.json()) as components['schemas']['StartOAuthResponse'];

  const redirectUrl = new URL(authorizationUrl);
  const code = redirectUrl.searchParams.get('code');
  const state = redirectUrl.searchParams.get('state');
  expect(code).toBe(MOCK_OAUTH_CODE);
  expect(state).toBeTruthy();

  const callbackRes = await fetch(
    `${baseUrl}/oauth/google-ads/callback?code=${String(code)}&state=${String(state)}`
  );
  expect(callbackRes.status).toBe(200);
  return (await callbackRes.json()) as OAuthCallbackResponse;
};

const connectCustomerIds = async (
  baseUrl: string,
  customerIds: readonly string[]
): Promise<ConnectAccountsResponse> => {
  const res = await fetch(`${baseUrl}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_ids: customerIds }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as ConnectAccountsResponse;
};

describe('google-ads-connection integration tests', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.truncateConnectedAccounts();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('test_full_oauth_flow_against_sandbox_account', () => {
    it('lists accessible accounts after the OAuth callback and persists a selected one to Postgres', async () => {
      const callback = await runOAuthCallback(server.baseUrl);

      expect(callback.accessible_accounts).toHaveLength(MOCK_ACCESSIBLE_CUSTOMER_IDS.length);
      const [firstCustomerId] = MOCK_ACCESSIBLE_CUSTOMER_IDS;
      expect(firstCustomerId).toBeDefined();
      const listedAccount = callback.accessible_accounts.find((a) => a.customer_id === firstCustomerId);
      expect(listedAccount).toBeDefined();
      expect(listedAccount?.already_connected).toBe(false);

      const connectResult = await connectCustomerIds(server.baseUrl, [firstCustomerId!]);
      expect(connectResult.connected).toHaveLength(1);
      expect(connectResult.connected[0]?.customer_id).toBe(firstCustomerId);

      // The row actually landed in the real Postgres database (not just an in-process fake).
      const { rows } = await server.pool.query('SELECT * FROM connected_accounts WHERE google_customer_id = $1', [
        firstCustomerId,
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('active');
    });
  });

  describe('test_persist_selected_accounts_writes_encrypted_tokens', () => {
    it('writes an encrypted refresh token that round-trips back to the plaintext via token_crypto', async () => {
      await runOAuthCallback(server.baseUrl);
      const [customerId] = MOCK_ACCESSIBLE_CUSTOMER_IDS;
      await connectCustomerIds(server.baseUrl, [customerId!]);

      const { rows } = await server.pool.query<{ oauth_refresh_token_encrypted: string }>(
        'SELECT oauth_refresh_token_encrypted FROM connected_accounts WHERE google_customer_id = $1',
        [customerId]
      );
      const encrypted = rows[0]?.oauth_refresh_token_encrypted;
      expect(encrypted).toBeDefined();

      // Never stored in plaintext.
      expect(encrypted).not.toBe(MOCK_REFRESH_TOKEN);
      expect(encrypted).not.toContain(MOCK_REFRESH_TOKEN);

      // But it IS the real refresh token, encrypted with the real token_crypto module — provably
      // decryptable, not just "some opaque string".
      const decrypted = decryptRefreshToken(TEST_TOKEN_ENCRYPTION_KEY, encrypted!);
      expect(decrypted).toBe(MOCK_REFRESH_TOKEN);
    });
  });

  describe('test_list_connected_accounts_never_exposes_tokens', () => {
    it('never includes any token field or value in GET /accounts, even though rows have one', async () => {
      await runOAuthCallback(server.baseUrl);
      await connectCustomerIds(server.baseUrl, [...MOCK_ACCESSIBLE_CUSTOMER_IDS]);

      // Confirm the DB rows genuinely carry a (non-empty) encrypted token, so this test would
      // actually fail if the API ever started leaking it.
      const { rows: dbRows } = await server.pool.query<{ oauth_refresh_token_encrypted: string }>(
        'SELECT oauth_refresh_token_encrypted FROM connected_accounts'
      );
      expect(dbRows.length).toBeGreaterThan(0);
      for (const row of dbRows) {
        expect(row.oauth_refresh_token_encrypted.length).toBeGreaterThan(0);
      }

      const res = await fetch(`${server.baseUrl}/accounts`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListAccountsResponse;
      expect(body.accounts.length).toBeGreaterThan(0);

      for (const account of body.accounts) {
        const keys = Object.keys(account);
        expect(keys).not.toContain('oauth_refresh_token_encrypted');
        expect(keys).not.toContain('refresh_token');
        expect(keys).not.toContain('token');
        expect(keys).not.toContain('granted_scopes');
      }

      // Belt-and-suspenders: neither the plaintext mock refresh token nor any of the actual
      // encrypted payloads read from Postgres appear anywhere in the serialized response body.
      const rawBody = JSON.stringify(body);
      expect(rawBody).not.toContain(MOCK_REFRESH_TOKEN);
      for (const row of dbRows) {
        expect(rawBody).not.toContain(row.oauth_refresh_token_encrypted);
      }
    });
  });

  describe('test_disconnect_account_removes_record_and_stops_future_calls', () => {
    it('removes the row on DELETE, and a second delete/lookup confirms it stays gone', async () => {
      await runOAuthCallback(server.baseUrl);
      const [customerId] = MOCK_ACCESSIBLE_CUSTOMER_IDS;
      const connectResult = await connectCustomerIds(server.baseUrl, [customerId!]);
      const accountId = connectResult.connected[0]?.id;
      expect(accountId).toBeDefined();

      const deleteRes = await fetch(`${server.baseUrl}/accounts/${String(accountId)}`, { method: 'DELETE' });
      expect(deleteRes.status).toBe(204);

      // Gone from the real DB, not just from an in-memory cache.
      const { rows } = await server.pool.query('SELECT * FROM connected_accounts WHERE id = $1', [accountId]);
      expect(rows).toHaveLength(0);

      // Gone from the listing too.
      const listRes = await fetch(`${server.baseUrl}/accounts`);
      const listBody = (await listRes.json()) as ListAccountsResponse;
      expect(listBody.accounts.find((a) => a.id === accountId)).toBeUndefined();

      // A second delete attempt (simulating "any future call for this account") finds nothing to
      // act on — 404, not a silent success or a stale-row resurrection.
      const secondDeleteRes = await fetch(`${server.baseUrl}/accounts/${String(accountId)}`, { method: 'DELETE' });
      expect(secondDeleteRes.status).toBe(404);
      const secondDeleteBody = (await secondDeleteRes.json()) as ErrorResponse;
      expect(secondDeleteBody.error.code).toBe('ACCOUNT_NOT_FOUND');
    });
  });

  describe('test_revoked_refresh_token_marks_account_needs_reconnect', () => {
    it('flips status to needs_reconnect in Postgres when the refresh token can no longer be used', async () => {
      // Seed a normal `active` connected account directly in Postgres — this test exercises what
      // happens AFTER a token is already connected, not the connection flow itself.
      const customerId = '9999999999';
      await server.pool.query(
        `INSERT INTO connected_accounts (
           google_customer_id, account_name, currency_code, timezone,
           oauth_refresh_token_encrypted, granted_scopes
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [customerId, 'Seeded Account', 'BRL', 'America/Sao_Paulo', 'seeded-encrypted-token', 'https://www.googleapis.com/auth/adwords']
      );

      // handleTokenRefreshFailure isn't wired to any HTTP endpoint yet (no data-fetching endpoint
      // exists in this change — see the use-case's own header comment), so it's exercised
      // directly here, wired to the REAL DAL bound to the REAL Postgres pool started above
      // (server.dal) — everything else in Dependencies is an inert mock, since this use-case only
      // touches findConnectedAccountByCustomerId/updateConnectedAccountStatus.
      const deps = createMockDependencies({
        findConnectedAccountByCustomerId: server.dal.findConnectedAccountByCustomerId,
        updateConnectedAccountStatus: server.dal.updateConnectedAccountStatus,
      });

      const result = await handleTokenRefreshFailure(deps, customerId);
      expect(result.success).toBe(true);

      const { rows } = await server.pool.query<{ status: string }>(
        'SELECT status FROM connected_accounts WHERE google_customer_id = $1',
        [customerId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('needs_reconnect');
    });

    it("does not affect other connected accounts' status (NFR: isolation between accounts)", async () => {
      const untouchedCustomerId = '8888888888';
      const revokedCustomerId = '7777777777';
      await server.pool.query(
        `INSERT INTO connected_accounts (
           google_customer_id, account_name, currency_code, timezone,
           oauth_refresh_token_encrypted, granted_scopes
         ) VALUES
           ($1, 'Untouched', 'BRL', 'America/Sao_Paulo', 'enc-1', 'scope'),
           ($2, 'Revoked', 'BRL', 'America/Sao_Paulo', 'enc-2', 'scope')`,
        [untouchedCustomerId, revokedCustomerId]
      );

      const deps = createMockDependencies({
        findConnectedAccountByCustomerId: server.dal.findConnectedAccountByCustomerId,
        updateConnectedAccountStatus: server.dal.updateConnectedAccountStatus,
      });

      await handleTokenRefreshFailure(deps, revokedCustomerId);

      const { rows } = await server.pool.query<{ google_customer_id: string; status: string }>(
        'SELECT google_customer_id, status FROM connected_accounts ORDER BY google_customer_id'
      );
      const untouched = rows.find((r) => r.google_customer_id === untouchedCustomerId);
      const revoked = rows.find((r) => r.google_customer_id === revokedCustomerId);
      expect(untouched?.status).toBe('active');
      expect(revoked?.status).toBe('needs_reconnect');
    });
  });
});
