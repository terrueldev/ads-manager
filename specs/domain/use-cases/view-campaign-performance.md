# Use Case: View Campaign Performance

## Actor

The account owner (single-user application — no login/authorization layer).

## Goal

See how a connected Google Ads account's campaigns are performing over a chosen date range, without needing to open the Google Ads UI.

## Preconditions

- At least one [Connected Account](../definitions/connected-account.md) exists and is `active` (see [Connect a Google Ads Account](./connect-google-ads-account.md)).

## Main Flow

1. User opens the Dashboard screen. The account selector defaults to the first connected account; a period selector defaults to the last 30 days.
2. The webapp requests `GET /accounts/:id/campaigns` for the selected account and period.
3. If cached data exists and is less than 15 minutes old, the server returns it directly (no Google Ads API call).
4. Otherwise, the server queries the Google Ads API for campaign metrics, updates the cache, and returns fresh data.
5. The webapp renders the campaign list — name, status, impressions, clicks, CTR, average CPC, cost, conversions, conversion rate, cost per conversion, ROAS, budget — sorted by cost, descending.
6. The user may switch account, change the period (presets: 7/30/90 days, or a custom range), or click "Atualizar" to force a fresh fetch (bypassing the cache).

## Alternate Flow: API Unavailable, Cache Exists

If the live Google Ads API call fails (rate limit, transient error) but a cache row exists for that account+period (even if older than 15 minutes), the server returns the cached data with a `stale: true` flag. The webapp shows the data normally, with a banner noting when it was last successfully fetched.

## Alternate Flow: API Unavailable, No Cache

If the API call fails and no cache exists at all for that account+period, the server returns an error. The webapp shows a clear error message — never fabricated or zeroed-out data.

## Alternate Flow: Account Needs Reconnecting

If the selected account's status is `needs_reconnect`, or a fetch fails specifically due to an invalid/revoked token (which also flips the account to `needs_reconnect`), the webapp shows a message directing the user to the Contas screen to reconnect, instead of attempting a call that would fail.

## Error Cases

See `campaign-performance-dashboard` SPEC.md → Error Handling for the full table (invalid date range, account not found, needs reconnect, Google Ads API failure).

## Source

`changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/campaign-performance-dashboard/SPEC.md` (FR1-FR5, AC1-AC7)
