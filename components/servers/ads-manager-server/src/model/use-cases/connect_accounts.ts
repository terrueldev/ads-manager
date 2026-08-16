// Use-case: FR3 — persist the accounts the user selected after the OAuth callback
// (POST /accounts). Also covers FR6/AC6 reconnection: a `needs_reconnect` account is updated
// in place (new token + status back to 'active') instead of rejected, since google_customer_id
// is UNIQUE and re-creating it would violate that constraint.
//
// Tokens for each customer_id were already stashed by handleOAuthCallback (see
// src/controller/google_ads/create_oauth_session_store.ts); this use-case only consumes them.
// It never calls Google — everything it needs (refresh token + account metadata) was already
// captured during the callback step, matching FR2's constraint that tokens are only persisted
// for accounts the user actually confirms.
//
// All-or-nothing: the whole batch is validated (not already connected, has pending tokens) before
// anything is written, so a rejected request never partially creates/updates accounts —
// consistent with SPEC.md's "nenhuma conta parcialmente criada" principle, applied here too.
import type { Dependencies } from '../dependencies';
import type { ConnectedAccount, PendingCustomerTokens } from '../definitions';

export type ConnectAccountsArgs = Readonly<{
  readonly customerIds: readonly string[];
}>;

export type ConnectAccountsError = 'already_connected' | 'missing_pending_tokens';

export type ConnectAccountsResult =
  | Readonly<{ readonly success: true; readonly connected: readonly ConnectedAccount[] }>
  | Readonly<{
      readonly success: false;
      readonly error: ConnectAccountsError;
      readonly customerId: string;
      readonly message: string;
    }>;

type ValidatedCandidate = Readonly<{
  readonly customerId: string;
  // Existing row only when it's a "real" already-connected account (active/suspended) — a
  // `needs_reconnect` row is treated as reconnectable, not already-connected, hence `existingId`
  // being set separately from the already-connected check below.
  readonly alreadyConnected: boolean;
  readonly reconnectId: string | undefined;
  readonly pending: PendingCustomerTokens | undefined;
}>;

export const connectAccounts = async (
  deps: Dependencies,
  args: ConnectAccountsArgs
): Promise<ConnectAccountsResult> => {
  const candidates: readonly ValidatedCandidate[] = await Promise.all(
    args.customerIds.map(async (customerId): Promise<ValidatedCandidate> => {
      const existing = await deps.findConnectedAccountByCustomerId(customerId);
      return {
        customerId,
        alreadyConnected: existing !== null && existing.status !== 'needs_reconnect',
        reconnectId: existing?.status === 'needs_reconnect' ? existing.id : undefined,
        pending: deps.getPendingTokens(customerId),
      };
    })
  );

  const alreadyConnected = candidates.find((c) => c.alreadyConnected);
  if (alreadyConnected) {
    deps.logger.info(
      { customerId: alreadyConnected.customerId },
      'Attempted to connect an already-connected account'
    );
    return {
      success: false,
      error: 'already_connected',
      customerId: alreadyConnected.customerId,
      message: `Esta conta já está conectada: ${alreadyConnected.customerId}`,
    };
  }

  const missingPendingTokens = candidates.find((c) => !c.pending);
  if (missingPendingTokens) {
    deps.logger.warn(
      { customerId: missingPendingTokens.customerId },
      'No pending OAuth tokens found for requested customer_id'
    );
    return {
      success: false,
      error: 'missing_pending_tokens',
      customerId: missingPendingTokens.customerId,
      message: `Sessão de conexão expirada para ${missingPendingTokens.customerId}, reinicie o fluxo de conexão`,
    };
  }

  const connected = await Promise.all(
    candidates.map(async ({ customerId, reconnectId, pending }): Promise<ConnectedAccount> => {
      // `pending` is guaranteed defined here (checked via `missingPendingTokens` above), but that
      // narrowing doesn't carry across the array — assert with a clear message instead of `!`.
      if (!pending) {
        throw new Error(`connectAccounts: unexpected missing pending tokens for ${customerId}`);
      }

      const encryptedToken = deps.encryptRefreshToken(pending.refreshToken);

      const account = reconnectId
        ? await (async () => {
            const updated = await deps.reconnectConnectedAccount(reconnectId, {
              accountName: pending.accountName,
              currencyCode: pending.currencyCode,
              timezone: pending.timezone,
              oauthRefreshTokenEncrypted: encryptedToken,
              grantedScopes: pending.grantedScopes,
            });
            if (!updated) {
              throw new Error(`connectAccounts: reconnect target not found for ${customerId} (id ${reconnectId})`);
            }
            return updated;
          })()
        : await deps.createConnectedAccount({
            googleCustomerId: customerId,
            accountName: pending.accountName,
            currencyCode: pending.currencyCode,
            timezone: pending.timezone,
            oauthRefreshTokenEncrypted: encryptedToken,
            grantedScopes: pending.grantedScopes,
          });

      deps.clearPendingTokens(customerId);
      deps.logger.info(
        { customerId, accountName: account.accountName, reconnected: Boolean(reconnectId) },
        reconnectId ? 'Connected account reconnected' : 'Connected account persisted'
      );
      return account;
    })
  );

  return { success: true, connected };
};
