/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * @issue N/A
 */
import { describe, it, expect, vi } from 'vitest';
import { connectAccounts } from './connect_accounts';
import { createMockDependencies } from './test_helpers/mock_dependencies';

const PENDING = {
  refreshToken: 'refresh-token-value',
  grantedScopes: 'https://www.googleapis.com/auth/adwords',
  accountName: 'Minha Loja',
  currencyCode: 'BRL',
  timezone: 'America/Sao_Paulo',
};

describe('connectAccounts', () => {
  describe('AC2: persiste contas selecionadas', () => {
    it('persists each selected account using its stashed pending tokens, encrypting the refresh token', async () => {
      const createConnectedAccount = vi.fn().mockImplementation(async (input) => ({
        id: 'new-id',
        googleCustomerId: input.googleCustomerId,
        accountName: input.accountName,
        currencyCode: input.currencyCode,
        timezone: input.timezone,
        status: 'active',
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
      }));
      const clearPendingTokens = vi.fn();
      const encryptRefreshToken = vi.fn().mockReturnValue('encrypted-token');
      const deps = createMockDependencies({
        findConnectedAccountByCustomerId: async () => null,
        getPendingTokens: () => PENDING,
        createConnectedAccount,
        clearPendingTokens,
        encryptRefreshToken,
      });

      const result = await connectAccounts(deps, { customerIds: ['123-456-7890'] });

      expect(result.success).toBe(true);
      expect(encryptRefreshToken).toHaveBeenCalledWith('refresh-token-value');
      expect(createConnectedAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          googleCustomerId: '123-456-7890',
          oauthRefreshTokenEncrypted: 'encrypted-token',
        })
      );
      expect(clearPendingTokens).toHaveBeenCalledWith('123-456-7890');
      if (result.success) {
        expect(result.connected).toHaveLength(1);
        expect(result.connected[0]?.googleCustomerId).toBe('123-456-7890');
      }
    });
  });

  describe('AC3: conta já conectada não pode ser reconectada via POST', () => {
    it('rejects the whole request with already_connected and persists nothing', async () => {
      const createConnectedAccount = vi.fn();
      const deps = createMockDependencies({
        findConnectedAccountByCustomerId: async (customerId) =>
          customerId === '123-456-7890'
            ? {
                id: 'existing',
                googleCustomerId: customerId,
                accountName: 'Existing',
                currencyCode: 'BRL',
                timezone: 'America/Sao_Paulo',
                status: 'active',
                connectedAt: new Date('2026-01-01T00:00:00.000Z'),
              }
            : null,
        getPendingTokens: () => PENDING,
        createConnectedAccount,
      });

      const result = await connectAccounts(deps, { customerIds: ['123-456-7890', '999-999-9999'] });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('already_connected');
        expect(result.customerId).toBe('123-456-7890');
      }
      expect(createConnectedAccount).not.toHaveBeenCalled();
    });
  });

  describe('AC6: conta needs_reconnect é reconectada (atualizada), não rejeitada', () => {
    it('calls reconnectConnectedAccount instead of createConnectedAccount, and clears pending tokens', async () => {
      const createConnectedAccount = vi.fn();
      const reconnectConnectedAccount = vi.fn().mockImplementation(async (id, input) => ({
        id,
        googleCustomerId: '123-456-7890',
        accountName: input.accountName,
        currencyCode: input.currencyCode,
        timezone: input.timezone,
        status: 'active',
        connectedAt: new Date('2026-01-01T00:00:00.000Z'),
      }));
      const clearPendingTokens = vi.fn();
      const deps = createMockDependencies({
        findConnectedAccountByCustomerId: async () => ({
          id: 'existing-needs-reconnect',
          googleCustomerId: '123-456-7890',
          accountName: 'Minha Loja (token velho)',
          currencyCode: 'BRL',
          timezone: 'America/Sao_Paulo',
          status: 'needs_reconnect',
          connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        getPendingTokens: () => PENDING,
        createConnectedAccount,
        reconnectConnectedAccount,
        clearPendingTokens,
      });

      const result = await connectAccounts(deps, { customerIds: ['123-456-7890'] });

      expect(result.success).toBe(true);
      expect(createConnectedAccount).not.toHaveBeenCalled();
      expect(reconnectConnectedAccount).toHaveBeenCalledWith(
        'existing-needs-reconnect',
        expect.objectContaining({ accountName: PENDING.accountName })
      );
      expect(clearPendingTokens).toHaveBeenCalledWith('123-456-7890');
      if (result.success) {
        expect(result.connected[0]?.status).toBe('active');
      }
    });
  });

  describe('edge case: callback session expired/mismatched', () => {
    it('rejects with missing_pending_tokens and persists nothing when no tokens were stashed for the customer_id', async () => {
      const createConnectedAccount = vi.fn();
      const deps = createMockDependencies({
        findConnectedAccountByCustomerId: async () => null,
        getPendingTokens: () => undefined,
        createConnectedAccount,
      });

      const result = await connectAccounts(deps, { customerIds: ['123-456-7890'] });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('missing_pending_tokens');
      }
      expect(createConnectedAccount).not.toHaveBeenCalled();
    });
  });
});
