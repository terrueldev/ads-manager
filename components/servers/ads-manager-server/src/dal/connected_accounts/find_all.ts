// DAL: list all connected accounts
import type { Database } from '../../operator/create_database';
import {
  CONNECTED_ACCOUNT_COLUMNS,
  mapRowToConnectedAccount,
  type ConnectedAccount,
  type ConnectedAccountRow,
} from './types';

type FindAllConnectedAccountsDependencies = Readonly<{
  readonly db: Database;
}>;

export const findAllConnectedAccounts = async (
  deps: FindAllConnectedAccountsDependencies
): Promise<readonly ConnectedAccount[]> => {
  const { rows } = await deps.db.query<ConnectedAccountRow>(
    `SELECT ${CONNECTED_ACCOUNT_COLUMNS}
     FROM connected_accounts
     ORDER BY connected_at DESC`
  );
  return rows.map(mapRowToConnectedAccount);
};
