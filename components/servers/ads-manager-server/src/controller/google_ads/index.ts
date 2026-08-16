// Controller google_ads adapters index - exports only
export { createOAuthSessionStore } from './create_oauth_session_store';
export type { OAuthSessionStore } from './create_oauth_session_store';

export { createOAuth2ClientAdapter, GOOGLE_ADS_OAUTH_SCOPE } from './create_oauth2_client';
export type { GoogleOAuthConfig, OAuth2ClientAdapter } from './create_oauth2_client';

export {
  createGoogleAdsClientAdapter,
  GoogleAdsAuthenticationError,
  isGoogleAdsAuthFailure,
} from './create_google_ads_client';
export type { GoogleAdsClientConfig, GoogleAdsClientAdapter } from './create_google_ads_client';

// Test/dev-only deterministic adapters — see create_mock_oauth2_client.ts for why they exist.
export { createMockOAuth2ClientAdapter } from './create_mock_oauth2_client';
export { createMockGoogleAdsClientAdapter } from './create_mock_google_ads_client';
