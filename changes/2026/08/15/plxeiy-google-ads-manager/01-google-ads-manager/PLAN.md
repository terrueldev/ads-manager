---
title: Google Ads Manager - Implementation Plan
change: google-ads-manager
type: epic
spec: ./SPEC.md
status: draft
created: 2026-08-16
sdd_version: 7.3.0
---

# Implementation Plan: Google Ads Manager (Epic)

## Overview

**Spec:** [SPEC.md](./SPEC.md)

Este epic não é implementado diretamente — ele é executado através dos 4 changes filhos definidos no SPEC.md, cada um com seu próprio SPEC.md e PLAN.md detalhados, criados via solicitação de requisitos no momento em que o trabalho nele começar.

## Change Order & Dependency Graph

```
google-ads-connection
        │
        ▼
campaign-performance-dashboard
        │
        ▼
ai-performance-analysis
        │
        ▼
mcp-suggestion-apply
```

Ordem estritamente sequencial: cada change depende dos dados/infra estabelecidos pelo anterior (API-first: conexão → dados → análise → aplicação).

| # | Change | Description | Depends On | Status |
|---|--------|-------------|------------|--------|
| 1 | `google-ads-connection` | Conectar, listar e desconectar contas do Google Ads via OAuth (múltiplas contas) | None | complete |
| 2 | `campaign-performance-dashboard` | Buscar e exibir métricas de performance das campanhas por conta/período, com cache e indicador de dados desatualizados | `google-ads-connection` | pending |
| 3 | `ai-performance-analysis` | Chat com o Claude para analisar performance e gerar sugestões de melhoria | `campaign-performance-dashboard` | pending |
| 4 | `mcp-suggestion-apply` | Revisão, aprovação e aplicação de sugestões via MCP `google-ads-mcp-rw`, com log de auditoria | `ai-performance-analysis` | pending |

## Per-Child Process

Para cada change filho, na ordem acima:

1. **Criar o change:** `/sdd I want to create a new feature` (nome do change, `parent_epic: ../../SPEC.md`), passando pela solicitação de requisitos própria daquele change — herdando o contexto já definido neste SPEC.md do epic (Domain Model, Components, Cross-Cutting Concerns) sem precisar re-perguntar o que já foi decidido aqui.
2. **Branch:** `epic/google-ads-manager/<change-name>`
3. **Spec + Plan:** aprovar SPEC.md e PLAN.md do change filho (com fases dinâmicas por componente, geradas pela skill de planning)
4. **Implementar:** seguir o PLAN.md do change filho
5. **Testar:** garantir que todos os testes definidos no SPEC.md do filho passam
6. **PR:** um PR por change filho
7. **Review e merge**
8. **Atualizar:** marcar o change como `complete` neste PLAN.md do epic

## Affected Components (Epic-Wide)

Ver `## Components` no [SPEC.md](./SPEC.md) — `config`, `ads-manager-api` (contract), `ads-manager-db` (database), `ads-manager-server` (server), `ads-manager-webapp` (webapp). Cada change filho afeta um subconjunto desses componentes; a fase de scaffolding roda apenas uma vez, no primeiro change que precisar de cada componente ainda não existente em `sdd-settings.yaml`.

## Cross-Cutting Concerns (apply to every child change)

- Nenhuma credencial (OAuth, MCP, Anthropic) ou chamada externa correspondente pode viver no `webapp` — sempre no `server`.
- Nenhuma mudança real em conta de anúncio é aplicada sem aprovação humana explícita.
- Log de auditoria de mudanças aplicadas é independente do ciclo de vida da conta.
- Sem autenticação de acesso à aplicação (decisão do epic).

## Implementation State

- **Current Phase:** N/A — aguardando aprovação deste plano e criação do primeiro change filho (`google-ads-connection`)
- **Status:** pending
- **Completed Children:** none
- **Actual Files Changed:** none yet
- **Blockers:** none

## Dependencies

- Google Ads API developer token + credenciais OAuth (Google Cloud) — necessário antes de iniciar `google-ads-connection`
- MCP `google-ads-mcp-rw` (github.com/maxghenis/google-ads-mcp-rw) — necessário antes de iniciar `mcp-suggestion-apply`
- Chave de API da Anthropic — necessário antes de iniciar `ai-performance-analysis`

## Risks

| Risk | Mitigation |
|------|------------|
| Nível do developer token da Google Ads API (Basic/Standard) pode limitar quota | Confirmar nível durante o change `google-ads-connection`; ajustar cache/polling conforme necessário |
| Conjunto de ações exposto pelo MCP `google-ads-mcp-rw` pode não cobrir todos os tipos de sugestão desejados | Levantar as ações disponíveis no MCP durante o change `mcp-suggestion-apply`; ajustar escopo das sugestões do Claude ao que é realmente aplicável |
| Escopo grande para um único epic (4 changes sequenciais) | Cada change filho é implementado e revisado como PR independente, reduzindo risco por entrega |
