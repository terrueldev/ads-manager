// DAL types for connected_accounts: domain type + DB row shape + row->domain mapping
// snake_case (SQL columns) <-> camelCase (domain type) mapping lives here so every
// DAL function in this module maps consistently.

export type ConnectedAccountStatus = 'active' | 'suspended' | 'needs_reconnect';

export type ConnectedAccount = Readonly<{
  readonly id: string;
  readonly googleCustomerId: string;
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly status: ConnectedAccountStatus;
  readonly oauthRefreshTokenEncrypted: string;
  readonly grantedScopes: string;
  readonly connectedAt: Date;
  readonly updatedAt: Date;
}>;

// Raw row shape as returned by `connected_accounts` queries (snake_case columns).
export type ConnectedAccountRow = Readonly<{
  readonly id: string;
  readonly google_customer_id: string;
  readonly account_name: string;
  readonly currency_code: string;
  readonly timezone: string;
  readonly status: string;
  readonly oauth_refresh_token_encrypted: string;
  readonly granted_scopes: string;
  readonly connected_at: Date;
  readonly updated_at: Date;
}>;

export const mapRowToConnectedAccount = (row: ConnectedAccountRow): ConnectedAccount => ({
  id: row.id,
  googleCustomerId: row.google_customer_id,
  accountName: row.account_name,
  currencyCode: row.currency_code,
  timezone: row.timezone,
  status: row.status as ConnectedAccountStatus,
  oauthRefreshTokenEncrypted: row.oauth_refresh_token_encrypted,
  grantedScopes: row.granted_scopes,
  connectedAt: row.connected_at,
  updatedAt: row.updated_at,
});

// Columns selected by every read query, kept in one place so all queries return
// a shape compatible with ConnectedAccountRow.
export const CONNECTED_ACCOUNT_COLUMNS = `
  id,
  google_customer_id,
  account_name,
  currency_code,
  timezone,
  status,
  oauth_refresh_token_encrypted,
  granted_scopes,
  connected_at,
  updated_at
`;
