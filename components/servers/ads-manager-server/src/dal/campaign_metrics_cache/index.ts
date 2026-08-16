// DAL: campaign_metrics_cache — re-exports only (barrel), no logic here.
// Grouped in this subdirectory because all functions share the campaign_metrics_cache
// table, row mapping, and column list (see backend-standards: subdirectories are
// allowed for DAL when explicitly grouping data access for a single table).
export {
  upsertCampaignMetrics,
  type UpsertCampaignMetricsInput,
} from './upsert_campaign_metrics';
export { findCampaignMetricsByAccountAndRange } from './find_by_account_and_range';
export type {
  CampaignMetricsCache,
  CampaignMetricsCacheStatus,
  CampaignMetricsCacheRow,
} from './types';
