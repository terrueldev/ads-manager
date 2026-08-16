// DAL: reconnect an existing account (status = needs_reconnect) — refreshes its token and
// metadata and flips status back to 'active'. See FR6 / AC6: reconnecting must update the
// existing row, not create a duplicate (google_customer_id is UNIQUE).
import type { Database } from '../../operator/create_database';
import {
  CONNECTED_ACCOUNT_COLUMNS,
  mapRowToConnectedAccount,
  type ConnectedAccount,
  type ConnectedAccountRow,
} from './types';

type ReconnectConnectedAccountDependencies = Readonly<{
  readonly db: Database;
}>;

export type ReconnectConnectedAccountInput = Readonly<{
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly oauthRefreshTokenEncrypted: string;
  readonly grantedScopes: string;
}>;

export const reconnectConnectedAccount = async (
  deps: ReconnectConnectedAccountDependencies,
  id: string,
  input: ReconnectConnectedAccountInput
): Promise<ConnectedAccount | null> => {
  const { rows } = await deps.db.query<ConnectedAccountRow>(
    `UPDATE connected_accounts
     SET account_name = $2,
         currency_code = $3,
         timezone = $4,
         oauth_refresh_token_encrypted = $5,
         granted_scopes = $6,
         status = 'active',
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${CONNECTED_ACCOUNT_COLUMNS}`,
    [
      id,
      input.accountName,
      input.currencyCode,
      input.timezone,
      input.oauthRefreshTokenEncrypted,
      input.grantedScopes,
    ]
  );
  const row = rows[0];
  return row ? mapRowToConnectedAccount(row) : null;
};
