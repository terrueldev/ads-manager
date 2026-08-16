/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * test_parse_accessible_accounts_includes_mcc_subaccounts (integration through this adapter)
 *
 * The google-ads-api package itself is mocked — no real network calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listAccessibleCustomersMock = vi.fn();
const queryMock = vi.fn();
const CustomerMock = vi.fn().mockReturnValue({ query: queryMock });

vi.mock('google-ads-api', () => ({
  GoogleAdsApi: vi.fn().mockImplementation(() => ({
    listAccessibleCustomers: listAccessibleCustomersMock,
    Customer: CustomerMock,
  })),
}));

import { createGoogleAdsClientAdapter } from './create_google_ads_client';

const CONFIG = { clientId: 'id', clientSecret: 'secret', developerToken: 'dev-token' };

describe('createGoogleAdsClientAdapter', () => {
  beforeEach(() => {
    listAccessibleCustomersMock.mockReset();
    queryMock.mockReset();
    CustomerMock.mockClear();
  });

  describe('listAccessibleCustomerIds', () => {
    it('returns every accessible customer id, including MCC sub-accounts, normalized to XXX-XXX-XXXX', async () => {
      listAccessibleCustomersMock.mockResolvedValue({
        resource_names: ['customers/1112223330', 'customers/2223334440', 'customers/3334445550'],
      });
      const adapter = createGoogleAdsClientAdapter(CONFIG);

      const result = await adapter.listAccessibleCustomerIds('refresh-token');

      expect(listAccessibleCustomersMock).toHaveBeenCalledWith('refresh-token');
      expect(result).toEqual(['111-222-3330', '222-333-4440', '333-444-5550']);
    });
  });

  describe('fetchCustomerMetadata', () => {
    it('maps the GAQL customer row into CustomerMetadata', async () => {
      queryMock.mockResolvedValue([
        {
          customer: {
            descriptive_name: 'Minha Loja',
            currency_code: 'BRL',
            time_zone: 'America/Sao_Paulo',
          },
        },
      ]);
      const adapter = createGoogleAdsClientAdapter(CONFIG);

      const result = await adapter.fetchCustomerMetadata('123-456-7890', 'refresh-token');

      expect(CustomerMock).toHaveBeenCalledWith({ customer_id: '1234567890', refresh_token: 'refresh-token' });
      expect(result).toEqual({ accountName: 'Minha Loja', currencyCode: 'BRL', timezone: 'America/Sao_Paulo' });
    });

    it('throws a clear error when Google returns no customer row', async () => {
      queryMock.mockResolvedValue([]);
      const adapter = createGoogleAdsClientAdapter(CONFIG);

      await expect(adapter.fetchCustomerMetadata('123-456-7890', 'refresh-token')).rejects.toThrow(
        /no customer row returned/
      );
    });
  });
});
