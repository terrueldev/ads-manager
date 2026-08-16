// DAL: insert a new connected_accounts row
import type { Database } from '../../operator/create_database';
import {
  CONNECTED_ACCOUNT_COLUMNS,
  mapRowToConnectedAccount,
  type ConnectedAccount,
  type ConnectedAccountRow,
} from './types';

type CreateConnectedAccountDependencies = Readonly<{
  readonly db: Database;
}>;

export type CreateConnectedAccountInput = Readonly<{
  readonly googleCustomerId: string;
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly oauthRefreshTokenEncrypted: string;
  readonly grantedScopes: string;
}>;

export const createConnectedAccount = async (
  deps: CreateConnectedAccountDependencies,
  input: CreateConnectedAccountInput
): Promise<ConnectedAccount> => {
  const { rows } = await deps.db.query<ConnectedAccountRow>(
    `INSERT INTO connected_accounts (
       google_customer_id,
       account_name,
       currency_code,
       timezone,
       oauth_refresh_token_encrypted,
       granted_scopes
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${CONNECTED_ACCOUNT_COLUMNS}`,
    [
      input.googleCustomerId,
      input.accountName,
      input.currencyCode,
      input.timezone,
      input.oauthRefreshTokenEncrypted,
      input.grantedScopes,
    ]
  );

  const row = rows[0];
  if (!row) {
    throw new Error('createConnectedAccount: INSERT did not return a row');
  }
  return mapRowToConnectedAccount(row);
};
