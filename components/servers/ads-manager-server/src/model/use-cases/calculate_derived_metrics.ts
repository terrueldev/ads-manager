// Use-case (pure helper): FR3 — compute a campaign's derived performance metrics from raw values
// returned by the Google Ads API (or read back from campaign_metrics_cache). Money values (cost,
// avg_cpc, cost_per_conversion, budget) are converted from Google Ads micros
// (1 unit = 1,000,000 micros, see SPEC.md > Data Model) to regular currency units here, once, so
// every caller works with display-ready numbers instead of repeating the conversion.
//
// Division-by-zero (0 impressions, 0 clicks, 0 conversions, 0 cost) always yields 0, never
// NaN/Infinity — called out explicitly in SPEC.md's Testing Strategy.
import type { CampaignDerivedMetrics, CampaignRawValues } from '../definitions';

const MICROS_PER_UNIT = 1_000_000;

export const calculateDerivedMetrics = (raw: CampaignRawValues): CampaignDerivedMetrics => {
  const cost = raw.costMicros / MICROS_PER_UNIT;
  const ctr = raw.impressions > 0 ? raw.clicks / raw.impressions : 0;
  const avgCpc = raw.clicks > 0 ? cost / raw.clicks : 0;
  const conversionRate = raw.clicks > 0 ? raw.conversions / raw.clicks : 0;
  const costPerConversion = raw.conversions > 0 ? cost / raw.conversions : 0;
  const roas = cost > 0 ? raw.conversionsValue / cost : 0;
  const budget = raw.budgetMicros === null ? null : raw.budgetMicros / MICROS_PER_UNIT;

  return { ctr, avgCpc, cost, conversionRate, costPerConversion, roas, budget };
};
