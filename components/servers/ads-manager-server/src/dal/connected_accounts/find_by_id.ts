// DAL: look up a connected account by its primary key
import type { Database } from '../../operator/create_database';
import {
  CONNECTED_ACCOUNT_COLUMNS,
  mapRowToConnectedAccount,
  type ConnectedAccount,
  type ConnectedAccountRow,
} from './types';

type FindConnectedAccountByIdDependencies = Readonly<{
  readonly db: Database;
}>;

export const findConnectedAccountById = async (
  deps: FindConnectedAccountByIdDependencies,
  id: string
): Promise<ConnectedAccount | null> => {
  const { rows } = await deps.db.query<ConnectedAccountRow>(
    `SELECT ${CONNECTED_ACCOUNT_COLUMNS}
     FROM connected_accounts
     WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  return row ? mapRowToConnectedAccount(row) : null;
};
