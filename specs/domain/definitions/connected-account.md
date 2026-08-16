# Connected Account

## Definition

A Google Ads account the user has authorized `ads-manager` to access via OAuth. Introduced by the [`google-ads-connection`](../../../changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md) change (part of the [Google Ads Manager](../../../changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/SPEC.md) epic).

## Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Internal primary key |
| `googleCustomerId` | string | The Google Ads Customer ID (`XXX-XXX-XXXX`), unique |
| `accountName` | string | Account display name, as reported by Google Ads |
| `currencyCode` | string | Account currency (e.g. `BRL`, `USD`) |
| `timezone` | string | Account timezone (e.g. `America/Sao_Paulo`) |
| `status` | `active` \| `suspended` \| `needs_reconnect` | Connection health. `needs_reconnect` when the stored refresh token can no longer be used. |
| `oauthRefreshTokenEncrypted` | string | Refresh token, encrypted at rest (AES-256-GCM). Never exposed outside the server's model/DAL layers — no API response ever includes it. |
| `grantedScopes` | string | OAuth scopes granted at connection time |
| `connectedAt` | timestamp | When the account was first connected |
| `updatedAt` | timestamp | Last time the row changed (including reconnects) |

## Lifecycle

```text
                 (OAuth connect, new google_customer_id)
                              │
                              ▼
                          [active] ◄────────────┐
                              │                  │ reconnect
                              │ refresh token     │ (OAuth connect,
                              │ can't be used     │  existing google_customer_id
                              ▼                  │  with status=needs_reconnect)
                     [needs_reconnect] ──────────┘
                              │
                              │ user disconnects (any status)
                              ▼
                          (row deleted)
```

- Reconnecting **updates** the existing row (by `google_customer_id`, which is UNIQUE) rather than creating a duplicate.
- Disconnecting deletes the row entirely — no soft delete. The audit log of applied changes (introduced by the `mcp-suggestion-apply` change, not yet implemented) is a separate table and is retained independently of a Connected Account's lifecycle, per the epic's explicit decision.

## Relationships

- `Connected Account` 1—N `Campaign` (introduced by `campaign-performance-dashboard`, not yet implemented)
- `Connected Account` 1—N `Suggestion` (introduced by `ai-performance-analysis`, not yet implemented)

## Source

- Data model: `changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md` (Technical Design → Data Model)
- Schema: `components/databases/ads-manager-db/migrations/001_initial_schema.sql`
- DAL: `components/servers/ads-manager-server/src/dal/connected_accounts/`
