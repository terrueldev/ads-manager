// DAL: upsert a single campaign's cached metrics for an account + date range.
// ON CONFLICT targets the unique constraint on
// (connected_account_id, google_campaign_id, date_range_start, date_range_end) so
// concurrent refresh requests are idempotent and never duplicate rows (see SPEC:
// Algorithms/Business Logic, Edge Cases).
import type { Database } from '../../operator/create_database';
import {
  CAMPAIGN_METRICS_CACHE_COLUMNS,
  mapRowToCampaignMetricsCache,
  type CampaignMetricsCache,
  type CampaignMetricsCacheRow,
  type CampaignMetricsCacheStatus,
} from './types';

type UpsertCampaignMetricsDependencies = Readonly<{
  readonly db: Database;
}>;

export type UpsertCampaignMetricsInput = Readonly<{
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
}>;

export const upsertCampaignMetrics = async (
  deps: UpsertCampaignMetricsDependencies,
  input: UpsertCampaignMetricsInput
): Promise<CampaignMetricsCache> => {
  const { rows } = await deps.db.query<CampaignMetricsCacheRow>(
    `INSERT INTO campaign_metrics_cache (
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
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
     ON CONFLICT (connected_account_id, google_campaign_id, date_range_start, date_range_end)
     DO UPDATE SET
       campaign_name = EXCLUDED.campaign_name,
       status = EXCLUDED.status,
       impressions = EXCLUDED.impressions,
       clicks = EXCLUDED.clicks,
       cost_micros = EXCLUDED.cost_micros,
       conversions = EXCLUDED.conversions,
       conversions_value = EXCLUDED.conversions_value,
       budget_micros = EXCLUDED.budget_micros,
       fetched_at = NOW()
     RETURNING ${CAMPAIGN_METRICS_CACHE_COLUMNS}`,
    [
      input.connectedAccountId,
      input.googleCampaignId,
      input.campaignName,
      input.status,
      input.dateRangeStart,
      input.dateRangeEnd,
      input.impressions,
      input.clicks,
      input.costMicros,
      input.conversions,
      input.conversionsValue,
      input.budgetMicros,
    ]
  );

  const row = rows[0];
  if (!row) {
    throw new Error('upsertCampaignMetrics: INSERT ... ON CONFLICT did not return a row');
  }
  return mapRowToCampaignMetricsCache(row);
};
