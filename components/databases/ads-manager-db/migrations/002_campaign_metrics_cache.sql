-- Migration: 002_campaign_metrics_cache
-- Description: Adds campaign_metrics_cache table (cache of Google Ads campaign
--   metrics per connected account + date range, see SPEC: Campaign Performance Dashboard)
-- Created: 2026-08-16

BEGIN;

-- Cached snapshot of a campaign's metrics for a connected account + date range.
-- Populated/refreshed by GET /accounts/:id/campaigns; TTL (15 min) and staleness
-- handling live in the server layer, not here.
CREATE TABLE IF NOT EXISTS campaign_metrics_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connected_account_id UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
    google_campaign_id VARCHAR(32) NOT NULL,
    campaign_name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL, -- ENABLED | PAUSED | REMOVED (Google Ads API values)
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    impressions BIGINT NOT NULL DEFAULT 0,
    clicks BIGINT NOT NULL DEFAULT 0,
    cost_micros BIGINT NOT NULL DEFAULT 0,
    conversions NUMERIC NOT NULL DEFAULT 0,
    conversions_value NUMERIC NOT NULL DEFAULT 0,
    budget_micros BIGINT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_campaign_metrics_cache_account_campaign_range
        UNIQUE (connected_account_id, google_campaign_id, date_range_start, date_range_end)
);

COMMIT;
