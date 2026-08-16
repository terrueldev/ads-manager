// Integration test infrastructure (Phase 6 — Integration & E2E Testing). NOT a *.test.ts file
// itself, so Vitest never tries to run it directly — only imported by
// src/integration/*.integration.test.ts.
//
// Boots the REAL Controller (real Express router, real DAL bound to a REAL local Postgres — see
// components/databases/ads-manager-db/README.md's "Local Integration Test Database" section for
// how to start it) behind a REAL HTTP server (src/operator/create_http_server.ts), with
// config.mockGoogleAds=true so only the Google-facing boundary (exchangeOAuthCode,
// listAccessibleCustomerIds, fetchCustomerMetadata) is deterministic/offline — see
// src/controller/google_ads/create_mock_*.ts. Everything else (routing, request/response mapping,
// DAL, Postgres) is exercised for real, which is the whole point of an integration test.
import { Pool } from 'pg';
import type pino from 'pino';
import type { Config } from '../config';
import { createController } from '../controller';
import {
  MOCK_ACCESSIBLE_CUSTOMER_IDS,
  MOCK_CAMPAIGNS,
  getMockCampaignMetricsCallCount,
  resetMockGoogleAdsTestControls,
  setMockGoogleAdsGenericFailure,
} from '../controller/google_ads/create_mock_google_ads_client';
import { MOCK_OAUTH_CODE, MOCK_REFRESH_TOKEN } from '../controller/google_ads/create_mock_oauth2_client';
import { createDatabase } from '../operator/create_database';
import { createHttpServer } from '../operator/create_http_server';
import {
  createConnectedAccount,
  deleteConnectedAccount,
  findAllConnectedAccounts,
  findCampaignMetricsByAccountAndRange,
  findConnectedAccountByCustomerId,
  findConnectedAccountById,
  reconnectConnectedAccount,
  updateConnectedAccountStatus,
  upsertCampaignMetrics,
  type ConnectedAccount,
} from '../dal';

export {
  MOCK_ACCESSIBLE_CUSTOMER_IDS,
  MOCK_CAMPAIGNS,
  MOCK_OAUTH_CODE,
  MOCK_REFRESH_TOKEN,
  getMockCampaignMetricsCallCount,
  resetMockGoogleAdsTestControls,
  setMockGoogleAdsGenericFailure,
};

// Matches the docker container started for Phase 6 (see the db README) unless overridden.
const TEST_DB_HOST = process.env.TEST_DB_HOST ?? 'localhost';
const TEST_DB_PORT = Number(process.env.TEST_DB_PORT ?? 5433);
const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'ads_manager';
const TEST_DB_USER = process.env.TEST_DB_USER ?? 'app';
const TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? 'ads_manager_test_local';

// 32 random bytes, base64-encoded — a fixed test-only key (never used outside this suite), so
// test_persist_selected_accounts_writes_encrypted_tokens can decrypt what it reads back from
// Postgres and assert the round-trip.
export const TEST_TOKEN_ENCRYPTION_KEY = 'AqdNxFBfnGLlXAnGKdK7x5RTgiACO3AefeRS50vS5tQ=';

const TEST_SERVER_PORT = Number(process.env.TEST_SERVER_PORT ?? 34917);
const TEST_PROBES_PORT = Number(process.env.TEST_PROBES_PORT ?? 34918);

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  child: () => silentLogger,
} as unknown as pino.Logger;

export const buildTestConfig = (): Config => ({
  port: TEST_SERVER_PORT,
  probesPort: TEST_PROBES_PORT,
  logLevel: 'silent',
  database: {
    host: TEST_DB_HOST,
    port: TEST_DB_PORT,
    name: TEST_DB_NAME,
    user: TEST_DB_USER,
    password: TEST_DB_PASSWORD,
    pool: 5,
  },
  googleOAuth: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    // Doesn't need to resolve to anything real — the mock OAuth adapter only ever builds a URL
    // string from it (URL(config.redirectUri)) and integration tests read code/state off that
    // string directly rather than actually navigating a browser there (that's what the E2E/
    // Playwright tests do).
    redirectUri: 'http://localhost:5173/contas/callback',
  },
  googleAds: {
    developerToken: 'test-developer-token',
  },
  tokenEncryptionKey: TEST_TOKEN_ENCRYPTION_KEY,
  mockGoogleAds: true,
});

export type TestServerDal = Readonly<{
  readonly findConnectedAccountByCustomerId: (customerId: string) => Promise<ConnectedAccount | null>;
  readonly updateConnectedAccountStatus: (
    id: string,
    status: ConnectedAccount['status']
  ) => Promise<ConnectedAccount | null>;
}>;

export type TestServer = Readonly<{
  readonly baseUrl: string;
  readonly pool: Pool;
  // Exposed for the one use-case this change implements but doesn't wire to any HTTP endpoint yet
  // (handleTokenRefreshFailure — see src/model/use-cases/handle_token_refresh_failure.ts's header
  // comment) — test_revoked_refresh_token_marks_account_needs_reconnect calls it directly against
  // these real-DAL-bound-to-real-Postgres functions instead of going through HTTP.
  readonly dal: TestServerDal;
  readonly truncateConnectedAccounts: () => Promise<void>;
  readonly stop: () => Promise<void>;
}>;

// Starts the real HTTP server (Controller + DAL bound to a real Postgres Pool) on a fixed local
// test port, mirroring exactly what src/operator/create_operator.ts wires up in production (minus
// the lifecycle-probes/state-machine ceremony, which integration tests have no need for).
export const startTestServer = async (): Promise<TestServer> => {
  const config = buildTestConfig();
  const logger = silentLogger;

  const db = createDatabase({ config, logger });
  await db.connect();

  const dal = {
    findConnectedAccountByCustomerId: findConnectedAccountByCustomerId.bind(null, { db }),
    findConnectedAccountById: findConnectedAccountById.bind(null, { db }),
    findAllConnectedAccounts: findAllConnectedAccounts.bind(null, { db }),
    createConnectedAccount: createConnectedAccount.bind(null, { db }),
    deleteConnectedAccount: deleteConnectedAccount.bind(null, { db }),
    updateConnectedAccountStatus: updateConnectedAccountStatus.bind(null, { db }),
    reconnectConnectedAccount: reconnectConnectedAccount.bind(null, { db }),
    findCampaignMetricsByAccountAndRange: findCampaignMetricsByAccountAndRange.bind(null, { db }),
    upsertCampaignMetrics: upsertCampaignMetrics.bind(null, { db }),
  };

  const controller = createController({ config, logger, dal });
  const httpServer = createHttpServer({ controller });
  await httpServer.start(config.port);

  // A second, independent pg connection used ONLY by tests to assert directly against the table
  // (bypassing the DAL/API entirely) — e.g. to seed rows or check a row's raw encrypted token.
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  });

  // CASCADE is required (not merely a nicety) since campaign_metrics_cache.connected_account_id
  // FK-references connected_accounts.id (migration 002_campaign_metrics_cache.sql) — Postgres
  // refuses a plain TRUNCATE on a table something else references, regardless of whether that
  // other table has rows. This also means every truncateConnectedAccounts() call empties
  // campaign_metrics_cache too, which is exactly what campaign_performance_dashboard's
  // integration suite wants between tests.
  const truncateConnectedAccounts = async (): Promise<void> => {
    await pool.query('TRUNCATE TABLE connected_accounts CASCADE');
  };

  const stop = async (): Promise<void> => {
    await httpServer.stop();
    await pool.end();
    await db.close();
  };

  return {
    baseUrl: `http://localhost:${String(config.port)}/api/v1`,
    pool,
    dal: {
      findConnectedAccountByCustomerId: dal.findConnectedAccountByCustomerId,
      updateConnectedAccountStatus: dal.updateConnectedAccountStatus,
    },
    truncateConnectedAccounts,
    stop,
  };
};
