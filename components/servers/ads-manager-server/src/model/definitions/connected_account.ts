// Model definitions: Connected Account domain types.
//
// These are the Model layer's OWN types — deliberately not a re-export of the DAL's
// ConnectedAccount/ConnectedAccountRow types (src/dal/connected_accounts/types.ts). Per
// backend-standards, Model must not import from other layers; the Controller is responsible for
// adapting DAL results into these shapes when it builds the Dependencies object.

export type ConnectedAccountStatus = 'active' | 'suspended' | 'needs_reconnect';

export type ConnectedAccount = Readonly<{
  readonly id: string;
  readonly googleCustomerId: string;
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly status: ConnectedAccountStatus;
  readonly connectedAt: Date;
}>;

// Public/API-facing view of a connected account. Deliberately excludes the encrypted refresh
// token and granted scopes — the FR is explicit that tokens must NEVER be returned in any API
// response (SPEC.md, Data Protection).
export type ConnectedAccountView = Readonly<{
  readonly id: string;
  readonly customerId: string;
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly status: ConnectedAccountStatus;
  readonly connectedAt: string; // ISO8601
}>;

export type CreateConnectedAccountInput = Readonly<{
  readonly googleCustomerId: string;
  readonly accountName: string;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly oauthRefreshTokenEncrypted: string;
  readonly grantedScopes: string;
}>;
