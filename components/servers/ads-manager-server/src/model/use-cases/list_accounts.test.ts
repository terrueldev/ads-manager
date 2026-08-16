/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * @issue N/A
 */
import { describe, it, expect } from 'vitest';
import { listAccounts } from './list_accounts';
import { createMockDependencies } from './test_helpers/mock_dependencies';

describe('listAccounts', () => {
  describe('AC2 / FR4: lista contas conectadas', () => {
    it('returns every account from the DAL, unmodified', async () => {
      const accounts = [
        {
          id: '1',
          googleCustomerId: '123-456-7890',
          accountName: 'Minha Loja',
          currencyCode: 'BRL',
          timezone: 'America/Sao_Paulo',
          status: 'active' as const,
          connectedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      const deps = createMockDependencies({ findAllConnectedAccounts: async () => accounts });

      const result = await listAccounts(deps);

      expect(result).toEqual(accounts);
    });

    it('never carries a refresh-token-like field, even structurally', async () => {
      const deps = createMockDependencies({
        findAllConnectedAccounts: async () => [
          {
            id: '1',
            googleCustomerId: '123-456-7890',
            accountName: 'Minha Loja',
            currencyCode: 'BRL',
            timezone: 'America/Sao_Paulo',
            status: 'active' as const,
            connectedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      });

      const result = await listAccounts(deps);

      expect(result[0]).not.toHaveProperty('oauthRefreshTokenEncrypted');
      expect(result[0]).not.toHaveProperty('grantedScopes');
    });
  });
});
