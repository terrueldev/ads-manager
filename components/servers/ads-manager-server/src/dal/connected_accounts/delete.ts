// DAL: remove a connected account (and, by nature of the single-table schema,
// its tokens/metadata) — see SPEC FR5
import type { Database } from '../../operator/create_database';
import type { ConnectedAccountRow } from './types';

type DeleteConnectedAccountDependencies = Readonly<{
  readonly db: Database;
}>;

export const deleteConnectedAccount = async (
  deps: DeleteConnectedAccountDependencies,
  id: string
): Promise<boolean> => {
  const { rows } = await deps.db.query<Pick<ConnectedAccountRow, 'id'>>(
    `DELETE FROM connected_accounts
     WHERE id = $1
     RETURNING id`,
    [id]
  );
  return rows.length > 0;
};
