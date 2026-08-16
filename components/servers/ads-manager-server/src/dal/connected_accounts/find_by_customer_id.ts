// DAL: look up a connected account by its Google Ads Customer ID
import type { Database } from '../../operator/create_database';
import {
  CONNECTED_ACCOUNT_COLUMNS,
  mapRowToConnectedAccount,
  type ConnectedAccount,
  type ConnectedAccountRow,
} from './types';

type FindConnectedAccountByCustomerIdDependencies = Readonly<{
  readonly db: Database;
}>;

export const findConnectedAccountByCustomerId = async (
  deps: FindConnectedAccountByCustomerIdDependencies,
  googleCustomerId: string
): Promise<ConnectedAccount | null> => {
  const { rows } = await deps.db.query<ConnectedAccountRow>(
    `SELECT ${CONNECTED_ACCOUNT_COLUMNS}
     FROM connected_accounts
     WHERE google_customer_id = $1`,
    [googleCustomerId]
  );
  const row = rows[0];
  return row ? mapRowToConnectedAccount(row) : null;
};
