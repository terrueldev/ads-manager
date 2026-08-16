// Default Vitest config: unit tests only (fast, no external dependencies). Integration tests
// (src/integration/**/*.integration.test.ts — Phase 6, against a real local Postgres) are
// deliberately excluded here so `npm test`/`vitest` never requires a database to be running; run
// them explicitly via `npm run test:integration` (vitest.integration.config.ts).
import { defineConfig } from 'vitest/config';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
