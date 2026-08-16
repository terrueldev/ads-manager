// Controller adapter: wraps the `google-ads-api` package (Opteo's community client) with the two
// operations the Model use-cases need — listAccessibleCustomerIds and fetchCustomerMetadata —
// configured from Config's `googleOAuth` (client id/secret, shared with the OAuth adapter — same
// Google Cloud OAuth app) and `googleAds` (developer token) sections.
//
// The raw `resource_names` → customer_id parsing is delegated to the pure Model helper
// `parseAccessibleCustomerIds` (src/model/use-cases/parse_accessible_customer_ids.ts) so that
// logic stays independently unit-tested without mocking this package at all.
import { GoogleAdsApi } from 'google-ads-api';
import { parseAccessibleCustomerIds, type CampaignStatus, type CustomerMetadata, type RawCampaignMetrics } from '../../model';

export type GoogleAdsClientConfig = Readonly<{
  readonly clientId: string;
  readonly clientSecret: string;
  readonly developerToken: string;
}>;

export type GoogleAdsClientAdapter = Readonly<{
  readonly listAccessibleCustomerIds: (refreshToken: string) => Promise<readonly string[]>;
  readonly fetchCustomerMetadata: (customerId: string, refreshToken: string) => Promise<CustomerMetadata>;
  readonly fetchCampaignMetrics: (
    customerId: string,
    refreshToken: string,
    dateRangeStart: string,
    dateRangeEnd: string
  ) => Promise<readonly RawCampaignMetrics[]>;
}>;

// Thrown by fetchCampaignMetrics (instead of a plain Error) when the underlying failure is an
// authentication/authorization problem with the refresh token itself, rather than a transient or
// rate-limit failure — see isGoogleAdsAuthFailure below for how the two are told apart. This is
// the first adapter method that needs the distinction (campaign-performance-dashboard is the
// first consumer to wire handleTokenRefreshFailure — see SPEC.md > Algorithms/Business Logic,
// step 5): only an auth failure should flip the account to needs_reconnect; a rate limit or a
// transient Google outage must not.
export class GoogleAdsAuthenticationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'GoogleAdsAuthenticationError';
  }
}

// Loose shape of a google-ads-api `errors.GoogleAdsFailure` (thrown by Customer#query on a
// GoogleAdsError response — see google-ads-api's customer.js). Each entry's error_code has
// exactly one non-null key identifying the failure category; authentication_error/
// authorization_error are Google's categories for "this credential can no longer be used"
// (revoked/expired/insufficient-scope), as opposed to e.g. quota_error (rate limit) or
// internal_error (transient).
type GoogleAdsFailureLike = Readonly<{
  readonly errors?: ReadonlyArray<
    Readonly<{
      readonly error_code?: Readonly<{
        readonly authentication_error?: unknown;
        readonly authorization_error?: unknown;
      }>;
    }>
  >;
}>;

const isAuthRelatedGoogleAdsFailure = (err: unknown): boolean => {
  const failure = err as GoogleAdsFailureLike | undefined;
  return Boolean(
    failure?.errors?.some(
      (e) => e.error_code?.authentication_error != null || e.error_code?.authorization_error != null
    )
  );
};

// A revoked/expired refresh token can also fail earlier than any GoogleAdsFailure — at the OAuth
// token-exchange step inside google-auth-library, before the Google Ads API is even reached.
// google-auth-library surfaces that as a Gaxios-style error with response.data.error ===
// 'invalid_grant' (the standard OAuth2 error code for a bad/revoked/expired refresh token).
const isInvalidGrantError = (err: unknown): boolean => {
  const gaxiosError = err as Readonly<{ response?: { data?: { error?: string } } }> | undefined;
  return gaxiosError?.response?.data?.error === 'invalid_grant';
};

export const isGoogleAdsAuthFailure = (err: unknown): boolean =>
  isAuthRelatedGoogleAdsFailure(err) || isInvalidGrantError(err);

const CUSTOMER_METADATA_QUERY =
  'SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1';

// GAQL for FR3's campaign performance table. campaign_budget.amount_micros assumes a per-campaign
// budget (SPEC.md > Gaps & Assumptions flags shared budget groups as a follow-up if the test
// account uses one — google-ads-api still returns the linked budget's amount here either way).
const buildCampaignMetricsQuery = (dateRangeStart: string, dateRangeEnd: string): string =>
  `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, ` +
  `metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value ` +
  `FROM campaign WHERE segments.date BETWEEN '${dateRangeStart}' AND '${dateRangeEnd}'`;

const VALID_CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['ENABLED', 'PAUSED', 'REMOVED'];

// google-ads-api (like the underlying Google Ads API GAQL search results) returns enum fields —
// including campaign.status — as their NUMERIC code, not the human-readable name, unless the
// query explicitly resolves enums to strings. CampaignStatusEnum.CampaignStatus is a stable part
// of the Google Ads API surface: 0=UNSPECIFIED, 1=UNKNOWN, 2=ENABLED, 3=PAUSED, 4=REMOVED.
// See https://developers.google.com/google-ads/api/reference/rpc/latest/CampaignStatusEnum.CampaignStatus
const CAMPAIGN_STATUS_BY_CODE: Readonly<Record<number, CampaignStatus>> = {
  2: 'ENABLED',
  3: 'PAUSED',
  4: 'REMOVED',
};

// Any campaign.status the API returns outside the 3 tracked by the cache/contract (e.g. an
// UNKNOWN/UNSPECIFIED sentinel) falls back to PAUSED — "not actively spending, not deleted" is
// the safer default of the three for a status the UI has no dedicated treatment for.
const toCampaignStatus = (status: string | number | null | undefined): CampaignStatus => {
  if (typeof status === 'number') {
    return CAMPAIGN_STATUS_BY_CODE[status] ?? 'PAUSED';
  }
  if (typeof status === 'string') {
    if ((VALID_CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
      return status as CampaignStatus;
    }
    // Some google-ads-api configurations return the numeric code as a string (e.g. "2").
    const parsed = Number(status);
    if (Number.isInteger(parsed)) {
      return CAMPAIGN_STATUS_BY_CODE[parsed] ?? 'PAUSED';
    }
  }
  return 'PAUSED';
};

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Loose shape of the GAQL row returned for buildCampaignMetricsQuery — google-ads-api's
// IGoogleAdsRow types every resource/segment field as optional, mirroring fetchCustomerMetadata's
// row.customer? handling above.
type CampaignMetricsRow = Readonly<{
  readonly campaign?: Readonly<{
    readonly id?: string | number | null;
    readonly name?: string | null;
    readonly status?: string | number | null;
  }> | null;
  readonly campaign_budget?: Readonly<{ readonly amount_micros?: string | number | null }> | null;
  readonly metrics?: Readonly<{
    readonly impressions?: string | number | null;
    readonly clicks?: string | number | null;
    readonly cost_micros?: string | number | null;
    readonly conversions?: string | number | null;
    readonly conversions_value?: string | number | null;
  }> | null;
}>;

const mapRowToRawCampaignMetrics = (row: CampaignMetricsRow): RawCampaignMetrics => {
  const campaignId = row.campaign?.id;
  if (campaignId === null || campaignId === undefined) {
    throw new Error('fetchCampaignMetrics: campaign row missing campaign.id');
  }
  return {
    googleCampaignId: String(campaignId),
    campaignName: row.campaign?.name ?? '',
    status: toCampaignStatus(row.campaign?.status),
    impressions: toNumber(row.metrics?.impressions),
    clicks: toNumber(row.metrics?.clicks),
    costMicros: toNumber(row.metrics?.cost_micros),
    conversions: toNumber(row.metrics?.conversions),
    conversionsValue: toNumber(row.metrics?.conversions_value),
    budgetMicros:
      row.campaign_budget?.amount_micros === null || row.campaign_budget?.amount_micros === undefined
        ? null
        : toNumber(row.campaign_budget.amount_micros),
  };
};

export const createGoogleAdsClientAdapter = (config: GoogleAdsClientConfig): GoogleAdsClientAdapter => {
  const client = new GoogleAdsApi({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    developer_token: config.developerToken,
  });

  const listAccessibleCustomerIds = async (refreshToken: string): Promise<readonly string[]> => {
    const response = await client.listAccessibleCustomers(refreshToken);
    return parseAccessibleCustomerIds(response.resource_names ?? []);
  };

  const fetchCustomerMetadata = async (customerId: string, refreshToken: string): Promise<CustomerMetadata> => {
    const rawCustomerId = customerId.replace(/-/g, '');
    const customer = client.Customer({ customer_id: rawCustomerId, refresh_token: refreshToken });
    // NOTE: sub-accounts under an MCC may require `login_customer_id` (the manager account id) to
    // be set on this call for Google to authorize it — not wired here, since exercising it needs a
    // real MCC + approved developer token (pending manual setup, see SPEC.md > Dependencies). If
    // metadata fetches for MCC sub-accounts fail with a permission error once real credentials
    // exist, that's the first place to look.
    const rows = await customer.query(CUSTOMER_METADATA_QUERY);
    const row = rows[0];
    if (!row?.customer) {
      throw new Error(`fetchCustomerMetadata: no customer row returned for ${customerId}`);
    }
    return {
      accountName: row.customer.descriptive_name ?? '',
      currencyCode: row.customer.currency_code ?? '',
      timezone: row.customer.time_zone ?? '',
    };
  };

  const fetchCampaignMetrics = async (
    customerId: string,
    refreshToken: string,
    dateRangeStart: string,
    dateRangeEnd: string
  ): Promise<readonly RawCampaignMetrics[]> => {
    const rawCustomerId = customerId.replace(/-/g, '');
    const customer = client.Customer({ customer_id: rawCustomerId, refresh_token: refreshToken });
    try {
      const rows = await customer.query<readonly CampaignMetricsRow[]>(
        buildCampaignMetricsQuery(dateRangeStart, dateRangeEnd)
      );
      return rows.map(mapRowToRawCampaignMetrics);
    } catch (err) {
      if (isGoogleAdsAuthFailure(err)) {
        throw new GoogleAdsAuthenticationError(
          `Google Ads authentication failed for customer ${customerId}`,
          err
        );
      }
      throw err;
    }
  };

  return { listAccessibleCustomerIds, fetchCustomerMetadata, fetchCampaignMetrics };
};
