// Vitest config for integration tests only (Phase 6 — Integration & E2E Testing). These hit a
// real local Postgres (see src/integration/test_env.ts / components/databases/ads-manager-db's
// README "Local Integration Test Database" section for how to start it) — run them via
// `npm run test:integration`, never as part of the default `npm test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/integration/**/*.integration.test.ts'],
    // Real network calls to a real (if local) Postgres — a bit more headroom than the in-memory
    // unit test default.
    testTimeout: 15000,
    hookTimeout: 15000,
    // Every *.integration.test.ts file calls test_env.ts's startTestServer(), which binds a real
    // HTTP server to a fixed port (TEST_SERVER_PORT/TEST_PROBES_PORT — see test_env.ts). Vitest
    // runs separate test files in parallel by default, which would make two integration test
    // files race for the same port (EADDRINUSE) now that there's more than one
    // (campaign_performance_dashboard.integration.test.ts alongside
    // google_ads_connection.integration.test.ts). Forcing sequential file execution keeps the
    // fixed-port test server (and shared Postgres state) simple, which matters more here than
    // parallel speed for a small, local dev-loop suite.
    fileParallelism: false,
  },
});
