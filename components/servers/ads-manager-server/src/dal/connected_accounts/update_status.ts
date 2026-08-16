// DAL: update the status of a connected account (e.g. mark needs_reconnect)
import type { Database } from '../../operator/create_database';
import {
  CONNECTED_ACCOUNT_COLUMNS,
  mapRowToConnectedAccount,
  type ConnectedAccount,
  type ConnectedAccountRow,
  type ConnectedAccountStatus,
} from './types';

type UpdateConnectedAccountStatusDependencies = Readonly<{
  readonly db: Database;
}>;

export const updateConnectedAccountStatus = async (
  deps: UpdateConnectedAccountStatusDependencies,
  id: string,
  status: ConnectedAccountStatus
): Promise<ConnectedAccount | null> => {
  const { rows } = await deps.db.query<ConnectedAccountRow>(
    `UPDATE connected_accounts
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING ${CONNECTED_ACCOUNT_COLUMNS}`,
    [id, status]
  );
  const row = rows[0];
  return row ? mapRowToConnectedAccount(row) : null;
};
