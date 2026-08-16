// Model definitions: Campaign performance metrics domain types (campaign-performance-dashboard).
//
// These are the Model layer's OWN types — same rationale as connected_account.ts: not a re-export
// of the DAL's campaign_metrics_cache types, nor of whatever shape the google-ads-api package
// returns. The Controller is responsible for adapting both the DAL rows and the Google Ads
// adapter's results into these shapes when it builds the Dependencies object.

export type CampaignStatus = 'ENABLED' | 'PAUSED' | 'REMOVED';

export type DateRangePreset = '7d' | '30d' | '90d' | 'custom';

// Raw values a campaign's derived metrics (ctr, avg_cpc, ...) are computed from — whether they
// just came back from the Google Ads API or were read back out of the cache. Money fields
// (costMicros, budgetMicros) are in Google Ads micros (1 unit = 1,000,000 micros); calculateDerivedMetrics
// is the one place that converts them to display-ready currency units.
export type CampaignRawValues = Readonly<{
  readonly impressions: number;
  readonly clicks: number;
  readonly costMicros: number;
  readonly conversions: number;
  readonly conversionsValue: number;
  readonly budgetMicros: number | null;
}>;

// Output of calculateDerivedMetrics: FR3's computed columns, plus cost/budget already converted
// out of micros. Division-by-zero (0 clicks/conversions/cost) is always 0 here, never NaN/Infinity.
export type CampaignDerivedMetrics = Readonly<{
  readonly ctr: number;
  readonly avgCpc: number;
  readonly cost: number;
  readonly conversionRate: number;
  readonly costPerConversion: number;
  readonly roas: number;
  readonly budget: number | null;
}>;

// A single campaign, identity + raw display fields + derived metrics — the shape fetchCampaignMetrics
// returns to the Controller for a GET /accounts/:id/campaigns response.
export type CampaignMetrics = Readonly<{
  readonly campaignId: string;
  readonly name: string;
  readonly status: CampaignStatus;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
}> &
  CampaignDerivedMetrics;

// A single campaign's raw data as returned by the Google Ads adapter for one account + date
// range — not yet persisted to the cache.
export type RawCampaignMetrics = Readonly<{
  readonly googleCampaignId: string;
  readonly campaignName: string;
  readonly status: CampaignStatus;
}> &
  CampaignRawValues;

// A single cached campaign row (Model's own shape — the Controller adapts the DAL's
// CampaignMetricsCache row into this, same pattern as ConnectedAccount/DalConnectedAccount).
export type CampaignMetricsCacheEntry = Readonly<{
  readonly googleCampaignId: string;
  readonly campaignName: string;
  readonly status: CampaignStatus;
  readonly fetchedAt: Date;
}> &
  CampaignRawValues;

// Result of asking the Google Ads adapter (via Dependencies.fetchCampaignMetricsFromGoogleAds)
// for an account's campaign metrics. The 'auth_failure' / 'generic_failure' split is what lets
// fetchCampaignMetrics decide whether to call handleTokenRefreshFailure (SPEC.md step 5) or fall
// back to cache (step 6) — see create_google_ads_client.ts for how the two are told apart.
export type FetchGoogleAdsCampaignMetricsResult =
  | Readonly<{ readonly ok: true; readonly campaigns: readonly RawCampaignMetrics[] }>
  | Readonly<{ readonly ok: false; readonly kind: 'auth_failure' | 'generic_failure'; readonly message: string }>;
