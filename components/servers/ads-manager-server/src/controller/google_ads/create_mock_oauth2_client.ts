// Controller adapter (test/dev only): deterministic stand-in for create_oauth2_client.ts's
// createOAuth2ClientAdapter, wired in by createController when Config.mockGoogleAds is true
// (MOCK_GOOGLE_ADS=true env var — see src/config/load_config.ts).
//
// Why this exists: there is no real Google Cloud OAuth client yet (pending manual setup, SPEC.md >
// Dependencies), so Phase 6 (Integration & E2E Testing) needs a way to drive the FULL flow —
// GET /oauth/google-ads/start -> browser navigation -> GET /oauth/google-ads/callback ->
// POST /accounts — deterministically and offline, through the real HTTP server and real Postgres,
// with only the Google-facing boundary faked.
//
// buildAuthorizationUrl simulates what Google's consent screen would otherwise do: redirect the
// browser straight back to `redirectUri` with a `code`/`state` pair. Since redirectUri points at
// the webapp's own `/contas/callback` route (see components/config/envs/default/config.yaml), a
// real browser (Playwright) clicking "Conectar conta" lands directly back in the SPA with a valid
// mock code — no real Google interaction at any point.
import type { OAuthTokens } from '../../model';
import type { GoogleOAuthConfig, OAuth2ClientAdapter } from './create_oauth2_client';

export const MOCK_OAUTH_CODE = 'mock-auth-code';
export const MOCK_ACCESS_TOKEN = 'mock-access-token';
export const MOCK_REFRESH_TOKEN = 'mock-refresh-token';
export const MOCK_OAUTH_SCOPE = 'https://www.googleapis.com/auth/adwords';

export const createMockOAuth2ClientAdapter = (config: GoogleOAuthConfig): OAuth2ClientAdapter => {
  const buildAuthorizationUrl = (state: string): string => {
    const url = new URL(config.redirectUri);
    url.searchParams.set('code', MOCK_OAUTH_CODE);
    url.searchParams.set('state', state);
    return url.toString();
  };

  const exchangeCode = async (code: string): Promise<OAuthTokens> => {
    if (code !== MOCK_OAUTH_CODE) {
      throw new Error(`createMockOAuth2ClientAdapter: unexpected code "${code}" (expected "${MOCK_OAUTH_CODE}")`);
    }
    return {
      accessToken: MOCK_ACCESS_TOKEN,
      refreshToken: MOCK_REFRESH_TOKEN,
      scope: MOCK_OAUTH_SCOPE,
    };
  };

  return { buildAuthorizationUrl, exchangeCode };
};
