# Campaign (Metrics Cache)

## Definition

A cached snapshot of a single Google Ads campaign's performance metrics for a [Connected Account](./connected-account.md) and a specific date range. Introduced by the [`campaign-performance-dashboard`](../../../changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/campaign-performance-dashboard/SPEC.md) change (part of the [Google Ads Manager](../../../changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/SPEC.md) epic).

Despite the name "Campaign" in the domain, this row is a **cache entry**, not the source of truth — the Google Ads account itself is. Existing purely to avoid hitting Google Ads API rate limits on every dashboard view.

## Attributes

| Attribute | Type | Description |
|-----------|------|--------------|
| `id` | UUID | Internal primary key |
| `connectedAccountId` | UUID | FK to `connected_accounts.id`, `ON DELETE CASCADE` |
| `googleCampaignId` | string | The Google Ads Campaign ID |
| `campaignName` | string | Campaign display name, as reported by Google Ads |
| `status` | `ENABLED` \| `PAUSED` \| `REMOVED` | Campaign status, Google Ads API values |
| `dateRangeStart` / `dateRangeEnd` | date | Inclusive period this snapshot covers |
| `impressions`, `clicks` | integer | Raw counts |
| `costMicros` | integer | Cost in micros (see [Micros](../glossary.md)) |
| `conversions`, `conversionsValue` | number | Raw conversion volume and value |
| `budgetMicros` | integer, nullable | Campaign daily budget in micros |
| `fetchedAt` | timestamp | When this row was last refreshed from the Google Ads API — used to compute cache staleness (15-minute TTL) |

Derived metrics (CTR, average CPC, conversion rate, cost per conversion, ROAS) are **not stored** — they're computed at read time from the raw values above, handling division-by-zero (0 clicks/conversions/cost) as 0 rather than `NaN`/`Infinity`.

## Uniqueness

One row per `(connectedAccountId, googleCampaignId, dateRangeStart, dateRangeEnd)` — refetching the same account+campaign+period upserts the existing row rather than creating a new one.

## Lifecycle

- Written/updated by `GET /accounts/:id/campaigns` (fetch-or-serve-cache flow).
- Deleted automatically when its parent [Connected Account](./connected-account.md) is disconnected (`ON DELETE CASCADE`) — the cache has no independent retention value once the account it describes is gone.
- Never marked "stale" in the row itself — staleness is a derived, read-time judgment (`fetchedAt` older than 15 minutes, or a live fetch failed and this is the last-known-good data).

## Source

- Data model: `changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/campaign-performance-dashboard/SPEC.md` (Technical Design → Data Model)
- Schema: `components/databases/ads-manager-db/migrations/002_campaign_metrics_cache.sql`
- DAL: `components/servers/ads-manager-server/src/dal/campaign_metrics_cache/`
- Fetch/cache orchestration: `components/servers/ads-manager-server/src/model/use-cases/fetch_campaign_metrics.ts`
