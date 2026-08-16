---
title: Google Ads Connection - Implementation Plan
change: google-ads-connection
type: feature
spec: ./SPEC.md
status: draft
created: 2026-08-16
sdd_version: 7.3.0
---

# Implementation Plan: Google Ads Connection

## Overview

**Spec:** [SPEC.md](./SPEC.md)
**Epic:** [Google Ads Manager](../../SPEC.md)

Primeiro change implementado do projeto — todos os 5 componentes do produto são novos e scaffolded aqui.

## Affected Components

- `config` (singleton)
- `ads-manager-api` (contract)
- `ads-manager-db` (database)
- `ads-manager-server` (server)
- `ads-manager-webapp` (webapp)

## Phases

### Phase 1: Component Scaffolding
**Agent:** Scaffolding é executado por componente via as skills `config-scaffolding`, `contract-scaffolding`, `database-scaffolding`, `backend-scaffolding` e `frontend-scaffolding` do tech pack `fullstack-typescript`.
**Standards:** `techpacks.routeSkills(phase: project-scaffolding)`

**Outcome:** Diretórios e boilerplate de todos os 5 componentes criados; `sdd/sdd-settings.yaml` atualizado com as entradas de `config`, `ads-manager-api`, `ads-manager-db`, `ads-manager-server`, `ads-manager-webapp`.

**Deliverables:**
- `components/config/` scaffolded
- `components/contracts/ads-manager-api/` scaffolded
- `components/databases/ads-manager-db/` scaffolded
- `components/servers/ads-manager-server/` scaffolded
- `components/webapps/ads-manager-webapp/` scaffolded
- `sdd/sdd-settings.yaml` com os 5 componentes registrados

### Phase 2: Contract (API) — `ads-manager-api`
**Agent:** `api-designer`
**Standards:** `techpacks.routeSkills(phase: implementation, component_type: contract)`

**Outcome:** Especificação OpenAPI 3.x cobrindo os 5 endpoints do SPEC.md (`GET /oauth/google-ads/start`, `GET /oauth/google-ads/callback`, `POST /accounts`, `GET /accounts`, `DELETE /accounts/:id`), com schemas de request/response e códigos de erro.

**Deliverables:**
- OpenAPI spec com os 5 endpoints
- Tipos TypeScript gerados a partir do spec

### Phase 3: Database — `ads-manager-db`
**Agent:** `db-advisor`
**Standards:** `techpacks.routeSkills(phase: implementation, component_type: database)`

**Outcome:** Tabela `connected_accounts` criada via migration, conforme Data Model do SPEC.md.

**Deliverables:**
- Migration criando `connected_accounts` (com índice único em `google_customer_id`)
- Camada de acesso a dados (queries tipadas) para create/list/delete

### Phase 4: Server — `ads-manager-server`
**Agent:** `backend-dev`
**Standards:** `techpacks.routeSkills(phase: implementation, component_type: server)`

**Outcome:** Implementação completa do fluxo OAuth (FR1-FR3), listagem/desconexão de contas (FR4-FR5) e detecção de token revogado (FR6), seguindo arquitetura CMDO.

**Deliverables:**
- Endpoints implementados conforme contrato (Phase 2)
- Integração com Google OAuth 2.0 (troca de código, validação de `state`)
- Integração com Google Ads API (`ListAccessibleCustomers` ou equivalente)
- Criptografia de `oauth_refresh_token_encrypted` em repouso
- Testes unitários passando (troca de token, criptografia, validação de state, parsing de contas MCC)

### Phase 5: Webapp — `ads-manager-webapp`
**Agent:** `frontend-dev`
**Standards:** `techpacks.routeSkills(phase: implementation, component_type: webapp)`

**Outcome:** Tela "Contas" completa: botão conectar, seleção de contas acessíveis (checkboxes, incluindo sub-contas MCC), lista de contas conectadas com os campos definidos no SPEC, confirmação em tela para desconectar, banner de "precisa reconectar".

**Deliverables:**
- Tela de Contas consumindo `ads-manager-api` via TanStack Query
- Estados de loading/vazio/erro
- Componente de confirmação inline (não `window.confirm`)

### Phase 6: Integration & E2E Testing
**Agent:** `tester`
**Standards:** `techpacks.routeSkills(phase: testing)`

**Outcome:** Testes de integração e E2E do SPEC.md passando.

> **Nota:** o epic decidiu deploy local simples, sem Kubernetes/Helm nesta fase. Os componentes formais `integration-testing`/`e2e-testing` do tech pack dependem de `helm` (execução via Testkube). Nesta fase, os testes de integração/E2E rodam localmente (Vitest/Playwright diretamente contra um ambiente local), sem scaffolding do componente `helm` nem de `integration-testing`/`e2e-testing` formais. Revisitar se o projeto migrar para deploy k8s.

**Deliverables:**
- Testes de integração do fluxo OAuth completo (sandbox), persistência, listagem e desconexão
- Teste E2E: conectar conta → ver na lista; desconectar → some da lista

### Phase 7: Review
**Agent:** `reviewer`
**Standards:** `techpacks.routeSkills(phase: verification)`

**Outcome:** Implementação verificada contra o SPEC.md (todos os AC1-AC6) e contra os `Specs Directory Changes` declarados (glossário, `connected-account.md`, caso de uso, `specs/INDEX.md`).

## Dependencies

- Pré-requisito de setup manual: projeto Google Cloud + client OAuth + developer token da Google Ads API (bloqueia Phase 4 e os testes de integração/E2E)

## Tests

### Unit Tests
- [ ] `test_oauth_code_exchange_success`
- [ ] `test_oauth_code_exchange_failure_does_not_persist_account`
- [ ] `test_refresh_token_encryption_roundtrip`
- [ ] `test_oauth_state_validation_rejects_invalid`
- [ ] `test_parse_accessible_accounts_includes_mcc_subaccounts`

### Integration Tests
- [ ] `test_full_oauth_flow_against_sandbox_account`
- [ ] `test_persist_selected_accounts_writes_encrypted_tokens`
- [ ] `test_list_connected_accounts_never_exposes_tokens`
- [ ] `test_disconnect_account_removes_record_and_stops_future_calls`
- [ ] `test_revoked_refresh_token_marks_account_needs_reconnect`

### E2E Tests
- [ ] `test_user_connects_account_and_sees_it_listed`
- [ ] `test_user_disconnects_account_and_it_disappears`

## Risks

| Risk | Mitigation |
|------|------------|
| Developer token da Google Ads API pode demorar para ser aprovado pelo Google | Levantar esse pré-requisito no início da Phase 4; usar contas de teste/sandbox enquanto o token de produção não é aprovado |
| Testes de integração/E2E sem helm/Testkube podem divergir do padrão do tech pack | Documentado na Phase 6; revisitar se o projeto adotar k8s no futuro |
| Biblioteca cliente da Google Ads API para Node/TypeScript pode ter breaking changes entre versões | Fixar versão no `package.json` do `ads-manager-server`; revisar changelog antes de atualizar |

## Implementation State

- **Current Phase:** Phase 4 (Server — ads-manager-server)
- **Status:** in_progress

### Completed Phases

- [x] Phase 1: Component Scaffolding
- [x] Phase 2: Contract — ads-manager-api
- [x] Phase 3: Database — ads-manager-db
- [ ] Phase 4: Server — ads-manager-server
- [ ] Phase 5: Webapp — ads-manager-webapp
- [ ] Phase 6: Integration & E2E Testing
- [ ] Phase 7: Review

### Actual Files Changed

**Phase 1:**
- `components/config/` — package.json, tsconfig.json, envs/{default,local}/config.yaml, schemas/config.schema.json, types/{index,server,webapp}.ts
- `components/contracts/ads-manager-api/` — openapi.yaml, package.json, .gitignore
- `components/databases/ads-manager-db/` — README.md, package.json, migrations/001_initial_schema.sql (placeholder), seeds/001_seed_data.sql (placeholder)
- `components/servers/ads-manager-server/` — CMDO skeleton (config/model/dal/operator/controller layers)
- `components/webapps/ads-manager-webapp/` — MVVM/React skeleton
- `sdd/sdd-settings.yaml` — 5 components registered
- Root `package.json` — workspace scripts for server/webapp

**Phase 2:**
- `components/contracts/ads-manager-api/openapi.yaml` — OpenAPI 3.0.3 spec, 5 endpoints, shared error schema
- `components/contracts/ads-manager-api/.spectral.yaml` — lint ruleset (spectral:oas), 0 errors
- `components/contracts/ads-manager-api/package.json` — added `generate-types`/`lint` scripts
- Fixed infra bug from Phase 1: `package.json` deps used pnpm-only `workspace:*` protocol (incompatible with npm workspaces) in `ads-manager-server` and `ads-manager-webapp`; also `ads-manager-webapp` referenced invalid package name `@ads-manager/config/types` instead of `@ads-manager/config`. Fixed both; root `npm install` now succeeds.
- `package-lock.json` — created (852 packages)

**Phase 3:**
- `components/databases/ads-manager-db/migrations/001_initial_schema.sql` — `connected_accounts` table (pgcrypto, CHECK em status, UNIQUE em google_customer_id)
- `components/databases/ads-manager-db/seeds/001_seed_data.sql` — vazio (sem seed necessário)
- `components/databases/ads-manager-db/README.md` — documenta o schema
- `components/servers/ads-manager-server/src/dal/connected_accounts/` — DAL completo (create, findAll, findByCustomerId, findById, updateStatus, delete) com queries parametrizadas via `pg`

### Blockers

None currently. Pré-requisito de setup manual (Google Cloud + OAuth client + developer token) ainda pendente — necessário antes de testar Phase 4 fim a fim.

Erros de typecheck pré-existentes no scaffolding do server (`create_database.ts` referencia `databaseUrl` inexistente em `Config`; `create_operator.ts` importa stubs placeholder `findGreetingById`/`insertGreeting` do template) — não tocam o DAL novo, serão corrigidos na Phase 4 junto com a implementação real do operator/config.
