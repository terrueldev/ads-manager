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

import { createGoogleAdsClientAdapter, GoogleAdsAuthenticationError, isGoogleAdsAuthFailure } from './create_google_ads_client';

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

  describe('fetchCampaignMetrics', () => {
    it('maps GAQL campaign rows into RawCampaignMetrics, including a null budget when campaign_budget is absent', async () => {
      queryMock.mockResolvedValue([
        {
          campaign: { id: '111222333', name: 'Campanha Institucional', status: 'ENABLED' },
          campaign_budget: { amount_micros: '50000000' },
          metrics: {
            impressions: '12345',
            clicks: '234',
            cost_micros: '292500000',
            conversions: '8',
            conversions_value: '936000000',
          },
        },
        {
          campaign: { id: '000111222', name: 'Campanha Removida', status: 'REMOVED' },
          campaign_budget: null,
          metrics: { impressions: '0', clicks: '0', cost_micros: '0', conversions: '0', conversions_value: '0' },
        },
      ]);
      const adapter = createGoogleAdsClientAdapter(CONFIG);

      const result = await adapter.fetchCampaignMetrics('123-456-7890', 'refresh-token', '2026-07-17', '2026-08-16');

      expect(CustomerMock).toHaveBeenCalledWith({ customer_id: '1234567890', refresh_token: 'refresh-token' });
      expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("segments.date BETWEEN '2026-07-17' AND '2026-08-16'"));
      expect(result).toEqual([
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
          googleCampaignId: '000111222',
          campaignName: 'Campanha Removida',
          status: 'REMOVED',
          impressions: 0,
          clicks: 0,
          costMicros: 0,
          conversions: 0,
          conversionsValue: 0,
          budgetMicros: null,
        },
      ]);
    });

    it('wraps a GoogleAdsFailure carrying an authentication_error as GoogleAdsAuthenticationError', async () => {
      queryMock.mockRejectedValue({
        errors: [{ error_code: { authentication_error: 'OAUTH_TOKEN_INVALID' } }],
      });
      const adapter = createGoogleAdsClientAdapter(CONFIG);

      await expect(
        adapter.fetchCampaignMetrics('123-456-7890', 'revoked-refresh-token', '2026-07-17', '2026-08-16')
      ).rejects.toBeInstanceOf(GoogleAdsAuthenticationError);
    });

    it('wraps an invalid_grant OAuth error (revoked/expired refresh token) as GoogleAdsAuthenticationError', async () => {
      queryMock.mockRejectedValue({ response: { data: { error: 'invalid_grant' } } });
      const adapter = createGoogleAdsClientAdapter(CONFIG);

      await expect(
        adapter.fetchCampaignMetrics('123-456-7890', 'revoked-refresh-token', '2026-07-17', '2026-08-16')
      ).rejects.toBeInstanceOf(GoogleAdsAuthenticationError);
    });

    it('rethrows a rate-limit/quota failure unchanged, NOT as GoogleAdsAuthenticationError', async () => {
      const quotaError = { errors: [{ error_code: { quota_error: 'RESOURCE_EXHAUSTED' } }] };
      queryMock.mockRejectedValue(quotaError);
      const adapter = createGoogleAdsClientAdapter(CONFIG);

      const rejection = adapter.fetchCampaignMetrics('123-456-7890', 'refresh-token', '2026-07-17', '2026-08-16');
      await expect(rejection).rejects.not.toBeInstanceOf(GoogleAdsAuthenticationError);
      await expect(rejection).rejects.toBe(quotaError);
    });
  });

  describe('isGoogleAdsAuthFailure', () => {
    it('returns false for an unrelated/generic error shape', () => {
      expect(isGoogleAdsAuthFailure(new Error('boom'))).toBe(false);
      expect(isGoogleAdsAuthFailure({ errors: [{ error_code: { quota_error: 'X' } }] })).toBe(false);
      expect(isGoogleAdsAuthFailure(undefined)).toBe(false);
    });

    it('returns true for an authorization_error entry', () => {
      expect(isGoogleAdsAuthFailure({ errors: [{ error_code: { authorization_error: 'X' } }] })).toBe(true);
    });
  });
});
