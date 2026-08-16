// HTTP handlers: OAuth namespace — GET /oauth/google-ads/start, GET /oauth/google-ads/callback.
// Handler names use the `handle` + operationId convention from the OpenAPI spec
// (contracts/ads-manager-api/openapi.yaml).
import { Router, type Request, type Response } from 'express';
import type { components } from '@ads-manager/contract';
import { startOAuthFlow, handleOAuthCallback } from '../../model';
import type { Dependencies } from '../../model';

export type OAuthRouterDependencies = Readonly<{
  readonly modelDeps: Dependencies;
}>;

const handleStartGoogleAdsOAuth = (deps: OAuthRouterDependencies) => (_req: Request, res: Response): void => {
  const result = startOAuthFlow(deps.modelDeps);
  const body: components['schemas']['StartOAuthResponse'] = {
    authorization_url: result.authorizationUrl,
  };
  res.status(200).json(body);
};

// Maps a handleOAuthCallback failure to the contract's Error.code enum. `oauth_exchange_failed`
// has no dedicated code in the frozen OpenAPI contract (only INVALID_STATE, OAUTH_DENIED,
// ACCOUNT_NOT_FOUND, ALREADY_CONNECTED, GOOGLE_ADS_API_ERROR exist) — it's mapped to OAUTH_DENIED
// since, from the frontend's point of view, both mean "the OAuth flow didn't complete, show an
// error and let the user retry" (SPEC.md Error Handling: same recovery path for both).
const mapCallbackErrorToApiCode = (
  error: 'invalid_state' | 'oauth_denied' | 'oauth_exchange_failed' | 'google_ads_api_error'
): { readonly status: 400 | 502; readonly code: components['schemas']['Error']['code'] } => {
  if (error === 'google_ads_api_error') {
    return { status: 502, code: 'GOOGLE_ADS_API_ERROR' };
  }
  if (error === 'invalid_state') {
    return { status: 400, code: 'INVALID_STATE' };
  }
  return { status: 400, code: 'OAUTH_DENIED' };
};

const handleGoogleAdsOAuthCallback =
  (deps: OAuthRouterDependencies) =>
  async (req: Request, res: Response): Promise<void> => {
    const { code, state, error } = req.query as Readonly<{
      readonly code?: string;
      readonly state?: string;
      readonly error?: string;
    }>;

    const result = await handleOAuthCallback(deps.modelDeps, { code, state, error });

    if (!result.success) {
      const { status, code: errorCode } = mapCallbackErrorToApiCode(result.error);
      const body: components['schemas']['ErrorResponse'] = {
        error: { code: errorCode, message: result.message },
      };
      res.status(status).json(body);
      return;
    }

    const body: components['schemas']['OAuthCallbackResponse'] = {
      accessible_accounts: result.accessibleAccounts.map((account) => ({
        customer_id: account.customerId,
        account_name: account.accountName,
        currency_code: account.currencyCode,
        timezone: account.timezone,
        already_connected: account.alreadyConnected,
      })),
    };
    res.status(200).json(body);
  };

export const createOAuthRouter = (deps: OAuthRouterDependencies): Router => {
  const router = Router();
  router.get('/oauth/google-ads/start', handleStartGoogleAdsOAuth(deps));
  router.get('/oauth/google-ads/callback', handleGoogleAdsOAuthCallback(deps));
  return router;
};
