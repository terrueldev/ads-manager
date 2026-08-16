// Controller adapter (test/dev only): deterministic stand-in for create_google_ads_client.ts's
// createGoogleAdsClientAdapter, wired in by createController when Config.mockGoogleAds is true —
// see create_mock_oauth2_client.ts for the full rationale (no real developer token yet).
//
// Models a fake MCC with two sub-accounts, so FR2's "includes MCC sub-accounts" behavior is
// exercisable end-to-end without a real sandbox account.
import type { CustomerMetadata } from '../../model';
import type { GoogleAdsClientAdapter } from './create_google_ads_client';

export const MOCK_ACCESSIBLE_CUSTOMER_IDS: readonly string[] = ['1234567890', '2345678901'];

const MOCK_CUSTOMER_METADATA: Readonly<Record<string, CustomerMetadata>> = {
  '1234567890': { accountName: 'Mock Ads Account 1', currencyCode: 'BRL', timezone: 'America/Sao_Paulo' },
  '2345678901': { accountName: 'Mock Ads Account 2 (sub-account)', currencyCode: 'USD', timezone: 'America/New_York' },
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

  return { listAccessibleCustomerIds, fetchCustomerMetadata };
};
