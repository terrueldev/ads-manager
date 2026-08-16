-- Migration: 001_initial_schema
-- Description: Initial database schema for ads-manager — connected_accounts table
-- Created: 2026-08-15

BEGIN;

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Google Ads accounts connected via OAuth (see SPEC: Google Ads Connection)
CREATE TABLE IF NOT EXISTS connected_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_customer_id VARCHAR(32) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    currency_code VARCHAR(8) NOT NULL,
    timezone VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    oauth_refresh_token_encrypted TEXT NOT NULL,
    granted_scopes TEXT NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_connected_accounts_google_customer_id UNIQUE (google_customer_id),
    CONSTRAINT chk_connected_accounts_status CHECK (status IN ('active', 'suspended', 'needs_reconnect'))
);

COMMIT;
