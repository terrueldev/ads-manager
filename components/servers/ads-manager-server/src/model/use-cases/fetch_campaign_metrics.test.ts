/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/campaign-performance-dashboard/SPEC.md
 * test_cache_valid_within_ttl_skips_api_call
 * test_refresh_true_bypasses_ttl
 * test_auth_failure_triggers_handle_token_refresh_failure
 * test_generic_failure_does_not_trigger_reconnect
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchCampaignMetrics } from './fetch_campaign_metrics';
import { createMockDependencies } from './test_helpers/mock_dependencies';
import type { CampaignMetricsCacheEntry, ConnectedAccount, RawCampaignMetrics } from '../definitions';

const NOW = new Date('2026-08-16T12:00:00.000Z');

const ACCOUNT: ConnectedAccount = {
  id: 'account-1',
  googleCustomerId: '123-456-7890',
  accountName: 'Minha Loja',
  currencyCode: 'BRL',
  timezone: 'America/Sao_Paulo',
  status: 'active',
  connectedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const cacheEntry = (overrides?: Partial<CampaignMetricsCacheEntry>): CampaignMetricsCacheEntry => ({
  googleCampaignId: '111222333',
  campaignName: 'Campanha Institucional',
  status: 'ENABLED',
  impressions: 12345,
  clicks: 234,
  costMicros: 292_500_000,
  conversions: 8,
  conversionsValue: 936,
  budgetMicros: 50_000_000,
  fetchedAt: NOW,
  ...overrides,
});

const rawCampaign = (overrides?: Partial<RawCampaignMetrics>): RawCampaignMetrics => ({
  googleCampaignId: '111222333',
  campaignName: 'Campanha Institucional',
  status: 'ENABLED',
  impressions: 12345,
  clicks: 234,
  costMicros: 292_500_000,
  conversions: 8,
  conversionsValue: 936,
  budgetMicros: 50_000_000,
  ...overrides,
});

const baseArgs = { accountId: 'account-1', range: '30d' as const, refresh: false };

describe('fetchCampaignMetrics', () => {
  describe('test_cache_valid_within_ttl_skips_api_call', () => {
    it('returns cached data without calling the Google Ads adapter when fetched_at is within the 15 min TTL', async () => {
      const fetchCampaignMetricsFromGoogleAds = vi.fn();
      const fetchedAt = new Date(NOW.getTime() - 5 * 60 * 1000); // 5 min ago, well within TTL
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ACCOUNT,
        findCampaignMetricsCache: async () => [cacheEntry({ fetchedAt })],
        fetchCampaignMetricsFromGoogleAds,
      });

      const result = await fetchCampaignMetrics(deps, baseArgs);

      expect(fetchCampaignMetricsFromGoogleAds).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stale).toBe(false);
        expect(result.fetchedAt).toEqual(fetchedAt);
        expect(result.campaigns).toHaveLength(1);
        expect(result.campaigns[0]?.campaignId).toBe('111222333');
      }
    });

    it('treats a cache entry older than 15 minutes as expired and calls the API', async () => {
      const fetchCampaignMetricsFromGoogleAds = vi.fn().mockResolvedValue({ ok: true, campaigns: [] });
      const fetchedAt = new Date(NOW.getTime() - 16 * 60 * 1000); // 16 min ago, past TTL
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ACCOUNT,
        findCampaignMetricsCache: async () => [cacheEntry({ fetchedAt })],
        fetchCampaignMetricsFromGoogleAds,
      });

      await fetchCampaignMetrics(deps, baseArgs);

      expect(fetchCampaignMetricsFromGoogleAds).toHaveBeenCalledTimes(1);
    });
  });

  describe('test_refresh_true_bypasses_ttl', () => {
    it('calls the Google Ads adapter even though a fresh cache entry exists, when refresh=true', async () => {
      const fetchCampaignMetricsFromGoogleAds = vi.fn().mockResolvedValue({ ok: true, campaigns: [rawCampaign()] });
      const fetchedAt = new Date(NOW.getTime() - 1 * 60 * 1000); // 1 min ago, well within TTL
      const upsertCampaignMetricsCache = vi.fn();
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ACCOUNT,
        findCampaignMetricsCache: async () => [cacheEntry({ fetchedAt })],
        fetchCampaignMetricsFromGoogleAds,
        upsertCampaignMetricsCache,
      });

      const result = await fetchCampaignMetrics(deps, { ...baseArgs, refresh: true });

      expect(fetchCampaignMetricsFromGoogleAds).toHaveBeenCalledTimes(1);
      expect(upsertCampaignMetricsCache).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stale).toBe(false);
        expect(result.fetchedAt).toEqual(NOW);
      }
    });
  });

  describe('test_auth_failure_triggers_handle_token_refresh_failure', () => {
    it('marks the account needs_reconnect and returns a dedicated error, without touching the cache', async () => {
      const updateConnectedAccountStatus = vi.fn().mockResolvedValue(null);
      const upsertCampaignMetricsCache = vi.fn();
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ACCOUNT,
        findConnectedAccountByCustomerId: async (customerId) =>
          customerId === ACCOUNT.googleCustomerId ? ACCOUNT : null,
        findCampaignMetricsCache: async () => [],
        fetchCampaignMetricsFromGoogleAds: async () => ({
          ok: false,
          kind: 'auth_failure',
          message: 'refresh token revoked',
        }),
        updateConnectedAccountStatus,
        upsertCampaignMetricsCache,
      });

      const result = await fetchCampaignMetrics(deps, baseArgs);

      expect(updateConnectedAccountStatus).toHaveBeenCalledWith(ACCOUNT.id, 'needs_reconnect');
      expect(updateConnectedAccountStatus).toHaveBeenCalledTimes(1);
      expect(upsertCampaignMetricsCache).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('account_needs_reconnect');
      }
    });
  });

  describe('test_generic_failure_does_not_trigger_reconnect', () => {
    it('does not call updateConnectedAccountStatus and falls back to stale cache when one exists', async () => {
      const updateConnectedAccountStatus = vi.fn();
      const fetchedAt = new Date(NOW.getTime() - 60 * 60 * 1000); // 1h ago, expired
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ACCOUNT,
        findCampaignMetricsCache: async () => [cacheEntry({ fetchedAt })],
        fetchCampaignMetricsFromGoogleAds: async () => ({
          ok: false,
          kind: 'generic_failure',
          message: 'rate limited',
        }),
        updateConnectedAccountStatus,
      });

      const result = await fetchCampaignMetrics(deps, baseArgs);

      expect(updateConnectedAccountStatus).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stale).toBe(true);
        expect(result.fetchedAt).toEqual(fetchedAt);
      }
    });

    it('does not call updateConnectedAccountStatus and returns GOOGLE_ADS_API_ERROR when no cache exists', async () => {
      const updateConnectedAccountStatus = vi.fn();
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ACCOUNT,
        findCampaignMetricsCache: async () => [],
        fetchCampaignMetricsFromGoogleAds: async () => ({
          ok: false,
          kind: 'generic_failure',
          message: 'Google Ads API unavailable',
        }),
        updateConnectedAccountStatus,
      });

      const result = await fetchCampaignMetrics(deps, baseArgs);

      expect(updateConnectedAccountStatus).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('google_ads_api_error');
      }
    });
  });

  describe('additional coverage: account validation and edge cases from SPEC.md', () => {
    it('returns account_not_found without calling the Google Ads adapter for an unknown account id', async () => {
      const fetchCampaignMetricsFromGoogleAds = vi.fn();
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => null,
        fetchCampaignMetricsFromGoogleAds,
      });

      const result = await fetchCampaignMetrics(deps, baseArgs);

      expect(fetchCampaignMetricsFromGoogleAds).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('account_not_found');
      }
    });

    it('blocks the fetch for a needs_reconnect account without calling the Google Ads adapter', async () => {
      const fetchCampaignMetricsFromGoogleAds = vi.fn();
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ({ ...ACCOUNT, status: 'needs_reconnect' }),
        fetchCampaignMetricsFromGoogleAds,
      });

      const result = await fetchCampaignMetrics(deps, baseArgs);

      expect(fetchCampaignMetricsFromGoogleAds).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('account_needs_reconnect');
      }
    });

    it('rejects a custom range with start > end before touching the account or the API', async () => {
      const findConnectedAccountById = vi.fn();
      const deps = createMockDependencies({ now: () => NOW, findConnectedAccountById });

      const result = await fetchCampaignMetrics(deps, {
        accountId: 'account-1',
        range: 'custom',
        start: '2026-08-10',
        end: '2026-08-01',
        refresh: false,
      });

      expect(findConnectedAccountById).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_date_range');
      }
    });

    it('returns an empty (not erroring) list for an account with zero campaigns', async () => {
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ACCOUNT,
        findCampaignMetricsCache: async () => [],
        fetchCampaignMetricsFromGoogleAds: async () => ({ ok: true, campaigns: [] }),
      });

      const result = await fetchCampaignMetrics(deps, baseArgs);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.campaigns).toEqual([]);
        expect(result.stale).toBe(false);
      }
    });

    it('sorts campaigns by cost descending', async () => {
      const deps = createMockDependencies({
        now: () => NOW,
        findConnectedAccountById: async () => ACCOUNT,
        findCampaignMetricsCache: async () => [],
        fetchCampaignMetricsFromGoogleAds: async () => ({
          ok: true,
          campaigns: [
            rawCampaign({ googleCampaignId: 'cheap', costMicros: 10_000_000 }),
            rawCampaign({ googleCampaignId: 'expensive', costMicros: 500_000_000 }),
            rawCampaign({ googleCampaignId: 'mid', costMicros: 100_000_000 }),
          ],
        }),
      });

      const result = await fetchCampaignMetrics(deps, baseArgs);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.campaigns.map((c) => c.campaignId)).toEqual(['expensive', 'mid', 'cheap']);
      }
    });
  });
});
