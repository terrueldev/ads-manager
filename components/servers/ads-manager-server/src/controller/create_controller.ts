// Controller: Assembles routers and creates the Model Dependencies object.
// Combines the raw I/O the Operator handed it (bound DAL functions) with Config (URLs/secrets) to
// build the domain-specific operations Model needs — the OAuth2 client, the Google Ads API
// client, the OAuth session store, and token encryption bound to the configured key.
import type { Router } from 'express';
import { Router as createRouter } from 'express';
import type {
  ConnectedAccount as DalConnectedAccount,
  ConnectedAccountStatus,
  CreateConnectedAccountInput as DalCreateConnectedAccountInput,
} from '../dal';
import type { Config } from '../config';
import type { Dependencies, Logger, ConnectedAccount as ModelConnectedAccount } from '../model';
import { encryptRefreshToken } from '../model';
import {
  createOAuth2ClientAdapter,
  createGoogleAdsClientAdapter,
  createOAuthSessionStore,
  createMockOAuth2ClientAdapter,
  createMockGoogleAdsClientAdapter,
} from './google_ads';
import { createOAuthRouter, createAccountsRouter } from './http_handlers';

export type ControllerDependencies = Readonly<{
  readonly config: Config;
  readonly logger: Logger;
  readonly dal: Readonly<{
    readonly findConnectedAccountByCustomerId: (customerId: string) => Promise<DalConnectedAccount | null>;
    readonly findConnectedAccountById: (id: string) => Promise<DalConnectedAccount | null>;
    readonly findAllConnectedAccounts: () => Promise<readonly DalConnectedAccount[]>;
    readonly createConnectedAccount: (input: DalCreateConnectedAccountInput) => Promise<DalConnectedAccount>;
    readonly deleteConnectedAccount: (id: string) => Promise<boolean>;
    readonly updateConnectedAccountStatus: (
      id: string,
      status: ConnectedAccountStatus
    ) => Promise<DalConnectedAccount | null>;
    readonly reconnectConnectedAccount: (
      id: string,
      input: Readonly<{
        readonly accountName: string;
        readonly currencyCode: string;
        readonly timezone: string;
        readonly oauthRefreshTokenEncrypted: string;
        readonly grantedScopes: string;
      }>
    ) => Promise<DalConnectedAccount | null>;
  }>;
}>;

export type Controller = {
  readonly router: Router;
};

// Adapts a DAL row-mapped ConnectedAccount into the Model's own ConnectedAccount type — strips
// oauthRefreshTokenEncrypted/grantedScopes at this exact boundary, so nothing above the DAL layer
// (Model, Controller response mapping) can ever accidentally read or forward the encrypted token.
const toModelConnectedAccount = (account: DalConnectedAccount): ModelConnectedAccount => ({
  id: account.id,
  googleCustomerId: account.googleCustomerId,
  accountName: account.accountName,
  currencyCode: account.currencyCode,
  timezone: account.timezone,
  status: account.status,
  connectedAt: account.connectedAt,
});

export const createController = (deps: ControllerDependencies): Controller => {
  const { config, logger, dal } = deps;

  // config.mockGoogleAds (MOCK_GOOGLE_ADS env var, Phase 6 — Integration & E2E Testing only):
  // swaps in deterministic offline adapters instead of the real google-auth-library/google-ads-api
  // ones. See src/controller/google_ads/create_mock_oauth2_client.ts for why — no real Google
  // Cloud OAuth client/developer token exists yet (pending manual setup, SPEC.md > Dependencies).
  // Defaults to false, so production/normal-dev wiring is unchanged.
  const oauth2Client = config.mockGoogleAds
    ? createMockOAuth2ClientAdapter(config.googleOAuth)
    : createOAuth2ClientAdapter(config.googleOAuth);
  const googleAdsClient = config.mockGoogleAds
    ? createMockGoogleAdsClientAdapter()
    : createGoogleAdsClientAdapter({
        clientId: config.googleOAuth.clientId,
        clientSecret: config.googleOAuth.clientSecret,
        developerToken: config.googleAds.developerToken,
      });
  const sessionStore = createOAuthSessionStore();

  const modelDeps: Dependencies = {
    logger,

    generateOAuthState: sessionStore.generateState,
    saveOAuthState: sessionStore.saveState,
    consumeOAuthState: sessionStore.consumeState,
    savePendingTokens: sessionStore.savePendingTokens,
    getPendingTokens: sessionStore.getPendingTokens,
    clearPendingTokens: sessionStore.clearPendingTokens,

    buildAuthorizationUrl: oauth2Client.buildAuthorizationUrl,
    exchangeOAuthCode: oauth2Client.exchangeCode,

    listAccessibleCustomerIds: googleAdsClient.listAccessibleCustomerIds,
    fetchCustomerMetadata: googleAdsClient.fetchCustomerMetadata,

    encryptRefreshToken: (plainRefreshToken: string) => encryptRefreshToken(config.tokenEncryptionKey, plainRefreshToken),

    findConnectedAccountByCustomerId: async (customerId) => {
      const account = await dal.findConnectedAccountByCustomerId(customerId);
      return account ? toModelConnectedAccount(account) : null;
    },
    findConnectedAccountById: async (id) => {
      const account = await dal.findConnectedAccountById(id);
      return account ? toModelConnectedAccount(account) : null;
    },
    findAllConnectedAccounts: async () => {
      const accounts = await dal.findAllConnectedAccounts();
      return accounts.map(toModelConnectedAccount);
    },
    createConnectedAccount: async (input) => {
      const account = await dal.createConnectedAccount(input);
      return toModelConnectedAccount(account);
    },
    deleteConnectedAccount: dal.deleteConnectedAccount,
    updateConnectedAccountStatus: async (id, status) => {
      const account = await dal.updateConnectedAccountStatus(id, status);
      return account ? toModelConnectedAccount(account) : null;
    },
    reconnectConnectedAccount: async (id, input) => {
      const account = await dal.reconnectConnectedAccount(id, input);
      return account ? toModelConnectedAccount(account) : null;
    },
  };

  const router = createRouter();
  router.use(createOAuthRouter({ modelDeps }));
  router.use(createAccountsRouter({ modelDeps }));

  return { router };
};
