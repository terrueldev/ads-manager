// Model Dependencies: everything the use-cases in src/model/use-cases/ need injected.
// The Controller wires these (DAL functions bound by the Operator + domain-specific OAuth/Google
// Ads adapters it builds from Config) — see src/controller/create_controller.ts.
import type { Logger } from './logger';
import type {
  CampaignMetricsCacheEntry,
  ConnectedAccount,
  ConnectedAccountStatus,
  CreateConnectedAccountInput,
  CustomerMetadata,
  FetchGoogleAdsCampaignMetricsResult,
  OAuthTokens,
  PendingCustomerTokens,
  RawCampaignMetrics,
} from './definitions';

export type Dependencies = Readonly<{
  readonly logger: Logger;

  // --- OAuth CSRF state + callback→connect token handoff ---
  // See src/controller/google_ads/create_oauth_session_store.ts for what backs these and why.
  readonly generateOAuthState: () => string;
  readonly saveOAuthState: (state: string) => void;
  // Validates AND consumes (single-use) the state in one step; false if missing/unknown/expired.
  readonly consumeOAuthState: (state: string | undefined) => boolean;
  readonly savePendingTokens: (customerId: string, tokens: PendingCustomerTokens) => void;
  readonly getPendingTokens: (customerId: string) => PendingCustomerTokens | undefined;
  readonly clearPendingTokens: (customerId: string) => void;

  // --- Google OAuth 2.0 (google-auth-library, wrapped in src/controller/google_ads/) ---
  readonly buildAuthorizationUrl: (state: string) => string;
  readonly exchangeOAuthCode: (code: string) => Promise<OAuthTokens>;

  // --- Google Ads API (google-ads-api, wrapped in src/controller/google_ads/) ---
  readonly listAccessibleCustomerIds: (refreshToken: string) => Promise<readonly string[]>;
  readonly fetchCustomerMetadata: (customerId: string, refreshToken: string) => Promise<CustomerMetadata>;

  // --- Token encryption (src/model/token_crypto.ts, keyed by Config's tokenEncryptionKey) ---
  readonly encryptRefreshToken: (plainRefreshToken: string) => string;

  // --- DAL (bound to the db connection by the Operator; see src/dal/connected_accounts) ---
  readonly findConnectedAccountByCustomerId: (customerId: string) => Promise<ConnectedAccount | null>;
  readonly findConnectedAccountById: (id: string) => Promise<ConnectedAccount | null>;
  readonly findAllConnectedAccounts: () => Promise<readonly ConnectedAccount[]>;
  readonly createConnectedAccount: (input: CreateConnectedAccountInput) => Promise<ConnectedAccount>;
  readonly deleteConnectedAccount: (id: string) => Promise<boolean>;
  readonly updateConnectedAccountStatus: (
    id: string,
    status: ConnectedAccountStatus
  ) => Promise<ConnectedAccount | null>;
  readonly reconnectConnectedAccount: (
    id: string,
    input: Readonly<{
      readonly accountName: string;
      readonly currencyCode: string;
      readonly timezone: string;
      readonly oauthRefreshTokenEncrypted: string;
      readonly grantedScopes: string;
    }>
  ) => Promise<ConnectedAccount | null>;

  // --- Campaign metrics cache (DAL, bound to the db connection by the Operator; see
  // src/dal/campaign_metrics_cache) ---
  readonly findCampaignMetricsCache: (
    accountId: string,
    dateRangeStart: string,
    dateRangeEnd: string
  ) => Promise<readonly CampaignMetricsCacheEntry[]>;
  readonly upsertCampaignMetricsCache: (
    input: Readonly<{
      readonly accountId: string;
      readonly dateRangeStart: string;
      readonly dateRangeEnd: string;
    }> &
      RawCampaignMetrics
  ) => Promise<void>;

  // --- Google Ads API: campaign metrics (src/controller/google_ads/create_google_ads_client.ts).
  // Returns a discriminated result (rather than throwing) so fetchCampaignMetrics can decide,
  // without a try/catch, whether to call handleTokenRefreshFailure (auth_failure) or fall back to
  // cache (generic_failure) — see SPEC.md's Algorithms/Business Logic steps 5-6. ---
  readonly fetchCampaignMetricsFromGoogleAds: (
    args: Readonly<{
      readonly accountId: string;
      readonly dateRangeStart: string;
      readonly dateRangeEnd: string;
    }>
  ) => Promise<FetchGoogleAdsCampaignMetricsResult>;

  // --- Clock, overridable in tests for deterministic TTL/date-range assertions ---
  readonly now: () => Date;
}>;
