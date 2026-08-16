// Controller: Assembles routers and creates the Model Dependencies object.
// Combines the raw I/O the Operator handed it (bound DAL functions) with Config (URLs/secrets) to
// build the domain-specific operations Model needs — the OAuth2 client, the Google Ads API
// client, the OAuth session store, and token encryption bound to the configured key.
import type { Router } from 'express';
import { Router as createRouter } from 'express';
import type {
  CampaignMetricsCache as DalCampaignMetricsCache,
  ConnectedAccount as DalConnectedAccount,
  ConnectedAccountStatus,
  CreateConnectedAccountInput as DalCreateConnectedAccountInput,
  UpsertCampaignMetricsInput as DalUpsertCampaignMetricsInput,
} from '../dal';
import type { Config } from '../config';
import type {
  CampaignMetricsCacheEntry,
  Dependencies,
  FetchGoogleAdsCampaignMetricsResult,
  Logger,
  ConnectedAccount as ModelConnectedAccount,
} from '../model';
import { encryptRefreshToken, decryptRefreshToken } from '../model';
import {
  createOAuth2ClientAdapter,
  createGoogleAdsClientAdapter,
  createOAuthSessionStore,
  createMockOAuth2ClientAdapter,
  createMockGoogleAdsClientAdapter,
  GoogleAdsAuthenticationError,
} from './google_ads';
import { createOAuthRouter, createAccountsRouter, createCampaignsRouter } from './http_handlers';

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
    readonly findCampaignMetricsByAccountAndRange: (
      connectedAccountId: string,
      dateRangeStart: string,
      dateRangeEnd: string
    ) => Promise<readonly DalCampaignMetricsCache[]>;
    readonly upsertCampaignMetrics: (input: DalUpsertCampaignMetricsInput) => Promise<DalCampaignMetricsCache>;
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

// Adapts a DAL row-mapped CampaignMetricsCache into the Model's own CampaignMetricsCacheEntry —
// same "Controller adapts DAL shapes into Model's own types" pattern as toModelConnectedAccount
// above; drops the id/connectedAccountId/dateRangeStart/dateRangeEnd fields the Model use-case
// doesn't need (it already knows the account id and date range it queried for).
const toModelCampaignMetricsCacheEntry = (row: DalCampaignMetricsCache): CampaignMetricsCacheEntry => ({
  googleCampaignId: row.googleCampaignId,
  campaignName: row.campaignName,
  status: row.status,
  impressions: row.impressions,
  clicks: row.clicks,
  costMicros: row.costMicros,
  conversions: row.conversions,
  conversionsValue: row.conversionsValue,
  budgetMicros: row.budgetMicros,
  fetchedAt: row.fetchedAt,
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

    findCampaignMetricsCache: async (accountId, dateRangeStart, dateRangeEnd) => {
      const rows = await dal.findCampaignMetricsByAccountAndRange(accountId, dateRangeStart, dateRangeEnd);
      return rows.map(toModelCampaignMetricsCacheEntry);
    },
    upsertCampaignMetricsCache: async (input) => {
      await dal.upsertCampaignMetrics({
        connectedAccountId: input.accountId,
        googleCampaignId: input.googleCampaignId,
        campaignName: input.campaignName,
        status: input.status,
        dateRangeStart: input.dateRangeStart,
        dateRangeEnd: input.dateRangeEnd,
        impressions: input.impressions,
        clicks: input.clicks,
        costMicros: input.costMicros,
        conversions: input.conversions,
        conversionsValue: input.conversionsValue,
        budgetMicros: input.budgetMicros,
      });
    },

    // Looks up the account's encrypted refresh token directly via the raw DAL (never through
    // findConnectedAccountById above, whose Model-facing ConnectedAccount deliberately excludes
    // the token — see connected_account.ts) and classifies the adapter's failure into
    // 'auth_failure' vs 'generic_failure' so fetchCampaignMetrics can decide whether to call
    // handleTokenRefreshFailure without needing to know anything about google-ads-api's error
    // shapes itself (SPEC.md > Algorithms/Business Logic, steps 5-6).
    fetchCampaignMetricsFromGoogleAds: async ({
      accountId,
      dateRangeStart,
      dateRangeEnd,
    }): Promise<FetchGoogleAdsCampaignMetricsResult> => {
      const account = await dal.findConnectedAccountById(accountId);
      if (!account) {
        return { ok: false, kind: 'generic_failure', message: `Connected account not found: ${accountId}` };
      }
      try {
        const refreshToken = decryptRefreshToken(config.tokenEncryptionKey, account.oauthRefreshTokenEncrypted);
        const campaigns = await googleAdsClient.fetchCampaignMetrics(
          account.googleCustomerId,
          refreshToken,
          dateRangeStart,
          dateRangeEnd
        );
        return { ok: true, campaigns };
      } catch (err) {
        const kind = err instanceof GoogleAdsAuthenticationError ? 'auth_failure' : 'generic_failure';
        logger.warn({ err, accountId, kind }, 'Failed to fetch campaign metrics from Google Ads');
        return {
          ok: false,
          kind,
          message:
            kind === 'auth_failure'
              ? 'Google Ads authentication failed'
              : 'Google Ads API request failed',
        };
      }
    },

    now: () => new Date(),
  };

  const router = createRouter();
  router.use(createOAuthRouter({ modelDeps }));
  router.use(createAccountsRouter({ modelDeps }));
  router.use(createCampaignsRouter({ modelDeps }));

  return { router };
};
