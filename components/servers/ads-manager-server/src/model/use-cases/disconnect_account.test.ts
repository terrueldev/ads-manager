/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * @issue N/A
 */
import { describe, it, expect, vi } from 'vitest';
import { disconnectAccount } from './disconnect_account';
import { createMockDependencies } from './test_helpers/mock_dependencies';

describe('disconnectAccount', () => {
  describe('AC4: desconectar conta', () => {
    it('deletes the account when it exists', async () => {
      const deleteConnectedAccount = vi.fn().mockResolvedValue(true);
      const deps = createMockDependencies({
        findConnectedAccountById: async (id) => ({
          id,
          googleCustomerId: '123-456-7890',
          accountName: 'Minha Loja',
          currencyCode: 'BRL',
          timezone: 'America/Sao_Paulo',
          status: 'active',
          connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        deleteConnectedAccount,
      });

      const result = await disconnectAccount(deps, 'account-id');

      expect(result.success).toBe(true);
      expect(deleteConnectedAccount).toHaveBeenCalledWith('account-id');
    });
  });

  describe('edge case: desconectar conta inexistente', () => {
    it('returns not_found and never calls delete when the account does not exist', async () => {
      const deleteConnectedAccount = vi.fn();
      const deps = createMockDependencies({
        findConnectedAccountById: async () => null,
        deleteConnectedAccount,
      });

      const result = await disconnectAccount(deps, 'missing-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('not_found');
      }
      expect(deleteConnectedAccount).not.toHaveBeenCalled();
    });
  });
});
