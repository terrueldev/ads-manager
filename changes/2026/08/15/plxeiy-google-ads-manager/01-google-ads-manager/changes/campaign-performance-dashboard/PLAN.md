---
title: Campaign Performance Dashboard - Implementation Plan
change: campaign-performance-dashboard
type: feature
spec: ./SPEC.md
status: draft
created: 2026-08-16
sdd_version: 7.3.0
---

# Implementation Plan: Campaign Performance Dashboard

## Overview

**Spec:** [SPEC.md](./SPEC.md)
**Epic:** [Google Ads Manager](../../SPEC.md)
**Depende de:** [google-ads-connection](../google-ads-connection/SPEC.md) (implementado e aprovado)

Todos os 5 componentes já existem (scaffolded em `google-ads-connection`) — este change só os modifica, sem fase de scaffolding.

## Affected Components

- `ads-manager-db` (nova tabela)
- `ads-manager-api` (novo endpoint)
- `ads-manager-server` (lógica de fetch/cache)
- `ads-manager-webapp` (tela de Dashboard)

## Phases

### Phase 1: Database — `ads-manager-db`
**Agent:** `db-advisor`
**Standards:** `techpacks.routeSkills(phase: implementation, component_type: database)`

**Outcome:** Tabela `campaign_metrics_cache` criada via migration incremental, conforme Data Model do SPEC.md.

**Deliverables:**
- Migration `002_campaign_metrics_cache.sql`
- DAL (`ads-manager-server/src/dal/campaign_metrics_cache/`): upsert por chave composta, find por conta+período

### Phase 2: Contract — `ads-manager-api`
**Agent:** `api-designer`
**Standards:** `techpacks.routeSkills(phase: implementation, component_type: contract)`

**Outcome:** Endpoint `GET /accounts/:id/campaigns` adicionado ao OpenAPI existente, com os schemas de request/response e erros do SPEC.md.

**Deliverables:**
- `openapi.yaml` atualizado
- Tipos TypeScript regenerados (`generate-types`)

### Phase 3: Server — `ads-manager-server`
**Agent:** `backend-dev`
**Standards:** `techpacks.routeSkills(phase: implementation, component_type: server)`

**Outcome:** Fluxo completo de FR1-FR5 implementado: seleção de conta (reaproveita `GET /accounts`), busca com cache/TTL, integração GAQL via `google-ads-api` (já uma dependência), cálculo de métricas derivadas, wiring de `handleTokenRefreshFailure` no caminho de falha de autenticação.

**Deliverables:**
- Use-cases: `fetchCampaignMetrics` (orquestra cache/API/fallback), `calculateDerivedMetrics`
- Endpoint `GET /accounts/:id/campaigns`
- Testes unitários (ver Tests)

### Phase 4: Webapp — `ads-manager-webapp`
**Agent:** `frontend-dev`
**Standards:** `techpacks.routeSkills(phase: implementation, component_type: webapp)`

**Outcome:** Tela de Dashboard: seletor de conta, seletor de período, tabela de campanhas, banner de "desatualizado", botão "Atualizar", aviso de `needs_reconnect`.

**Deliverables:**
- Rota `/dashboard` (ou seção equivalente), nova entrada na sidebar
- Estados de loading/vazio/erro/desatualizado

### Phase 5: Integration Testing
**Agent:** `tester`
**Standards:** `techpacks.routeSkills(phase: testing)`

**Outcome:** Testes de integração do SPEC.md passando contra Postgres real local (mesmo padrão de `google-ads-connection`: Docker Postgres, Google Ads mockado via `MOCK_GOOGLE_ADS`).

**Deliverables:**
- Testes de integração: cache hit/miss, TTL, fallback com/sem cache, bloqueio needs_reconnect

### Phase 6: Review
**Agent:** `reviewer`
**Standards:** `techpacks.routeSkills(phase: verification)`

**Outcome:** Implementação verificada contra SPEC.md (AC1-AC7) e `Specs Directory Changes` declarados.

## Dependencies

- Requer `google-ads-connection` implementado (feito) — usa `connected_accounts`, cliente Google Ads configurado.
- Requer developer token real da Google Ads API para teste fim a fim contra API real (já configurado pelo usuário para `google-ads-connection`).

## Tests

### Unit Tests
- [ ] `test_calculate_derived_metrics_from_raw_values`
- [ ] `test_calculate_derived_metrics_handles_zero_clicks_and_zero_conversions`
- [ ] `test_cache_valid_within_ttl_skips_api_call`
- [ ] `test_refresh_true_bypasses_ttl`
- [ ] `test_auth_failure_triggers_handle_token_refresh_failure`
- [ ] `test_generic_failure_does_not_trigger_reconnect`

### Integration Tests
- [ ] `test_fetch_success_writes_cache_to_postgres`
- [ ] `test_second_request_within_ttl_does_not_call_google_ads_mock`
- [ ] `test_api_failure_with_existing_cache_returns_stale_true`
- [ ] `test_api_failure_without_cache_returns_error`
- [ ] `test_needs_reconnect_account_returns_409_without_calling_api`

## Risks

| Risk | Mitigation |
|------|------------|
| Suporte exato do `google-ads-api` para GAQL de métricas de campanha ainda não confirmado na prática | Validar cedo na Phase 3; ajustar query conforme a lib exigir |
| Orçamento em nível de grupo de orçamento compartilhado (não por campanha) | Tratar como gap conhecido (ver SPEC.md > Gaps & Assumptions); ajustar se a conta de teste usar esse modelo |

## Implementation State

- **Current Phase:** Aguardando aprovação deste plano
- **Status:** pending

### Completed Phases

- [ ] Phase 1: Database
- [ ] Phase 2: Contract
- [ ] Phase 3: Server
- [ ] Phase 4: Webapp
- [ ] Phase 5: Integration Testing
- [ ] Phase 6: Review

### Actual Files Changed

Nenhum ainda.

### Blockers

Nenhum.
