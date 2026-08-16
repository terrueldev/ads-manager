// DAL types for campaign_metrics_cache: domain type + DB row shape + row->domain mapping
// snake_case (SQL columns) <-> camelCase (domain type) mapping lives here so every
// DAL function in this module maps consistently.

export type CampaignMetricsCacheStatus = 'ENABLED' | 'PAUSED' | 'REMOVED';

export type CampaignMetricsCache = Readonly<{
  readonly id: string;
  readonly connectedAccountId: string;
  readonly googleCampaignId: string;
  readonly campaignName: string;
  readonly status: CampaignMetricsCacheStatus;
  readonly dateRangeStart: string;
  readonly dateRangeEnd: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly costMicros: number;
  readonly conversions: number;
  readonly conversionsValue: number;
  readonly budgetMicros: number | null;
  readonly fetchedAt: Date;
}>;

// Raw row shape as returned by `campaign_metrics_cache` queries (snake_case columns).
// BIGINT/NUMERIC columns come back from `pg` as strings by default; kept as `string`
// here and parsed to `number` in the row->domain mapper. DATE columns come back as
// JS `Date` objects (pg's default parser, midnight UTC) and are formatted to
// `YYYY-MM-DD` strings in the mapper for a stable, timezone-unambiguous domain shape.
export type CampaignMetricsCacheRow = Readonly<{
  readonly id: string;
  readonly connected_account_id: string;
  readonly google_campaign_id: string;
  readonly campaign_name: string;
  readonly status: string;
  readonly date_range_start: Date;
  readonly date_range_end: Date;
  readonly impressions: string;
  readonly clicks: string;
  readonly cost_micros: string;
  readonly conversions: string;
  readonly conversions_value: string;
  readonly budget_micros: string | null;
  readonly fetched_at: Date;
}>;

const formatDateOnly = (date: Date): string => {
  const iso = date.toISOString();
  const datePart = iso.slice(0, 10);
  return datePart;
};

export const mapRowToCampaignMetricsCache = (
  row: CampaignMetricsCacheRow
): CampaignMetricsCache => ({
  id: row.id,
  connectedAccountId: row.connected_account_id,
  googleCampaignId: row.google_campaign_id,
  campaignName: row.campaign_name,
  status: row.status as CampaignMetricsCacheStatus,
  dateRangeStart: formatDateOnly(row.date_range_start),
  dateRangeEnd: formatDateOnly(row.date_range_end),
  impressions: Number(row.impressions),
  clicks: Number(row.clicks),
  costMicros: Number(row.cost_micros),
  conversions: Number(row.conversions),
  conversionsValue: Number(row.conversions_value),
  budgetMicros: row.budget_micros === null ? null : Number(row.budget_micros),
  fetchedAt: row.fetched_at,
});

// Columns selected by every read query, kept in one place so all queries return
// a shape compatible with CampaignMetricsCacheRow.
export const CAMPAIGN_METRICS_CACHE_COLUMNS = `
  id,
  connected_account_id,
  google_campaign_id,
  campaign_name,
  status,
  date_range_start,
  date_range_end,
  impressions,
  clicks,
  cost_micros,
  conversions,
  conversions_value,
  budget_micros,
  fetched_at
`;
