// HTTP handlers: Campaigns namespace — GET /accounts/:id/campaigns.
import { Router, type Request, type Response } from 'express';
import type { components } from '@ads-manager/contract';
import { fetchCampaignMetrics } from '../../model';
import type { CampaignMetrics, DateRangePreset, Dependencies, FetchCampaignMetricsError } from '../../model';

export type CampaignsRouterDependencies = Readonly<{
  readonly modelDeps: Dependencies;
}>;

const VALID_RANGES: readonly DateRangePreset[] = ['7d', '30d', '90d', 'custom'];
const DEFAULT_RANGE: DateRangePreset = '30d';

const toApiCampaign = (campaign: CampaignMetrics): components['schemas']['Campaign'] => ({
  campaign_id: campaign.campaignId,
  name: campaign.name,
  status: campaign.status,
  impressions: campaign.impressions,
  clicks: campaign.clicks,
  ctr: campaign.ctr,
  avg_cpc: campaign.avgCpc,
  cost: campaign.cost,
  conversions: campaign.conversions,
  conversion_rate: campaign.conversionRate,
  cost_per_conversion: campaign.costPerConversion,
  roas: campaign.roas,
  budget: campaign.budget,
});

const mapErrorToApiResponse = (
  error: FetchCampaignMetricsError,
  message: string
): Readonly<{ readonly status: 400 | 404 | 409 | 502; readonly body: components['schemas']['ErrorResponse'] }> => {
  switch (error) {
    case 'invalid_date_range':
      return { status: 400, body: { error: { code: 'INVALID_DATE_RANGE', message } } };
    case 'account_not_found':
      return { status: 404, body: { error: { code: 'ACCOUNT_NOT_FOUND', message } } };
    case 'account_needs_reconnect':
      return { status: 409, body: { error: { code: 'ACCOUNT_NEEDS_RECONNECT', message } } };
    case 'google_ads_api_error':
      return { status: 502, body: { error: { code: 'GOOGLE_ADS_API_ERROR', message } } };
    default: {
      const exhaustiveCheck: never = error;
      throw new Error(`Unhandled FetchCampaignMetricsError: ${String(exhaustiveCheck)}`);
    }
  }
};

const handleListCampaigns =
  (deps: CampaignsRouterDependencies) =>
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id) {
      const body: components['schemas']['ErrorResponse'] = {
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada' },
      };
      res.status(404).json(body);
      return;
    }

    const query = req.query as Readonly<{
      readonly range?: string;
      readonly start?: string;
      readonly end?: string;
      readonly refresh?: string;
    }>;

    const range = query.range ?? DEFAULT_RANGE;
    if (!VALID_RANGES.includes(range as DateRangePreset)) {
      const body: components['schemas']['ErrorResponse'] = {
        error: { code: 'INVALID_DATE_RANGE', message: `Período inválido: ${range}` },
      };
      res.status(400).json(body);
      return;
    }

    const result = await fetchCampaignMetrics(deps.modelDeps, {
      accountId: id,
      range: range as DateRangePreset,
      start: query.start,
      end: query.end,
      refresh: query.refresh === 'true',
    });

    if (!result.success) {
      const { status, body } = mapErrorToApiResponse(result.error, result.message);
      res.status(status).json(body);
      return;
    }

    const body: components['schemas']['ListCampaignsResponse'] = {
      campaigns: result.campaigns.map(toApiCampaign),
      fetched_at: result.fetchedAt.toISOString(),
      stale: result.stale,
    };
    res.status(200).json(body);
  };

export const createCampaignsRouter = (deps: CampaignsRouterDependencies): Router => {
  const router = Router();
  router.get('/accounts/:id/campaigns', handleListCampaigns(deps));
  return router;
};
