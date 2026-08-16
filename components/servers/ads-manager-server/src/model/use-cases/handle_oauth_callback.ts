// Use-case: FR2 — handle the Google OAuth callback (GET /oauth/google-ads/callback).
//
// 1. Validates+consumes `state` (CSRF protection).
// 2. Exchanges `code` for tokens with Google.
// 3. Lists every Google Ads customer accessible to that identity, including MCC sub-accounts.
// 4. Flags accounts already connected (via DAL lookup) so the frontend disables them.
// 5. Stashes the tokens + metadata for every accessible customer, keyed by customer_id, so
//    `connectAccounts` can persist the ones the user actually selects (see
//    src/controller/google_ads/create_oauth_session_store.ts for why customer_id and not a
//    session id — the OpenAPI contract for POST /accounts only carries customer_ids).
//
// Per SPEC.md's edge cases, this never partially creates an account — persistence only ever
// happens in connectAccounts, so any failure here (invalid state, denied consent, exchange
// failure, Google Ads API failure) is guaranteed to leave zero rows written.
import type { Dependencies } from '../dependencies';
import type { AccessibleGoogleAdsAccount } from '../definitions';

export type HandleOAuthCallbackArgs = Readonly<{
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
}>;

export type HandleOAuthCallbackError =
  | 'invalid_state'
  | 'oauth_denied'
  | 'oauth_exchange_failed'
  | 'google_ads_api_error';

export type HandleOAuthCallbackResult =
  | Readonly<{ readonly success: true; readonly accessibleAccounts: readonly AccessibleGoogleAdsAccount[] }>
  | Readonly<{ readonly success: false; readonly error: HandleOAuthCallbackError; readonly message: string }>;

export const handleOAuthCallback = async (
  deps: Dependencies,
  args: HandleOAuthCallbackArgs
): Promise<HandleOAuthCallbackResult> => {
  if (args.error) {
    deps.logger.info({ reason: args.error }, 'OAuth consent denied by user');
    return {
      success: false,
      error: 'oauth_denied',
      message: 'Usuário negou o consentimento OAuth',
    };
  }

  if (!deps.consumeOAuthState(args.state)) {
    deps.logger.warn({ state: args.state }, 'OAuth callback rejected: invalid or expired state');
    return {
      success: false,
      error: 'invalid_state',
      message: 'state do OAuth ausente ou inválido',
    };
  }

  const { code } = args;
  if (!code) {
    deps.logger.warn({}, 'OAuth callback rejected: missing code');
    return {
      success: false,
      error: 'invalid_state',
      message: 'code do OAuth ausente',
    };
  }

  const tokens = await (async () => {
    try {
      return await deps.exchangeOAuthCode(code);
    } catch (err) {
      deps.logger.warn({ err }, 'OAuth authorization code exchange failed');
      return null;
    }
  })();

  if (!tokens) {
    return {
      success: false,
      error: 'oauth_exchange_failed',
      message: 'Falha ao trocar o código de autorização por tokens',
    };
  }

  try {
    const customerIds = await deps.listAccessibleCustomerIds(tokens.refreshToken);

    const accessibleAccounts = await Promise.all(
      customerIds.map(async (customerId): Promise<AccessibleGoogleAdsAccount> => {
        const metadata = await deps.fetchCustomerMetadata(customerId, tokens.refreshToken);
        const existing = await deps.findConnectedAccountByCustomerId(customerId);

        // Only the accounts NOT already connected (or connected but needing reconnection, per
        // FR6/AC6) are useful as pending-connection candidates — but we stash tokens for all of
        // them anyway so re-listing (e.g. after a page refresh within the TTL) still works
        // uniformly; connectAccounts re-checks status itself before persisting/reconnecting.
        deps.savePendingTokens(customerId, {
          refreshToken: tokens.refreshToken,
          grantedScopes: tokens.scope,
          accountName: metadata.accountName,
          currencyCode: metadata.currencyCode,
          timezone: metadata.timezone,
        });

        // A `needs_reconnect` account is reported as NOT already-connected so the frontend keeps
        // its checkbox selectable — selecting it re-runs the OAuth flow and connectAccounts
        // updates (rather than rejects) that existing row. See FR6/AC6.
        return {
          customerId,
          accountName: metadata.accountName,
          currencyCode: metadata.currencyCode,
          timezone: metadata.timezone,
          alreadyConnected: existing !== null && existing.status !== 'needs_reconnect',
        };
      })
    );

    deps.logger.info(
      { accessibleCount: accessibleAccounts.length },
      'Listed Google Ads accessible accounts after OAuth callback'
    );

    return { success: true, accessibleAccounts };
  } catch (err) {
    deps.logger.error({ err }, 'Failed to list accessible Google Ads accounts');
    return {
      success: false,
      error: 'google_ads_api_error',
      message: 'Falha ao consultar contas acessíveis na Google Ads API',
    };
  }
};
