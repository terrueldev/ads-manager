/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * @issue N/A
 */
import { describe, it, expect, vi } from 'vitest';
import { handleTokenRefreshFailure } from './handle_token_refresh_failure';
import { createMockDependencies } from './test_helpers/mock_dependencies';

describe('handleTokenRefreshFailure', () => {
  describe('AC6: detecta necessidade de reconexão', () => {
    it('marks only the affected account as needs_reconnect', async () => {
      const updateConnectedAccountStatus = vi.fn().mockResolvedValue(null);
      const deps = createMockDependencies({
        findConnectedAccountByCustomerId: async (customerId) => ({
          id: 'account-1',
          googleCustomerId: customerId,
          accountName: 'Minha Loja',
          currencyCode: 'BRL',
          timezone: 'America/Sao_Paulo',
          status: 'active',
          connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        updateConnectedAccountStatus,
      });

      const result = await handleTokenRefreshFailure(deps, '123-456-7890');

      expect(result.success).toBe(true);
      expect(updateConnectedAccountStatus).toHaveBeenCalledWith('account-1', 'needs_reconnect');
      expect(updateConnectedAccountStatus).toHaveBeenCalledTimes(1);
    });

    it('returns account_not_found without updating anything for an unknown customer_id', async () => {
      const updateConnectedAccountStatus = vi.fn();
      const deps = createMockDependencies({
        findConnectedAccountByCustomerId: async () => null,
        updateConnectedAccountStatus,
      });

      const result = await handleTokenRefreshFailure(deps, 'unknown-customer-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('account_not_found');
      }
      expect(updateConnectedAccountStatus).not.toHaveBeenCalled();
    });
  });
});
