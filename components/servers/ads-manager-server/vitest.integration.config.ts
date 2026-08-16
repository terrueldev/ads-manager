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
  },
});
