# Architecture Overview

This document describes the architecture of ads-manager.

## Components

- **config** (type: `config`) — Centralized project configuration; singleton, read by all other components.
- **ads-manager-api** (type: `contract`) — OpenAPI 3.x contract defining the surface between `ads-manager-webapp` and `ads-manager-server`.
- **ads-manager-db** (type: `database`) — PostgreSQL database. Currently owns the `connected_accounts` table.
- **ads-manager-server** (type: `server`) — Node.js/TypeScript backend (CMDO architecture). Handles Google OAuth, calls the Google Ads API, encrypts/decrypts refresh tokens, and exposes the endpoints defined by `ads-manager-api`.
- **ads-manager-webapp** (type: `webapp`) — React/TypeScript frontend (MVVM architecture). Currently implements the "Contas" screen (connect/list/disconnect Google Ads accounts).

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

## Deployment

Local deploy only for now (no Kubernetes/Helm) — an explicit decision made when scoping the `google-ads-manager` epic. Revisit if/when the project needs multi-environment or production deployment.

## Planned (not yet implemented)

The `google-ads-manager` epic plans three more changes after `google-ads-connection`: `campaign-performance-dashboard` (campaign metrics), `ai-performance-analysis` (Claude-driven suggestions), and `mcp-suggestion-apply` (applying suggestions via the `google-ads-mcp-rw` MCP server). See `changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/PLAN.md`.


