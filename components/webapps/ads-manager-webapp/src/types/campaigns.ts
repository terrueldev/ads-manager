// App-local aliases over the generated contract types (components/contracts/ads-manager-api),
// consumed throughout pages/services via the @/types barrel per frontend-standards.
import type { components } from '@ads-manager/contract';

export type CampaignDateRangePreset = components['schemas']['CampaignDateRange'];
export type CampaignStatus = components['schemas']['CampaignStatus'];
export type Campaign = components['schemas']['Campaign'];
export type ListCampaignsResponse = components['schemas']['ListCampaignsResponse'];
