import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import type { WebappConfig } from '@ads-manager/config/types';

export const mount = (elementId: string, config: WebappConfig): void => {
  if (typeof elementId !== 'string' || elementId.length === 0) {
    throw new Error('mount() requires a non-empty elementId string');
  }
  // mount() is exposed on `window.__webapp_start__` (see src/index.ts) as a public boundary
  // callable from plain JS/HTML embedding this bundle, where the WebappConfig type isn't enforced
  // at runtime.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (config == null || typeof config !== 'object') {
    throw new Error('mount() requires a non-null config object');
  }

  const root = document.getElementById(elementId);
  if (!root) throw new Error(`Element #${elementId} not found`);

  createRoot(root).render(
    <StrictMode>
      <App config={config} />
    </StrictMode>,
  );
};
