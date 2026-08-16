// Use-case: FR4 — list connected accounts (GET /accounts).
// Returns raw domain ConnectedAccount objects (still include no token field — the DAL/domain
// type never carries the encrypted token past the DAL layer into Model). The Controller maps
// these to the public API shape (ConnectedAccountView) — kept out of Model per backend-standards
// (Model has no knowledge of the HTTP/API response shape).
import type { Dependencies } from '../dependencies';
import type { ConnectedAccount } from '../definitions';

export const listAccounts = async (deps: Dependencies): Promise<readonly ConnectedAccount[]> =>
  deps.findAllConnectedAccounts();
