/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * test_oauth_code_exchange_success
 * test_oauth_code_exchange_failure_does_not_persist_account
 * test_oauth_state_validation_rejects_invalid
 */
import { describe, it, expect, vi } from 'vitest';
import { handleOAuthCallback } from './handle_oauth_callback';
import { createMockDependencies } from './test_helpers/mock_dependencies';

describe('handleOAuthCallback', () => {
  describe('test_oauth_state_validation_rejects_invalid', () => {
    it('rejects the callback when state is missing', async () => {
      const consumeOAuthState = vi.fn().mockReturnValue(false);
      const deps = createMockDependencies({ consumeOAuthState });

      const result = await handleOAuthCallback(deps, { code: 'auth-code', state: undefined });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_state');
      }
      expect(consumeOAuthState).toHaveBeenCalledWith(undefined);
    });

    it('rejects the callback when state is unknown/expired', async () => {
      const consumeOAuthState = vi.fn().mockReturnValue(false);
      const deps = createMockDependencies({ consumeOAuthState });

      const result = await handleOAuthCallback(deps, { code: 'auth-code', state: 'stale-or-forged-state' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_state');
      }
    });

    it('returns oauth_denied without validating state when the user denied consent', async () => {
      const consumeOAuthState = vi.fn();
      const deps = createMockDependencies({ consumeOAuthState });

      const result = await handleOAuthCallback(deps, { error: 'access_denied' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('oauth_denied');
      }
    });
  });

  describe('test_oauth_code_exchange_success', () => {
    it('exchanges the code for tokens and returns the accessible accounts, flagging already-connected ones', async () => {
      const exchangeOAuthCode = vi.fn().mockResolvedValue({
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        scope: 'https://www.googleapis.com/auth/adwords',
      });
      const savePendingTokens = vi.fn();
      const deps = createMockDependencies({
        consumeOAuthState: () => true,
        exchangeOAuthCode,
        listAccessibleCustomerIds: async () => ['123-456-7890', '111-222-3333'],
        fetchCustomerMetadata: async (customerId) => ({
          accountName: `Account ${customerId}`,
          currencyCode: 'BRL',
          timezone: 'America/Sao_Paulo',
        }),
        findConnectedAccountByCustomerId: async (customerId) =>
          customerId === '111-222-3333'
            ? {
                id: 'existing-id',
                googleCustomerId: customerId,
                accountName: 'Already Connected',
                currencyCode: 'BRL',
                timezone: 'America/Sao_Paulo',
                status: 'active',
                connectedAt: new Date('2026-01-01T00:00:00.000Z'),
              }
            : null,
        savePendingTokens,
      });

      const result = await handleOAuthCallback(deps, { code: 'valid-auth-code', state: 'valid-state' });

      expect(exchangeOAuthCode).toHaveBeenCalledWith('valid-auth-code');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.accessibleAccounts).toEqual([
          {
            customerId: '123-456-7890',
            accountName: 'Account 123-456-7890',
            currencyCode: 'BRL',
            timezone: 'America/Sao_Paulo',
            alreadyConnected: false,
          },
          {
            customerId: '111-222-3333',
            accountName: 'Account 111-222-3333',
            currencyCode: 'BRL',
            timezone: 'America/Sao_Paulo',
            alreadyConnected: true,
          },
        ]);
      }
      // Tokens are stashed server-side for every accessible customer, never returned to the caller.
      expect(savePendingTokens).toHaveBeenCalledTimes(2);
      expect(savePendingTokens).toHaveBeenCalledWith(
        '123-456-7890',
        expect.objectContaining({ refreshToken: 'refresh-456' })
      );
    });
  });

  describe('test_oauth_code_exchange_failure_does_not_persist_account', () => {
    it('returns a failure result and never touches account persistence when code exchange fails', async () => {
      const exchangeOAuthCode = vi.fn().mockRejectedValue(new Error('invalid_grant'));
      const createConnectedAccount = vi.fn();
      const listAccessibleCustomerIds = vi.fn();
      const deps = createMockDependencies({
        consumeOAuthState: () => true,
        exchangeOAuthCode,
        createConnectedAccount,
        listAccessibleCustomerIds,
      });

      const result = await handleOAuthCallback(deps, { code: 'bad-code', state: 'valid-state' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('oauth_exchange_failed');
      }
      // handleOAuthCallback never calls createConnectedAccount itself (that's connectAccounts'
      // job) — asserting it explicitly here guards against that boundary ever blurring, and
      // confirms the Google Ads API wasn't even queried once the exchange failed.
      expect(createConnectedAccount).not.toHaveBeenCalled();
      expect(listAccessibleCustomerIds).not.toHaveBeenCalled();
    });
  });

  describe('AC5: falha ao listar contas acessíveis', () => {
    it('returns google_ads_api_error when listing accessible customers fails', async () => {
      const deps = createMockDependencies({
        consumeOAuthState: () => true,
        exchangeOAuthCode: async () => ({
          accessToken: 'a',
          refreshToken: 'r',
          scope: 'https://www.googleapis.com/auth/adwords',
        }),
        listAccessibleCustomerIds: async () => {
          throw new Error('Google Ads API unavailable');
        },
      });

      const result = await handleOAuthCallback(deps, { code: 'valid-auth-code', state: 'valid-state' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('google_ads_api_error');
      }
    });
  });
});
