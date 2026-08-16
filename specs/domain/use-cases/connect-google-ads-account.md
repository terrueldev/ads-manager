# Use Case: Connect a Google Ads Account

## Actor

The account owner (single-user application — no login/authorization layer).

## Goal

Authorize `ads-manager` to access one or more Google Ads accounts, so campaign data can be retrieved and, later, so approved improvements can be applied.

## Preconditions

- A Google Cloud project with an OAuth client and a Google Ads API developer token has been configured (manual setup prerequisite; see `google-ads-connection` SPEC.md → Dependencies).

## Main Flow

1. User clicks "Conectar conta" on the Contas screen.
2. The webapp requests an authorization URL from the server (`GET /oauth/google-ads/start`) and navigates the browser to Google's consent screen.
3. User grants consent. Google redirects the browser back to the webapp (`/contas/callback`) with an authorization code.
4. The webapp calls the server's callback endpoint (`GET /oauth/google-ads/callback`), which exchanges the code for tokens and lists every Google Ads account accessible to that identity (including sub-accounts of a manager/MCC account).
5. The webapp shows the accessible accounts as a checklist; accounts already connected (and healthy) are shown disabled.
6. User selects one or more accounts and confirms.
7. The webapp calls `POST /accounts` with the selected Customer IDs. The server persists each as a [Connected Account](../definitions/connected-account.md), encrypting the refresh token.
8. The newly connected accounts appear in the Contas list.

## Alternate Flow: Reconnecting

If a Connected Account's status is `needs_reconnect` (its stored token stopped working), the user re-runs the Main Flow. In step 5, that account still appears selectable (not disabled). In step 7, the server updates the existing row in place (same `google_customer_id`) instead of creating a duplicate, and its status returns to `active`.

## Alternate Flow: Disconnecting

1. User clicks "Desconectar" on a connected account's row.
2. The webapp shows an inline confirmation (not a native browser dialog).
3. On confirmation, the webapp calls `DELETE /accounts/:id`. The server removes the account and its stored token. No further API calls are made for that account.

## Error Cases

See `google-ads-connection` SPEC.md → Error Handling for the full table (OAuth denied, invalid `state`, Google Ads API failure, duplicate account, account not found on disconnect).

## Source

`changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md` (FR1-FR6, AC1-AC6)
