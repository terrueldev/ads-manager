// Model definitions: OAuth / Google Ads connection-flow domain types.

// Tokens exchanged from Google after a successful authorization code exchange.
export type OAuthTokens = Readonly<{
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly scope: string;
}>;

// Basic account metadata read from the Google Ads API for a single customer.
export type CustomerMetadata = Readonly<{
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
}>;

// One entry of the accessible-accounts list shown to the user after the OAuth callback (FR2).
export type AccessibleGoogleAdsAccount = Readonly<{
  readonly customerId: string; // formatted XXX-XXX-XXXX
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly alreadyConnected: boolean;
}>;

// Tokens + metadata stashed server-side (by handleOAuthCallback) for a single accessible
// customer_id, until connectAccounts consumes and clears them. See
// src/controller/google_ads/create_oauth_session_store.ts for the storage/design tradeoffs.
export type PendingCustomerTokens = Readonly<{
  readonly refreshToken: string;
  readonly grantedScopes: string;
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
}>;
