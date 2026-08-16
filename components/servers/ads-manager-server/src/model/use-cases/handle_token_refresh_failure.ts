// Use-case: FR6 — mark a connected account as needing reconnection when its refresh token can no
// longer be used to obtain a new access token (revoked/expired refresh token).
//
// Not wired to any HTTP endpoint in this change — the OpenAPI contract for
// google-ads-connection has no endpoint that triggers a token refresh (there's no data-fetching
// yet). This is provided now, tested in isolation, so it's ready to be called from wherever the
// next epic change (`campaign-performance-dashboard`) ends up doing its first real Google Ads API
// call per connected account — call this whenever that call fails with an auth/refresh error,
// BEFORE surfacing a generic error to the user, so the account flips to `needs_reconnect` (FR6)
// instead of every subsequent fetch failing the same way silently.
import type { Dependencies } from '../dependencies';

export type HandleTokenRefreshFailureResult =
  | Readonly<{ readonly success: true }>
  | Readonly<{ readonly success: false; readonly error: 'account_not_found' }>;

export const handleTokenRefreshFailure = async (
  deps: Dependencies,
  customerId: string
): Promise<HandleTokenRefreshFailureResult> => {
  const account = await deps.findConnectedAccountByCustomerId(customerId);
  if (!account) {
    deps.logger.warn({ customerId }, 'Token refresh failed for an unknown customer_id');
    return { success: false, error: 'account_not_found' };
  }

  await deps.updateConnectedAccountStatus(account.id, 'needs_reconnect');
  deps.logger.warn({ customerId }, 'Connected account marked needs_reconnect after refresh token failure');
  return { success: true };
};
