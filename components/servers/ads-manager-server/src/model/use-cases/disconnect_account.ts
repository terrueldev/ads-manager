// Use-case: FR5 — disconnect a connected account (DELETE /accounts/:id).
// Removing the row is enough to satisfy "nenhuma chamada futura é feita para essa conta" — there
// is no other place in the schema that references connected_accounts yet (see SPEC.md Data
// Model), so no cascading cleanup is needed in this change.
import type { Dependencies } from '../dependencies';

export type DisconnectAccountResult =
  | Readonly<{ readonly success: true }>
  | Readonly<{ readonly success: false; readonly error: 'not_found' }>;

export const disconnectAccount = async (deps: Dependencies, id: string): Promise<DisconnectAccountResult> => {
  const existing = await deps.findConnectedAccountById(id);
  if (!existing) {
    deps.logger.warn({ id }, 'Attempted to disconnect a non-existent account');
    return { success: false, error: 'not_found' };
  }

  await deps.deleteConnectedAccount(id);
  deps.logger.info({ customerId: existing.googleCustomerId }, 'Connected account disconnected');
  return { success: true };
};
