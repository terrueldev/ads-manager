// Controller adapter: wraps google-auth-library's OAuth2Client with the two operations the Model
// use-cases need (buildAuthorizationUrl, exchangeCode), configured from Config's `googleOAuth`
// section. This is exactly the "Controller combines I/O + config to create domain-specific
// operations" pattern from backend-standards — Model never imports google-auth-library directly.
import { OAuth2Client } from 'google-auth-library';
import type { OAuthTokens } from '../../model';

// Google Ads API OAuth scope (SPEC.md FR1 / Technical Design).
export const GOOGLE_ADS_OAUTH_SCOPE = 'https://www.googleapis.com/auth/adwords';

export type GoogleOAuthConfig = Readonly<{
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}>;

export type OAuth2ClientAdapter = Readonly<{
  readonly buildAuthorizationUrl: (state: string) => string;
  readonly exchangeCode: (code: string) => Promise<OAuthTokens>;
}>;

export const createOAuth2ClientAdapter = (config: GoogleOAuthConfig): OAuth2ClientAdapter => {
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });

  const buildAuthorizationUrl = (state: string): string =>
    client.generateAuthUrl({
      access_type: 'offline', // required to receive a refresh_token (FR3: tokens persisted for later use)
      prompt: 'consent',
      scope: [GOOGLE_ADS_OAUTH_SCOPE],
      state,
    });

  const exchangeCode = async (code: string): Promise<OAuthTokens> => {
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      // Google omits refresh_token when the user already granted consent before and
      // access_type=offline + prompt=consent wasn't honored for some reason — surface as a clear
      // error rather than persisting an incomplete/unusable token set.
      throw new Error(
        'Google OAuth token exchange did not return both access_token and refresh_token'
      );
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope ?? GOOGLE_ADS_OAUTH_SCOPE,
    };
  };

  return { buildAuthorizationUrl, exchangeCode };
};
