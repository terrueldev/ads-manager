// DAL: look up all cached campaign metrics for a connected account + date range.
// Ordering is arbitrary here (by campaign_name for determinism); the server layer
// re-sorts by cost descending per SPEC FR3 once derived metrics are computed.
import type { Database } from '../../operator/create_database';
import {
  CAMPAIGN_METRICS_CACHE_COLUMNS,
  mapRowToCampaignMetricsCache,
  type CampaignMetricsCache,
  type CampaignMetricsCacheRow,
} from './types';

type FindCampaignMetricsByAccountAndRangeDependencies = Readonly<{
  readonly db: Database;
}>;

export const findCampaignMetricsByAccountAndRange = async (
  deps: FindCampaignMetricsByAccountAndRangeDependencies,
  connectedAccountId: string,
  dateRangeStart: string,
  dateRangeEnd: string
): Promise<readonly CampaignMetricsCache[]> => {
  const { rows } = await deps.db.query<CampaignMetricsCacheRow>(
    `SELECT ${CAMPAIGN_METRICS_CACHE_COLUMNS}
     FROM campaign_metrics_cache
     WHERE connected_account_id = $1
       AND date_range_start = $2
       AND date_range_end = $3
     ORDER BY campaign_name ASC`,
    [connectedAccountId, dateRangeStart, dateRangeEnd]
  );
  return rows.map(mapRowToCampaignMetricsCache);
};
