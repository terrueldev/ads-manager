// Model Dependencies: everything the use-cases in src/model/use-cases/ need injected.
// The Controller wires these (DAL functions bound by the Operator + domain-specific OAuth/Google
// Ads adapters it builds from Config) — see src/controller/create_controller.ts.
import type { Logger } from './logger';
import type {
  ConnectedAccount,
  ConnectedAccountStatus,
  CreateConnectedAccountInput,
  CustomerMetadata,
  OAuthTokens,
  PendingCustomerTokens,
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
}>;
