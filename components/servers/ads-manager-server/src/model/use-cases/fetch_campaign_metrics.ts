// Use-case: FR1-FR5 — the 7-step fetch/cache/fallback flow behind GET /accounts/:id/campaigns
// (SPEC.md > Technical Design > Algorithms/Business Logic):
//   1. Validate the account exists and isn't `needs_reconnect`.
//   2. If `refresh` wasn't requested and a cache entry exists with `fetched_at` inside the 15
//      minute TTL: return it (`stale: false`).
//   3. Otherwise, try the Google Ads API for the resolved date range.
//   4. Success: upsert the cache, return fresh data (`stale: false`).
//   5. Auth/token failure: call handleTokenRefreshFailure (marks the account `needs_reconnect`),
//      return a dedicated error — reusing 'account_needs_reconnect' since that's now literally
//      true and the contract has no separate code for "just failed auth mid-fetch" (see SPEC.md's
//      API Contract error table: only 4 codes exist for this endpoint).
//   6. Generic failure (rate limit, transient outage) with existing cache (even expired): return
//      it with `stale: true`.
//   7. Generic failure with no cache at all: return an error ('google_ads_api_error').
//
// The date-range validation (custom `start > end`) happens before anything else, per SPEC.md's
// Edge Cases.
import type { Dependencies } from '../dependencies';
import type { CampaignMetrics, CampaignMetricsCacheEntry, CampaignRawValues, DateRangePreset } from '../definitions';
import { calculateDerivedMetrics } from './calculate_derived_metrics';
import { handleTokenRefreshFailure } from './handle_token_refresh_failure';

// FR4: cache freshness window.
export const CACHE_TTL_MS = 15 * 60 * 1000;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PRESET_DAYS: Readonly<Record<Exclude<DateRangePreset, 'custom'>, number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export type FetchCampaignMetricsArgs = Readonly<{
  readonly accountId: string;
  readonly range: DateRangePreset;
  // Only consulted (and required) when range === 'custom'; ignored otherwise (matches the
  // OpenAPI contract's `start`/`end` query param description).
  readonly start?: string;
  readonly end?: string;
  readonly refresh: boolean;
}>;

export type FetchCampaignMetricsError =
  | 'invalid_date_range'
  | 'account_not_found'
  | 'account_needs_reconnect'
  | 'google_ads_api_error';

export type FetchCampaignMetricsResult =
  | Readonly<{
      readonly success: true;
      readonly campaigns: readonly CampaignMetrics[];
      readonly fetchedAt: Date;
      readonly stale: boolean;
    }>
  | Readonly<{ readonly success: false; readonly error: FetchCampaignMetricsError; readonly message: string }>;

type ResolvedDateRange = Readonly<{ readonly start: string; readonly end: string }>;

type ResolveDateRangeResult =
  | Readonly<{ readonly success: true; readonly range: ResolvedDateRange }>
  | Readonly<{ readonly success: false; readonly message: string }>;

const formatDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

// Pure date-range resolution: presets are computed relative to `now` (so tests can pin it via
// deps.now()); 'custom' is validated (present, well-formed, start <= end) before anything else
// runs — SPEC.md Edge Cases: "Período customizado com start > end: validação rejeita antes de
// chamar a API."
const resolveDateRange = (
  args: Readonly<{ readonly range: DateRangePreset; readonly start?: string; readonly end?: string }>,
  now: Date
): ResolveDateRangeResult => {
  if (args.range === 'custom') {
    const { start, end } = args;
    if (!start || !end || !DATE_ONLY_PATTERN.test(start) || !DATE_ONLY_PATTERN.test(end)) {
      return {
        success: false,
        message: 'Período customizado requer start e end no formato YYYY-MM-DD',
      };
    }
    if (start > end) {
      return { success: false, message: 'Data final deve ser depois da data inicial' };
    }
    return { success: true, range: { start, end } };
  }

  const days = PRESET_DAYS[args.range];
  const end = formatDateOnly(now);
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  return { success: true, range: { start: formatDateOnly(startDate), end } };
};

type CampaignIdentity = Readonly<{
  readonly googleCampaignId: string;
  readonly campaignName: string;
  readonly status: CampaignMetrics['status'];
}>;

const toCampaignMetrics = (raw: CampaignIdentity & CampaignRawValues): CampaignMetrics => ({
  campaignId: raw.googleCampaignId,
  name: raw.campaignName,
  status: raw.status,
  impressions: raw.impressions,
  clicks: raw.clicks,
  conversions: raw.conversions,
  ...calculateDerivedMetrics(raw),
});

// FR3: "Ordenadas por custo decrescente."
const sortByCostDescending = (campaigns: readonly CampaignMetrics[]): readonly CampaignMetrics[] =>
  [...campaigns].sort((a, b) => b.cost - a.cost);

// A cache write batch shares one fetched_at conceptually; take the max across rows to be robust
// to any sub-millisecond drift between individual UPSERT statements.
const latestFetchedAt = (entries: readonly CampaignMetricsCacheEntry[]): Date =>
  entries.reduce((latest, entry) => (entry.fetchedAt > latest ? entry.fetchedAt : latest), entries[0]!.fetchedAt);

export const fetchCampaignMetrics = async (
  deps: Dependencies,
  args: FetchCampaignMetricsArgs
): Promise<FetchCampaignMetricsResult> => {
  const now = deps.now();

  const resolvedRange = resolveDateRange(args, now);
  if (!resolvedRange.success) {
    deps.logger.warn({ accountId: args.accountId, range: args.range }, 'Invalid campaign date range requested');
    return { success: false, error: 'invalid_date_range', message: resolvedRange.message };
  }
  const { start: dateRangeStart, end: dateRangeEnd } = resolvedRange.range;

  // Step 1: account must exist and not be needs_reconnect.
  const account = await deps.findConnectedAccountById(args.accountId);
  if (!account) {
    return { success: false, error: 'account_not_found', message: 'Conta não encontrada' };
  }
  if (account.status === 'needs_reconnect') {
    deps.logger.info({ accountId: args.accountId }, 'Campaign fetch blocked: account needs reconnect');
    return {
      success: false,
      error: 'account_needs_reconnect',
      message: 'Esta conta precisa ser reconectada antes de ver os dados',
    };
  }

  const readCache = (): Promise<readonly CampaignMetricsCacheEntry[]> =>
    deps.findCampaignMetricsCache(args.accountId, dateRangeStart, dateRangeEnd);

  // Step 2: cache within TTL, unless refresh was explicitly requested.
  if (!args.refresh) {
    const cached = await readCache();
    if (cached.length > 0) {
      const fetchedAt = latestFetchedAt(cached);
      if (now.getTime() - fetchedAt.getTime() < CACHE_TTL_MS) {
        deps.logger.info(
          { accountId: args.accountId, dateRangeStart, dateRangeEnd },
          'Campaign metrics cache hit'
        );
        return {
          success: true,
          campaigns: sortByCostDescending(cached.map(toCampaignMetrics)),
          fetchedAt,
          stale: false,
        };
      }
    }
  }

  // Step 3: cache miss/expired/refresh — call the Google Ads API.
  const fetchResult = await deps.fetchCampaignMetricsFromGoogleAds({
    accountId: args.accountId,
    dateRangeStart,
    dateRangeEnd,
  });

  // Step 4: success — upsert cache, return fresh data.
  if (fetchResult.ok) {
    await Promise.all(
      fetchResult.campaigns.map((campaign) =>
        deps.upsertCampaignMetricsCache({
          accountId: args.accountId,
          dateRangeStart,
          dateRangeEnd,
          ...campaign,
        })
      )
    );
    deps.logger.info(
      {
        accountId: args.accountId,
        dateRangeStart,
        dateRangeEnd,
        campaignCount: fetchResult.campaigns.length,
      },
      'Campaign metrics fetched fresh from Google Ads'
    );
    return {
      success: true,
      campaigns: sortByCostDescending(fetchResult.campaigns.map(toCampaignMetrics)),
      fetchedAt: now,
      stale: false,
    };
  }

  // Step 5: auth/token failure — mark needs_reconnect, dedicated error, no cache fallback (the
  // account requires reconnection regardless of what's cached).
  if (fetchResult.kind === 'auth_failure') {
    await handleTokenRefreshFailure(deps, account.googleCustomerId);
    deps.logger.error(
      { accountId: args.accountId },
      'Campaign fetch failed due to a Google Ads authentication failure; account marked needs_reconnect'
    );
    return {
      success: false,
      error: 'account_needs_reconnect',
      message: 'A conexão com o Google Ads expirou. Reconecte a conta para continuar.',
    };
  }

  // Step 6/7: generic failure — fall back to cache (even expired) if any exists, else error.
  const fallbackCache = await readCache();
  if (fallbackCache.length > 0) {
    const fetchedAt = latestFetchedAt(fallbackCache);
    deps.logger.warn(
      { accountId: args.accountId, dateRangeStart, dateRangeEnd },
      'Campaign fetch failed; serving stale cache'
    );
    return {
      success: true,
      campaigns: sortByCostDescending(fallbackCache.map(toCampaignMetrics)),
      fetchedAt,
      stale: true,
    };
  }

  deps.logger.error(
    { accountId: args.accountId, dateRangeStart, dateRangeEnd },
    'Campaign fetch failed; no cache available to fall back to'
  );
  return {
    success: false,
    error: 'google_ads_api_error',
    message: 'Não foi possível carregar os dados desta conta agora. Tente novamente.',
  };
};
