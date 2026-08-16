import './index.css';
import { mount } from './main';
import type { WebappConfig } from '@ads-manager/config/types';

(window as unknown as Record<string, unknown>).__webapp_start__ = mount;

// Dev-only convenience bootstrap: in production this bundle is embedded by some other host, which
// is expected to call `window.__webapp_start__(elementId, config)` itself once it has resolved a
// real WebappConfig (see components/config). Under `vite`/`vite dev`, though, nothing else calls
// it — so `npm run dev` would otherwise just render an empty <div id="root">. Auto-mounting here,
// gated on `import.meta.env.DEV` (statically false in production builds, so this branch is
// tree-shaken out of `vite build`), makes local dev and Playwright E2E runs work the same way a
// real embedding host would, pointed at VITE_API_BASE_URL (defaults to the local server's default
// port from components/config/envs/default/config.yaml).
if (import.meta.env.DEV) {
  const devConfig: WebappConfig = {
    apis: {
      'ads-manager-api': {
        base_url: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
      },
    },
  };
  mount('root', devConfig);
}
