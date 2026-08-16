# Architecture Overview

This document describes the architecture of ads-manager.

## Components

- **config** (type: `config`) — Centralized project configuration; singleton, read by all other components.
- **ads-manager-api** (type: `contract`) — OpenAPI 3.x contract defining the surface between `ads-manager-webapp` and `ads-manager-server`.
- **ads-manager-db** (type: `database`) — PostgreSQL database. Owns `connected_accounts` and `campaign_metrics_cache`.
- **ads-manager-server** (type: `server`) — Node.js/TypeScript backend (CMDO architecture). Handles Google OAuth, calls the Google Ads API (account connection + campaign metrics), encrypts/decrypts refresh tokens, caches campaign metrics with a 15-minute TTL, and exposes the endpoints defined by `ads-manager-api`.
- **ads-manager-webapp** (type: `webapp`) — React/TypeScript frontend (MVVM architecture). Implements the "Contas" screen (connect/list/disconnect Google Ads accounts) and the "Dashboard" screen (campaign performance by account/period).

## Data Flow (google-ads-connection)

```text
Browser ──► ads-manager-webapp (Contas screen)
              │
              │ REST (ads-manager-api contract)
              ▼
        ads-manager-server
              │
              ├──► Google OAuth 2.0 (google-auth-library)
              ├──► Google Ads API (google-ads-api)
              └──► ads-manager-db (connected_accounts, via DAL)
```

## Data Flow (campaign-performance-dashboard)

```text
Browser ──► ads-manager-webapp (Dashboard screen)
              │
              │ REST: GET /accounts/:id/campaigns
              ▼
        ads-manager-server
              │
              ├──► ads-manager-db (campaign_metrics_cache) — cache read, 15min TTL
              │       │
              │       └── cache hit & fresh ──► return cached data
              │
              └──► Google Ads API (google-ads-api) — on cache miss/expired/refresh=true
                      │
                      ├── success ──► upsert cache, return fresh data
                      ├── auth failure ──► handleTokenRefreshFailure (marks account needs_reconnect)
                      └── generic failure ──► fall back to existing cache (stale: true), or error if none
```

## Deployment

Local deploy only for now (no Kubernetes/Helm) — an explicit decision made when scoping the `google-ads-manager` epic. Revisit if/when the project needs multi-environment or production deployment. The epic's plan (see PLAN.md) adds a `production-deploy` step after all functional changes and the visual design system are complete.

## Planned (not yet implemented)

The `google-ads-manager` epic plans two more functional changes after `campaign-performance-dashboard`: `ai-performance-analysis` (Claude-driven suggestions, will consume `campaign_metrics_cache` as context) and `mcp-suggestion-apply` (applying suggestions via the `google-ads-mcp-rw` MCP server). A full light+dark design system for `ads-manager-webapp`, and a final `production-deploy` step, are both deferred until the functional changes are done. See `changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/PLAN.md`.


