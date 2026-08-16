/// <reference types="vite/client" />

// Dev-only bootstrap override (see src/index.ts) — lets `npm run dev`/Playwright E2E point the
// webapp's ads-manager-api base_url somewhere other than the default local server port, without
// touching components/config (which drives the production/embedded-host config path instead).
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
