// DAL: connected_accounts — re-exports only (barrel), no logic here.
// Grouped in this subdirectory because all functions share the connected_accounts
// table, row mapping, and column list (see backend-standards: subdirectories are
// allowed for DAL when explicitly grouping data access for a single table).
export { createConnectedAccount, type CreateConnectedAccountInput } from './create';
export { findAllConnectedAccounts } from './find_all';
export { findConnectedAccountByCustomerId } from './find_by_customer_id';
export { findConnectedAccountById } from './find_by_id';
export { updateConnectedAccountStatus } from './update_status';
export { reconnectConnectedAccount, type ReconnectConnectedAccountInput } from './reconnect';
export { deleteConnectedAccount } from './delete';
export type {
  ConnectedAccount,
  ConnectedAccountStatus,
  ConnectedAccountRow,
} from './types';
