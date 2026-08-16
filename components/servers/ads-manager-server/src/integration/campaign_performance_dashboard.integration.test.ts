/**
 * Integration tests (Phase 5 — Integration Testing) for campaign-performance-dashboard. Run via
 * `npm run test:integration` (NOT part of the default `npm test` — see
 * vitest.config.ts/vitest.integration.config.ts), alongside the pre-existing
 * google_ads_connection.integration.test.ts (both files share src/integration/test_env.ts).
 *
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/campaign-performance-dashboard/SPEC.md
 * @plan changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/campaign-performance-dashboard/PLAN.md
 *
 * test_fetch_success_writes_cache_to_postgres
 * test_second_request_within_ttl_does_not_call_google_ads_mock
 * test_api_failure_with_existing_cache_returns_stale_true
 * test_api_failure_without_cache_returns_error
 * test_needs_reconnect_account_returns_409_without_calling_api
 *
 * Requires a real local Postgres with BOTH 001_initial_schema.sql and
 * 002_campaign_metrics_cache.sql applied, in order — see
 * components/databases/ads-manager-db/README.md's "Local Integration Test Database" section.
 * Everything server-side is real (real Express router via createController, real DAL, real
 * Postgres via a real pg Pool, real fetchCampaignMetrics 7-step flow). Only the Google-facing
 * boundary (fetchCampaignMetrics on the mock adapter) is mocked — deterministically, and with a
 * test-only failure-injection + call-count hook (see create_mock_google_ads_client.ts) so the
 * "Google Ads API is down" fallback paths (SPEC.md steps 6-7) are exercisable without real
 * network flakiness.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@ads-manager/contract';
import {
  MOCK_ACCESSIBLE_CUSTOMER_IDS,
  MOCK_CAMPAIGNS,
  MOCK_OAUTH_CODE,
  getMockCampaignMetricsCallCount,
  resetMockGoogleAdsTestControls,
  setMockGoogleAdsGenericFailure,
  startTestServer,
  type TestServer,
} from './test_env';

type OAuthCallbackResponse = components['schemas']['OAuthCallbackResponse'];
type ConnectAccountsResponse = components['schemas']['ConnectAccountsResponse'];
type ListCampaignsResponse = components['schemas']['ListCampaignsResponse'];
type ErrorResponse = components['schemas']['ErrorResponse'];

// Same OAuth-start -> (mock) redirect -> OAuth-callback -> connect dance as
// google_ads_connection.integration.test.ts's runOAuthCallback/connectCustomerIds, duplicated
// (rather than imported) so this file stays self-contained per the task's instruction not to
// touch google_ads_connection.integration.test.ts itself. Returns the connected account's id,
// which is all this suite needs — it never asserts on the OAuth step itself.
const connectMockAccount = async (baseUrl: string, customerId: string): Promise<string> => {
  const startRes = await fetch(`${baseUrl}/oauth/google-ads/start`);
  expect(startRes.status).toBe(200);
  const { authorization_url: authorizationUrl } = (await startRes.json()) as components['schemas']['StartOAuthResponse'];

  const redirectUrl = new URL(authorizationUrl);
  const code = redirectUrl.searchParams.get('code');
  const state = redirectUrl.searchParams.get('state');
  expect(code).toBe(MOCK_OAUTH_CODE);

  const callbackRes = await fetch(`${baseUrl}/oauth/google-ads/callback?code=${String(code)}&state=${String(state)}`);
  expect(callbackRes.status).toBe(200);
  await (callbackRes.json() as Promise<OAuthCallbackResponse>);

  const connectRes = await fetch(`${baseUrl}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_ids: [customerId] }),
  });
  expect(connectRes.status).toBe(201);
  const connectBody = (await connectRes.json()) as ConnectAccountsResponse;
  const accountId = connectBody.connected[0]?.id;
  expect(accountId).toBeDefined();
  return accountId!;
};

const getCampaigns = async (
  baseUrl: string,
  accountId: string,
  query = ''
): Promise<Readonly<{ status: number; body: ListCampaignsResponse | ErrorResponse }>> => {
  const res = await fetch(`${baseUrl}/accounts/${accountId}/campaigns${query}`);
  const body = (await res.json()) as ListCampaignsResponse | ErrorResponse;
  return { status: res.status, body };
};

describe('campaign-performance-dashboard integration tests', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    resetMockGoogleAdsTestControls();
    // Truncates BOTH connected_accounts and campaign_metrics_cache — the latter cascades from the
    // former (see test_env.ts's truncateConnectedAccounts comment).
    await server.truncateConnectedAccounts();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('test_fetch_success_writes_cache_to_postgres', () => {
    it('fetches fresh campaigns via the mocked Google Ads API and writes them to campaign_metrics_cache', async () => {
      const [customerId] = MOCK_ACCESSIBLE_CUSTOMER_IDS;
      const accountId = await connectMockAccount(server.baseUrl, customerId!);

      const { status, body } = await getCampaigns(server.baseUrl, accountId);

      expect(status).toBe(200);
      const listBody = body as ListCampaignsResponse;
      expect(listBody.stale).toBe(false);
      expect(listBody.campaigns).toHaveLength(MOCK_CAMPAIGNS.length);

      // The rows actually landed in the real Postgres database, one per mock campaign, keyed to
      // this connected account.
      const { rows } = await server.pool.query<{ google_campaign_id: string; connected_account_id: string }>(
        'SELECT google_campaign_id, connected_account_id FROM campaign_metrics_cache WHERE connected_account_id = $1',
        [accountId]
      );
      expect(rows).toHaveLength(MOCK_CAMPAIGNS.length);
      const cachedCampaignIds = rows.map((r) => r.google_campaign_id).sort();
      const expectedCampaignIds = MOCK_CAMPAIGNS.map((c) => c.googleCampaignId).sort();
      expect(cachedCampaignIds).toEqual(expectedCampaignIds);
    });
  });

  describe('test_second_request_within_ttl_does_not_call_google_ads_mock', () => {
    it('serves the second within-TTL request from cache without calling the Google Ads mock again', async () => {
      const [customerId] = MOCK_ACCESSIBLE_CUSTOMER_IDS;
      const accountId = await connectMockAccount(server.baseUrl, customerId!);

      const first = await getCampaigns(server.baseUrl, accountId);
      expect(first.status).toBe(200);
      expect(getMockCampaignMetricsCallCount()).toBe(1);

      const second = await getCampaigns(server.baseUrl, accountId);
      expect(second.status).toBe(200);

      // Still 1 — the second request, well within the 15 min TTL, must be served entirely from
      // Postgres, never touching the (mocked) Google Ads API again.
      expect(getMockCampaignMetricsCallCount()).toBe(1);

      const secondBody = second.body as ListCampaignsResponse;
      expect(secondBody.stale).toBe(false);
      expect(secondBody.campaigns).toHaveLength(MOCK_CAMPAIGNS.length);
    });
  });

  describe('test_api_failure_with_existing_cache_returns_stale_true', () => {
    it('falls back to the expired cache with stale: true when the Google Ads mock fails but a cache entry exists', async () => {
      const [customerId] = MOCK_ACCESSIBLE_CUSTOMER_IDS;
      const accountId = await connectMockAccount(server.baseUrl, customerId!);

      // Populate the cache with a real successful fetch first.
      const initial = await getCampaigns(server.baseUrl, accountId);
      expect(initial.status).toBe(200);

      // Age the cache past the 15 minute TTL directly in Postgres, so the next request attempts a
      // real refresh (rather than serving the still-fresh cache).
      const staleFetchedAt = new Date(Date.now() - 20 * 60 * 1000);
      await server.pool.query('UPDATE campaign_metrics_cache SET fetched_at = $1 WHERE connected_account_id = $2', [
        staleFetchedAt,
        accountId,
      ]);

      setMockGoogleAdsGenericFailure(true);

      const { status, body } = await getCampaigns(server.baseUrl, accountId);

      expect(status).toBe(200);
      const listBody = body as ListCampaignsResponse;
      expect(listBody.stale).toBe(true);
      expect(listBody.fetched_at).toBe(staleFetchedAt.toISOString());
      expect(listBody.campaigns).toHaveLength(MOCK_CAMPAIGNS.length);
    });
  });

  describe('test_api_failure_without_cache_returns_error', () => {
    it('returns 502 GOOGLE_ADS_API_ERROR when the Google Ads mock fails and no cache exists for this account+range', async () => {
      const [customerId] = MOCK_ACCESSIBLE_CUSTOMER_IDS;
      const accountId = await connectMockAccount(server.baseUrl, customerId!);

      setMockGoogleAdsGenericFailure(true);

      const { status, body } = await getCampaigns(server.baseUrl, accountId);

      expect(status).toBe(502);
      const errorBody = body as ErrorResponse;
      expect(errorBody.error.code).toBe('GOOGLE_ADS_API_ERROR');

      // Confirm the failure really did leave no trace in the cache.
      const { rows } = await server.pool.query('SELECT * FROM campaign_metrics_cache WHERE connected_account_id = $1', [
        accountId,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('test_needs_reconnect_account_returns_409_without_calling_api', () => {
    it('returns 409 ACCOUNT_NEEDS_RECONNECT and never calls the Google Ads mock for a needs_reconnect account', async () => {
      // Seeded directly in Postgres (same pattern as
      // google_ads_connection.integration.test.ts's test_revoked_refresh_token_marks_account_needs_reconnect)
      // rather than via the OAuth/connect flow, since this test exercises the state AFTER an
      // account has already been marked needs_reconnect.
      const { rows } = await server.pool.query<{ id: string }>(
        `INSERT INTO connected_accounts (
           google_customer_id, account_name, currency_code, timezone,
           oauth_refresh_token_encrypted, granted_scopes, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        ['6666666666', 'Needs Reconnect Account', 'BRL', 'America/Sao_Paulo', 'seeded-encrypted-token', 'scope', 'needs_reconnect']
      );
      const accountId = rows[0]?.id;
      expect(accountId).toBeDefined();

      const { status, body } = await getCampaigns(server.baseUrl, accountId!);

      expect(status).toBe(409);
      const errorBody = body as ErrorResponse;
      expect(errorBody.error.code).toBe('ACCOUNT_NEEDS_RECONNECT');

      // The block happens before any Google Ads call is attempted.
      expect(getMockCampaignMetricsCallCount()).toBe(0);
    });
  });
});
