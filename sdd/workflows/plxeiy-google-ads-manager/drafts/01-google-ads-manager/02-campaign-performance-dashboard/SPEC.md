---
title: Campaign Performance Dashboard
spec_type: tech
type: feature
parent_epic: ../../SPEC.md
status: active
domain: Ads Management
issue: N/A
created: 2026-08-16
updated: 2026-08-16
sdd_version: 7.3.0
affected_components:
  - ads-manager-server
  - ads-manager-db
  - ads-manager-api
  - ads-manager-webapp
---

# Campaign Performance Dashboard

## Overview

Permite ver como as campanhas de uma conta conectada estão performando: uma lista de campanhas com métricas-chave para um período selecionado, com cache para não estourar limites da Google Ads API e um indicador claro quando os dados exibidos estão desatualizados. Segundo change do epic [Google Ads Manager](../../SPEC.md) — depende de [`google-ads-connection`](../google-ads-connection/SPEC.md) e é pré-requisito para `ai-performance-analysis`.

### Background

Conectar uma conta ([`google-ads-connection`](../google-ads-connection/SPEC.md)) não é útil sozinho — o valor da ferramenta começa quando o usuário consegue ver a performance das campanhas sem abrir o painel do Google Ads.

### Current State

Contas podem ser conectadas/desconectadas, mas nenhum dado de campanha é buscado ou exibido ainda.

## User Stories

- Como dono da conta, quero ver as métricas-chave das minhas campanhas, para avaliar rapidamente a performance. (herdado do epic)

## Functional Requirements

### FR1: Seleção de Conta

**Description:** O usuário escolhe qual conta conectada visualizar.

**Behavior:**
- Um seletor (dropdown) lista as contas conectadas (via `GET /accounts`, já existente).
- Apenas uma conta é visualizada por vez nesta v1 (sem agregação multi-conta).

**Constraints:**
- Se a conta selecionada tiver status `needs_reconnect`, o dashboard exibe um aviso e não tenta buscar dados dela.

### FR2: Seleção de Período

**Description:** O usuário escolhe o intervalo de datas das métricas.

**Behavior:**
- Presets: últimos 7, 30 (padrão) e 90 dias, mais um seletor de intervalo customizado.

### FR3: Buscar e Exibir Campanhas

**Description:** Lista de campanhas da conta+período selecionados.

**Behavior:**
- Cada linha mostra: nome, status, impressões, cliques, CTR, CPC médio, custo, conversões, taxa de conversão, custo/conversão, ROAS, orçamento diário vs. gasto no período.
- Ordenadas por custo decrescente.
- CTR, CPC médio, taxa de conversão, custo/conversão e ROAS são calculados a partir dos valores brutos (impressões, cliques, custo, conversões, valor de conversão) — não armazenados como colunas próprias.

### FR4: Cache com TTL

**Description:** Evitar bater na Google Ads API a cada visualização.

**Behavior:**
- Dados de campanha (conta+período) ficam em cache por 15 minutos.
- Um botão "Atualizar" força um novo fetch, ignorando o cache.
- Ao buscar com sucesso, o cache é atualizado com o novo `fetched_at`.

### FR5: Degradação Graciosa

**Description:** Se a Google Ads API falhar, não quebrar a tela.

**Behavior:**
- Se existir cache (mesmo expirado) para a conta+período: exibi-lo com indicador visual de "desatualizado" e o horário do último fetch bem-sucedido.
- Se não existir cache algum para essa conta+período: exibir mensagem de erro clara, sem dado nenhum.
- Se a falha for especificamente de autenticação/token (não apenas rate limit): marcar a conta como `needs_reconnect` (reaproveitando `handleTokenRefreshFailure`, implementado em `google-ads-connection` mas ainda não chamado por nenhum endpoint).

## Non-Functional Requirements

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Performance | Dashboard carrega em poucos segundos quando há cache válido | Teste manual / tempo de resposta do endpoint |
| Confiabilidade | Falha da Google Ads API não derruba a tela — cache ou erro claro, nunca uma tela quebrada | Teste de integração com API mockada falhando |
| Segurança | Herdado do epic: toda chamada à Google Ads API acontece só no `ads-manager-server` | Revisão de código |

## Technical Design

### Architecture

```
webapp (Dashboard) ---> ads-manager-api (contract) ---> ads-manager-server
                                                                │
                                                                ├──> cache lookup/write (ads-manager-db)
                                                                └──> Google Ads API (google-ads-api, já integrado em google-ads-connection)
```

### Data Model

**New Table:**

```sql
CREATE TABLE campaign_metrics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_account_id UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  google_campaign_id VARCHAR(32) NOT NULL,
  campaign_name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL, -- ENABLED | PAUSED | REMOVED (valores da Google Ads API)
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC NOT NULL DEFAULT 0,
  conversions_value NUMERIC NOT NULL DEFAULT 0,
  budget_micros BIGINT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connected_account_id, google_campaign_id, date_range_start, date_range_end)
);
```

Valores monetários armazenados em micros (padrão da Google Ads API, 1 unidade monetária = 1.000.000 micros) para evitar erros de arredondamento; convertidos para exibição na camada de apresentação.

### Algorithms / Business Logic

**Fluxo de busca (`GET /accounts/:id/campaigns`):**

1. Valida que a conta existe e não está `needs_reconnect` (senão, erro dedicado).
2. Se `refresh=true` NÃO foi passado e existe cache com `fetched_at` dentro de 15 minutos para essa conta+período: retorna o cache (`stale: false`).
3. Caso contrário, tenta buscar dados reais na Google Ads API (GAQL: métricas de campanha para o período).
4. Sucesso: grava/atualiza o cache (`UPSERT` por `connected_account_id + google_campaign_id + date_range`), retorna dados frescos (`stale: false`).
5. Falha de autenticação/token: chama `handleTokenRefreshFailure` (marca conta `needs_reconnect`), retorna erro dedicado.
6. Falha genérica (rate limit, indisponibilidade) com cache existente (mesmo vencido): retorna o cache (`stale: true`, com `fetched_at` do último sucesso).
7. Falha genérica sem cache existente: retorna erro.

**Edge Cases:**
- Conta sem nenhuma campanha: lista vazia, não é erro.
- Duas requisições simultâneas de refresh para a mesma conta+período: idempotente via UPSERT, sem duplicar linhas (constraint UNIQUE cobre isso).
- Período customizado com `start > end`: validação rejeita antes de chamar a API.

## API Contract

### Endpoints

| Method | Path | Description | Auth |
|--------|------|--------------|------|
| GET | `/accounts/:id/campaigns` | Lista campanhas + métricas de uma conta, para um período; `?range=7d\|30d\|90d\|custom&start=&end=&refresh=true\|false` | N/A |

(Reaproveita `GET /accounts` já existente de `google-ads-connection` para popular o seletor de conta.)

### Request/Response Schemas

**GET /accounts/:id/campaigns?range=30d&refresh=false**

Response (200):
```json
{
  "campaigns": [
    {
      "campaign_id": "111222333",
      "name": "Campanha Institucional",
      "status": "ENABLED",
      "impressions": 12345,
      "clicks": 234,
      "ctr": 0.019,
      "avg_cpc": 1.25,
      "cost": 292.5,
      "conversions": 8,
      "conversion_rate": 0.034,
      "cost_per_conversion": 36.56,
      "roas": 3.2,
      "budget": 50.0
    }
  ],
  "fetched_at": "2026-08-16T11:00:00.000Z",
  "stale": false
}
```

Error Responses:
| Status | Code | Description |
|--------|------|--------------|
| 400 | INVALID_DATE_RANGE | `start` > `end`, ou parâmetros de período inválidos |
| 404 | ACCOUNT_NOT_FOUND | Conta não encontrada |
| 409 | ACCOUNT_NEEDS_RECONNECT | Conta está com status `needs_reconnect`; usuário precisa reconectar antes de ver dados |
| 502 | GOOGLE_ADS_API_ERROR | Falha ao buscar dados e nenhum cache disponível para exibir |

## Security Considerations

- Herdado do epic: toda chamada à Google Ads API acontece exclusivamente no `ads-manager-server`; o cache de métricas fica no banco, nunca inclui tokens.

## Error Handling

| Error Scenario | User Message | Log Level | Recovery |
|-----------------|---------------|-----------|----------|
| Conta needs_reconnect | "Esta conta precisa ser reconectada antes de ver os dados" + link para reconectar | INFO | Fluxo de reconexão (google-ads-connection) |
| Falha da API com cache disponível | Dados exibidos normalmente + banner "Dados desatualizados desde HH:MM" | WARN | Botão "Atualizar" permite retry |
| Falha da API sem cache | "Não foi possível carregar os dados desta conta agora. Tente novamente." | ERROR | Retry manual |
| Intervalo de datas inválido | "Data final deve ser depois da data inicial" | WARN | Corrigir input |

## Observability

### Logging

| Event | Level | Fields |
|-------|-------|--------|
| Cache hit | INFO | account_id, date_range |
| Cache miss / refresh | INFO | account_id, date_range, campaign_count |
| Falha ao buscar campanhas | WARN/ERROR | account_id, reason |

### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| campaign_fetch_total | counter | result (fresh/cache/stale/error) |
| campaign_fetch_duration | histogram | - |

## Acceptance Criteria

- [ ] **AC1:** Given uma conta conectada e o período padrão (30 dias), when o usuário abre o dashboard, then as campanhas aparecem com todas as métricas, ordenadas por custo decrescente.
- [ ] **AC2:** Given o usuário troca o período (preset ou customizado), when aplica, then as campanhas são atualizadas para refletir o novo período.
- [ ] **AC3:** Given dados em cache há menos de 15 minutos, when o usuário reabre a tela, then os dados carregam do cache sem nova chamada à API (a menos que clique "Atualizar").
- [ ] **AC4:** Given a Google Ads API está indisponível e existe cache para aquela conta+período, then os dados do cache são exibidos com indicador de "desatualizado" e horário do último fetch.
- [ ] **AC5:** Given a Google Ads API está indisponível e não existe cache, then uma mensagem de erro clara é exibida, sem dados falsos.
- [ ] **AC6:** Given múltiplas contas conectadas, when o usuário troca a conta no seletor, then o dashboard mostra as campanhas daquela conta.
- [ ] **AC7:** Given uma conta com status `needs_reconnect`, when o usuário tenta ver seu dashboard, then é avisado para reconectar em vez de uma tentativa de busca que falharia.

## Domain Model

### Entities

| Entity | Definition | Spec Path | Status |
|--------|------------|-----------|--------|
| Campaign (cache) | Snapshot em cache das métricas de uma campanha do Google Ads, para uma conta e período | specs/domain/definitions/campaign-metrics-cache.md | New |

### Relationships

```text
Connected Account (google-ads-connection) 1───N Campaign (cache, este change)
```

### Glossary

| Term | Definition | First Defined In |
|------|------------|-------------------|
| ROAS | Return on Ad Spend — valor de conversão dividido pelo custo | Este spec |
| Micros | Unidade monetária da Google Ads API: 1 unidade real = 1.000.000 micros | Este spec |

### Bounded Contexts

- **Ads Integration** (do epic): este change adiciona a busca/cache de métricas de campanha.

## Specs Directory Changes

### Before

```text
specs/domain/
├── glossary.md
├── definitions/
│   └── connected-account.md
└── use-cases/
    └── connect-google-ads-account.md
```

### After

```text
specs/domain/
├── glossary.md                                   # + ROAS, Micros
├── definitions/
│   ├── connected-account.md
│   └── campaign-metrics-cache.md                 # NOVO
└── use-cases/
    ├── connect-google-ads-account.md
    └── view-campaign-performance.md               # NOVO
```

### Changes Summary

| Path | Action | Description |
|------|--------|-------------|
| `specs/domain/glossary.md` | Modify | Adiciona ROAS e Micros |
| `specs/domain/definitions/campaign-metrics-cache.md` | Create | Definição da entidade de cache de métricas |
| `specs/domain/use-cases/view-campaign-performance.md` | Create | Caso de uso do dashboard |
| `specs/architecture/overview.md` | Modify | Atualiza fluxo de dados com a busca/cache de campanhas |
| `specs/INDEX.md` | Modify | Registra `google-ads-manager-3` |

## Components

> New components will be scaffolded during implementation.

### New Components

Nenhum novo componente — reaproveita os 5 já existentes (`config`, `ads-manager-api`, `ads-manager-db`, `ads-manager-server`, `ads-manager-webapp`).

### Modified Components

| Component | Changes |
|-----------|---------|
| `ads-manager-db` | Nova tabela `campaign_metrics_cache` |
| `ads-manager-server` | Novo endpoint, integração de leitura da Google Ads API (campanhas), wiring de `handleTokenRefreshFailure` |
| `ads-manager-api` | Novo endpoint no contrato OpenAPI |
| `ads-manager-webapp` | Nova tela/seção de Dashboard |

## System Analysis

### Inferred Requirements

- UPSERT no cache por chave composta para evitar duplicatas em requisições concorrentes.

### Gaps & Assumptions

- Assume-se que a lib `google-ads-api` (já integrada em `google-ads-connection`) suporta consultas GAQL de métricas de campanha por período — a ser confirmado durante a implementação.
- Assume-se que orçamento (`budget`) vem em nível de campanha (não de grupo de orçamento compartilhado) — se a conta usar orçamento compartilhado, ajustar durante a implementação.

### Cross-References

- Depende de [`google-ads-connection`](../google-ads-connection/SPEC.md) — usa `connected_accounts`, o cliente Google Ads já configurado, e `handleTokenRefreshFailure`.
- Pré-requisito para `ai-performance-analysis`, que consumirá estes dados de campanha como contexto para o Claude.

## Requirements Discovery

### Solicitation Phase

| # | Question | Answer | Source |
|---|----------|--------|--------|
| S1 | Seleção de conta (uma vs. agregada)? Ordenação/filtro padrão da lista? Estratégia de cache (TTL, botão manual)? Paginação/busca? | Usuário delegou ("decida as melhores opções e manda bala"). Definido: seletor de conta única; lista completa ordenada por custo decrescente; cache de 15 min + botão "Atualizar"; sem paginação/busca | Assistant (recommended, user delegated decision) |

### User Feedback & Corrections

- 2026-08-16: usuário pediu para adicionar um step de deploy em produção ao final do epic (change `production-deploy`, após os 4 changes funcionais e o design system, ambos deferidos) — registrado no PLAN.md do epic, não faz parte deste change.

### Open Questions (BLOCKING)

Nenhuma.

## Testing Strategy

### Unit Tests

| Component | Test Case | Expected Behavior |
|-----------|-----------|---------------------|
| ads-manager-server | Cálculo de CTR/CPC médio/taxa de conversão/custo por conversão/ROAS a partir de valores brutos | Valores corretos, incluindo divisão por zero (0 cliques, 0 conversões) tratada sem crash |
| ads-manager-server | Decisão cache válido vs. expirado (TTL 15 min) | Usa cache dentro do TTL; ignora (mas mantém) cache expirado quando `refresh=true` |
| ads-manager-server | Falha de autenticação aciona `handleTokenRefreshFailure` | Conta marcada `needs_reconnect`; falha genérica não aciona |

### Integration Tests

| Scenario | Components | Expected Outcome |
|----------|------------|--------------------|
| Fetch com sucesso (Google Ads mockado) grava cache no Postgres real | server → db | Linha criada/atualizada em `campaign_metrics_cache` |
| Segunda requisição dentro do TTL não chama a Google Ads API mockada | server → db | Mock não é chamado; dado vem do cache |
| Falha da API mockada com cache existente retorna `stale: true` | server → db | Resposta reflete o cache antigo com flag de desatualizado |
| Falha da API mockada sem cache retorna erro | server | 502 GOOGLE_ADS_API_ERROR |
| Conta `needs_reconnect` retorna erro dedicado sem tentar buscar | server | 409 ACCOUNT_NEEDS_RECONNECT |

### Test Data

| Entity | Required State | Purpose |
|--------|------------------|---------|
| Connected Account | `active`, com campanhas mockadas | Caminho feliz |
| Connected Account | `needs_reconnect` | Testar bloqueio antes da busca |
| `campaign_metrics_cache` | Linha com `fetched_at` > 15 min atrás | Testar caminho de dado desatualizado |

## Dependencies

### Internal Dependencies

| Component | Reason |
|-----------|--------|
| `google-ads-connection` (change) | Fornece `connected_accounts`, cliente Google Ads configurado, `handleTokenRefreshFailure` |

### External Dependencies

| Service | API Version | Fallback |
|---------|-------------|----------|
| Google Ads API (GAQL, métricas de campanha) | Mesma lib já integrada (`google-ads-api`) | Cache + indicador de desatualizado, ou erro claro se não houver cache |

## Migration / Rollback

### Migration Steps

1. Criar tabela `campaign_metrics_cache` (migration incremental sobre a de `google-ads-connection`).

### Rollback Plan

1. Reverter a migration (drop de `campaign_metrics_cache`) — seguro, é só cache, nenhum outro dado depende dela.

## Out of Scope

- Drill-down por grupo de anúncios ou palavra-chave nesta tela (fica para `ai-performance-analysis`, que busca esses dados sob demanda para o contexto de análise, sem UI dedicada)
- Visão agregada de múltiplas contas simultaneamente
- Exportação de dados (CSV/Excel)
- Gráficos de tendência histórica além do período selecionado

## Open Questions

Nenhuma.

## References

- SPEC do epic: [Google Ads Manager](../../SPEC.md)
- SPEC do change anterior: [Google Ads Connection](../google-ads-connection/SPEC.md)
