// Controller adapter (test/dev only): deterministic stand-in for create_google_ads_client.ts's
// createGoogleAdsClientAdapter, wired in by createController when Config.mockGoogleAds is true —
// see create_mock_oauth2_client.ts for the full rationale (no real developer token yet).
//
// Models a fake MCC with two sub-accounts, so FR2's "includes MCC sub-accounts" behavior is
// exercisable end-to-end without a real sandbox account.
import type { CustomerMetadata, RawCampaignMetrics } from '../../model';
import type { GoogleAdsClientAdapter } from './create_google_ads_client';

export const MOCK_ACCESSIBLE_CUSTOMER_IDS: readonly string[] = ['1234567890', '2345678901'];

const MOCK_CUSTOMER_METADATA: Readonly<Record<string, CustomerMetadata>> = {
  '1234567890': { accountName: 'Mock Ads Account 1', currencyCode: 'BRL', timezone: 'America/Sao_Paulo' },
  '2345678901': { accountName: 'Mock Ads Account 2 (sub-account)', currencyCode: 'USD', timezone: 'America/New_York' },
};

// Deterministic fake campaigns for fetchCampaignMetrics (dev/tests only — see create_google_ads_client.ts
// for the real GAQL-backed implementation). Deliberately varied so the campaign-performance-dashboard
// FR3 table and calculateDerivedMetrics have real edge cases to render/compute against without
// needing a real developer token:
//   - a normal ENABLED campaign with full data
//   - a PAUSED campaign with lower spend
//   - a brand-new ENABLED campaign with zero impressions/clicks/conversions (all derived metrics
//     must come out 0, not NaN/Infinity)
//   - a REMOVED campaign with clicks but zero conversions (exercises cost_per_conversion=0 without
//     the whole campaign being zeroed out) and no budget (shared/deleted budget group)
export const MOCK_CAMPAIGNS: readonly RawCampaignMetrics[] = [
  {
    googleCampaignId: '111222333',
    campaignName: 'Campanha Institucional',
    status: 'ENABLED',
    impressions: 12345,
    clicks: 234,
    costMicros: 292_500_000,
    conversions: 8,
    conversionsValue: 936_000_000,
    budgetMicros: 50_000_000,
  },
  {
    googleCampaignId: '444555666',
    campaignName: 'Campanha Sazonal',
    status: 'PAUSED',
    impressions: 5_000,
    clicks: 50,
    costMicros: 75_000_000,
    conversions: 2,
    conversionsValue: 150_000_000,
    budgetMicros: 20_000_000,
  },
  {
    googleCampaignId: '777888999',
    campaignName: 'Campanha Nova (sem dados ainda)',
    status: 'ENABLED',
    impressions: 0,
    clicks: 0,
    costMicros: 0,
    conversions: 0,
    conversionsValue: 0,
    budgetMicros: 10_000_000,
  },
  {
    googleCampaignId: '000111222',
    campaignName: 'Campanha Removida',
    status: 'REMOVED',
    impressions: 8_000,
    clicks: 120,
    costMicros: 60_000_000,
    conversions: 0,
    conversionsValue: 0,
    budgetMicros: null,
  },
];

// --- Test-only controls (Phase 6 — Integration Testing, campaign-performance-dashboard) ---
// Module-level (not per-adapter-instance) because createController builds exactly one adapter
// instance per process and every test in campaign_performance_dashboard.integration.test.ts
// shares that one server/process (see src/integration/test_env.ts's startTestServer). Lets
// integration tests:
//   - force fetchCampaignMetrics to fail deterministically with a generic (non-auth) error, to
//     exercise fetchCampaignMetrics's stale-cache-fallback / no-cache-error paths (SPEC.md >
//     Algorithms/Business Logic, steps 6-7) without real network flakiness;
//   - assert how many times fetchCampaignMetrics was actually invoked (e.g. to prove a
//     within-TTL cache hit never touched the mock at all).
// Call resetMockGoogleAdsTestControls() in afterEach so neither leaks between tests.
let campaignMetricsCallCount = 0;
let forceGenericFailure = false;

export const getMockCampaignMetricsCallCount = (): number => campaignMetricsCallCount;

export const setMockGoogleAdsGenericFailure = (shouldFail: boolean): void => {
  forceGenericFailure = shouldFail;
};

export const resetMockGoogleAdsTestControls = (): void => {
  campaignMetricsCallCount = 0;
  forceGenericFailure = false;
};

export const createMockGoogleAdsClientAdapter = (): GoogleAdsClientAdapter => {
  const listAccessibleCustomerIds = async (_refreshToken: string): Promise<readonly string[]> =>
    MOCK_ACCESSIBLE_CUSTOMER_IDS;

  const fetchCustomerMetadata = async (customerId: string, _refreshToken: string): Promise<CustomerMetadata> => {
    const metadata = MOCK_CUSTOMER_METADATA[customerId];
    if (!metadata) {
      throw new Error(`createMockGoogleAdsClientAdapter: no mock metadata for customer_id "${customerId}"`);
    }
    return metadata;
  };

  const fetchCampaignMetrics = async (
    customerId: string,
    _refreshToken: string,
    _dateRangeStart: string,
    _dateRangeEnd: string
  ): Promise<readonly RawCampaignMetrics[]> => {
    campaignMetricsCallCount += 1;
    if (forceGenericFailure) {
      throw new Error('createMockGoogleAdsClientAdapter: forced generic failure (test-only)');
    }
    if (!MOCK_CUSTOMER_METADATA[customerId]) {
      throw new Error(`createMockGoogleAdsClientAdapter: no mock metadata for customer_id "${customerId}"`);
    }
    return MOCK_CAMPAIGNS;
  };

  return { listAccessibleCustomerIds, fetchCustomerMetadata, fetchCampaignMetrics };
};
