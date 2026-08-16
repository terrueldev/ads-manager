// HTTP handlers: Accounts namespace — GET /accounts, POST /accounts, DELETE /accounts/:id.
import { Router, type Request, type Response } from 'express';
import type { components } from '@ads-manager/contract';
import { listAccounts, connectAccounts, disconnectAccount } from '../../model';
import type { ConnectedAccount, Dependencies } from '../../model';

export type AccountsRouterDependencies = Readonly<{
  readonly modelDeps: Dependencies;
}>;

const toApiConnectedAccount = (account: ConnectedAccount): components['schemas']['ConnectedAccount'] => ({
  id: account.id,
  customer_id: account.googleCustomerId,
  account_name: account.accountName,
  currency_code: account.currencyCode,
  timezone: account.timezone,
  status: account.status,
  connected_at: account.connectedAt.toISOString(),
});

const handleListAccounts =
  (deps: AccountsRouterDependencies) =>
  async (_req: Request, res: Response): Promise<void> => {
    const accounts = await listAccounts(deps.modelDeps);
    const body: components['schemas']['ListAccountsResponse'] = {
      accounts: accounts.map(toApiConnectedAccount),
    };
    res.status(200).json(body);
  };

const handleConnectAccounts =
  (deps: AccountsRouterDependencies) =>
  async (req: Request, res: Response): Promise<void> => {
    const requestBody = req.body as components['schemas']['ConnectAccountsRequest'] | undefined;
    // The contract marks customer_ids as required with minItems: 1; an empty/missing array falls
    // through to connectAccounts with zero candidates, which is a well-defined no-op (201 with an
    // empty `connected` list) rather than inventing a bespoke error code outside the contract's
    // fixed Error.code enum for a case OpenAPI-level request validation should catch upstream.
    const customerIds = requestBody?.customer_ids ?? [];

    const result = await connectAccounts(deps.modelDeps, { customerIds });

    if (!result.success) {
      // Both connectAccounts failure modes ('already_connected' and 'missing_pending_tokens') are
      // reported through the contract's single ALREADY_CONNECTED/409 case for
      // 'already_connected'; 'missing_pending_tokens' (an expired/mismatched callback session —
      // not covered by the frozen contract's error enum for this endpoint) is mapped to
      // INVALID_STATE/400 for the same reason as the OAuth callback's oauth_exchange_failed case:
      // "your connection session is invalid/expired, restart the flow" (see http_handlers/oauth.ts).
      if (result.error === 'already_connected') {
        const body: components['schemas']['ErrorResponse'] = {
          error: { code: 'ALREADY_CONNECTED', message: result.message },
        };
        res.status(409).json(body);
        return;
      }
      const body: components['schemas']['ErrorResponse'] = {
        error: { code: 'INVALID_STATE', message: result.message },
      };
      res.status(400).json(body);
      return;
    }

    const body: components['schemas']['ConnectAccountsResponse'] = {
      connected: result.connected.map(toApiConnectedAccount),
    };
    res.status(201).json(body);
  };

const handleDisconnectAccount =
  (deps: AccountsRouterDependencies) =>
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id) {
      const body: components['schemas']['ErrorResponse'] = {
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada' },
      };
      res.status(404).json(body);
      return;
    }

    const result = await disconnectAccount(deps.modelDeps, id);

    if (!result.success) {
      const body: components['schemas']['ErrorResponse'] = {
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada' },
      };
      res.status(404).json(body);
      return;
    }

    res.status(204).send();
  };

export const createAccountsRouter = (deps: AccountsRouterDependencies): Router => {
  const router = Router();
  router.get('/accounts', handleListAccounts(deps));
  router.post('/accounts', handleConnectAccounts(deps));
  router.delete('/accounts/:id', handleDisconnectAccount(deps));
  return router;
};
