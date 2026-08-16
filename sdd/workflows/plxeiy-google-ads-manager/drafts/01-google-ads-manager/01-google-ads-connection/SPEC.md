---
title: Google Ads Connection
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

# Google Ads Connection

## Overview

Permite conectar uma ou mais contas do Google Ads via OAuth (incluindo sub-contas de uma conta MCC/gerenciadora), listar as contas conectadas com seus dados básicos, e desconectá-las. É o primeiro change do epic [Google Ads Manager](../../SPEC.md) — todos os demais changes dependem deste.

### Background

Sem conexão de contas não há como buscar dados de campanhas nem aplicar melhorias depois. Este change estabelece a base de identidade/credenciais para todo o resto do produto.

### Current State

Nenhuma conta é conectada hoje — o produto (`ads-manager`) está recém-inicializado, sem implementação.

## User Stories

- Como dono da conta, quero conectar uma ou mais contas do Google Ads via OAuth, para gerenciar todas as campanhas em um só lugar.
- Como dono da conta, quero desconectar/remover uma conta conectada, para controlar a quais contas a ferramenta tem acesso.

## Functional Requirements

### FR1: Iniciar Fluxo OAuth

**Description:** O usuário inicia a conexão de uma conta a partir da tela "Contas".

**Behavior:**
- Quando o usuário clica em "Conectar conta", o sistema redireciona para a tela de consentimento OAuth do Google, solicitando os escopos necessários para a Google Ads API.
- O sistema gera e valida um parâmetro `state` para proteção contra CSRF.

**Constraints:**
- Requer client ID/secret OAuth de um projeto Google Cloud configurado (pré-requisito de setup, ver Dependencies).

### FR2: Seleção de Contas Acessíveis (com suporte a MCC)

**Description:** Após o consentimento, o sistema lista todas as contas do Google Ads acessíveis pela identidade autenticada.

**Behavior:**
- Ao retornar do callback OAuth, o sistema troca o código por tokens e consulta as contas acessíveis (via `ListAccessibleCustomers` ou equivalente da Google Ads API), incluindo sub-contas caso a identidade seja de uma MCC.
- O sistema exibe essa lista com checkboxes para o usuário escolher quais contas adicionar.
- Contas já conectadas anteriormente aparecem na lista marcadas como "já conectada" e não podem ser selecionadas novamente.

**Constraints:**
- Tokens obtidos no callback só são persistidos para as contas efetivamente selecionadas e confirmadas pelo usuário.

### FR3: Persistir Contas Selecionadas

**Description:** Ao confirmar a seleção, as contas escolhidas são salvas.

**Behavior:**
- Para cada conta selecionada, o sistema grava: Customer ID, nome da conta, moeda, fuso horário, status, tokens OAuth (criptografados), e data de conexão.

### FR4: Listar Contas Conectadas

**Description:** Tela "Contas" mostra todas as contas atualmente conectadas.

**Behavior:**
- Exibe, por conta: nome, Customer ID, moeda, fuso horário, status (ativa / suspensa / precisa reconectar), e data de conexão.

### FR5: Desconectar Conta

**Description:** O usuário pode remover uma conta conectada.

**Behavior:**
- Ao clicar em "Desconectar", o sistema exibe uma confirmação simples em tela (componente de UI, não `window.confirm` nativo do navegador).
- Ao confirmar, o sistema remove a conta, seus tokens e dados associados; nenhuma chamada futura é feita para essa conta.

### FR6: Detectar Necessidade de Reconexão

**Description:** Quando o refresh token de uma conta falha, ela é marcada para reconexão.

**Behavior:**
- Se o refresh do access token falhar (token revogado/expirado), o status da conta muda para "precisa reconectar" e um banner/indicador aparece na lista, sem afetar outras contas conectadas.

## Non-Functional Requirements

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Segurança | Tokens OAuth criptografados em repouso; nunca expostos ao frontend | Revisão de código / testes de integração |
| Segurança | Fluxo OAuth protegido contra CSRF via `state` param validado | Teste de integração do callback |
| Confiabilidade | Falha de reconexão de uma conta não afeta outras contas conectadas | Teste de integração |

## Technical Design

### Architecture

```
webapp (tela Contas) ---> ads-manager-api (contract) ---> ads-manager-server
                                                                  │
                                                                  ├──> Google OAuth (consent + token exchange)
                                                                  ├──> Google Ads API (ListAccessibleCustomers)
                                                                  └──> ads-manager-db (connected_accounts)
```

### Data Model

**New Tables:**

```sql
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY,
  google_customer_id VARCHAR(32) NOT NULL UNIQUE,
  account_name VARCHAR(255) NOT NULL,
  currency_code VARCHAR(8) NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- active | suspended | needs_reconnect
  oauth_refresh_token_encrypted TEXT NOT NULL,
  granted_scopes TEXT NOT NULL,
  connected_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**

| Table | Index | Columns | Type |
|-------|-------|---------|------|
| connected_accounts | idx_connected_accounts_customer_id | google_customer_id | btree (unique) |

### Algorithms / Business Logic

**Fluxo de Conexão:**

1. Frontend chama `GET /oauth/google-ads/start` → backend gera `state`, guarda em sessão/cache de curta duração, retorna URL de consentimento do Google.
2. Usuário autoriza no Google → Google redireciona para `GET /oauth/google-ads/callback?code=...&state=...`.
3. Backend valida `state`, troca `code` por tokens (access + refresh) junto ao Google.
4. Backend consulta contas acessíveis com esse token (`ListAccessibleCustomers` ou equivalente).
5. Backend retorna ao frontend a lista de contas acessíveis, marcando quais já estão conectadas.
6. Usuário seleciona contas e confirma → `POST /accounts` com os Customer IDs escolhidos.
7. Backend persiste cada conta selecionada com token criptografado e metadados.

**Edge Cases:**
- Usuário nega o consentimento: nenhuma conta é criada; erro claro exibido.
- `state` inválido/ausente no callback: rejeita a requisição (possível CSRF).
- Conta já conectada aparece na seleção: desabilitada, marcada como "já conectada".
- Falha ao listar contas acessíveis (erro da Google Ads API): erro claro, nenhuma conta parcialmente criada.
- Refresh token revogado externamente: próxima tentativa de uso marca a conta como "precisa reconectar".

## API Contract

### Endpoints

| Method | Path | Description | Auth |
|--------|------|--------------|------|
| GET | `/oauth/google-ads/start` | Inicia fluxo OAuth, retorna URL de consentimento | N/A (single-user, sem auth de app) |
| GET | `/oauth/google-ads/callback` | Callback do Google; retorna contas acessíveis para seleção | N/A |
| POST | `/accounts` | Persiste as contas selecionadas | N/A |
| GET | `/accounts` | Lista contas conectadas | N/A |
| DELETE | `/accounts/:id` | Desconecta uma conta | N/A |

### Request/Response Schemas

**GET /oauth/google-ads/start**

Response (200):
```json
{ "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

**GET /oauth/google-ads/callback**

Response (200):
```json
{
  "accessible_accounts": [
    {
      "customer_id": "123-456-7890",
      "account_name": "Minha Loja",
      "currency_code": "BRL",
      "timezone": "America/Sao_Paulo",
      "already_connected": false
    }
  ]
}
```

**POST /accounts**

Request:
```json
{ "customer_ids": ["123-456-7890"] }
```

Response (201):
```json
{
  "connected": [
    {
      "id": "uuid",
      "customer_id": "123-456-7890",
      "account_name": "Minha Loja",
      "currency_code": "BRL",
      "timezone": "America/Sao_Paulo",
      "status": "active",
      "connected_at": "ISO8601"
    }
  ]
}
```

**GET /accounts**

Response (200):
```json
{
  "accounts": [
    {
      "id": "uuid",
      "customer_id": "123-456-7890",
      "account_name": "Minha Loja",
      "currency_code": "BRL",
      "timezone": "America/Sao_Paulo",
      "status": "active",
      "connected_at": "ISO8601"
    }
  ]
}
```

Error Responses:
| Status | Code | Description |
|--------|------|--------------|
| 400 | INVALID_STATE | `state` do OAuth ausente/inválido |
| 400 | OAUTH_DENIED | Usuário negou o consentimento |
| 404 | ACCOUNT_NOT_FOUND | Conta não encontrada ao desconectar |
| 409 | ALREADY_CONNECTED | Conta já conectada (tentativa de reconectar via POST) |
| 502 | GOOGLE_ADS_API_ERROR | Falha ao consultar contas acessíveis na Google Ads API |

## Security Considerations

- **Authentication:** N/A — aplicação single-user sem login (decisão do epic).
- **Authorization:** N/A — mesmo motivo.
- **Data Protection:** refresh tokens OAuth criptografados em repouso no banco; nunca retornados em nenhuma resposta de API; toda chamada à Google Ads API e ao Google OAuth ocorre exclusivamente no `ads-manager-server`.
- **CSRF:** fluxo OAuth protegido por parâmetro `state` gerado pelo servidor e validado no callback.

## Error Handling

| Error Scenario | User Message | Log Level | Recovery |
|-----------------|---------------|-----------|----------|
| OAuth negado pelo usuário | "Conexão cancelada — nenhuma permissão foi concedida" | INFO | Usuário pode tentar novamente |
| `state` inválido no callback | "Sessão de conexão expirada, tente novamente" | WARN | Usuário reinicia o fluxo |
| Falha ao listar contas acessíveis | "Não foi possível carregar suas contas do Google Ads. Tente novamente." | ERROR | Retry manual |
| Conta já conectada selecionada | "Esta conta já está conectada" | INFO | Bloqueado na UI (checkbox desabilitado) |
| Refresh token revogado | Banner "Esta conta precisa ser reconectada" na lista | WARN | Fluxo de reconexão (reexecuta FR1-FR3 para essa conta) |
| Desconectar conta inexistente | "Conta não encontrada" | WARN | N/A |

## Observability

### Logging

| Event | Level | Fields |
|-------|-------|--------|
| Conta conectada | INFO | customer_id, account_name |
| Conta desconectada | INFO | customer_id |
| Falha de OAuth | WARN/ERROR | reason, customer_id (se disponível) |
| Conta marcada para reconexão | WARN | customer_id |

### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| accounts_connected_total | counter | - |
| accounts_disconnected_total | counter | - |
| oauth_flow_errors_total | counter | reason |

## Acceptance Criteria

- [ ] **AC1:** Given o usuário clica em "Conectar conta", when completa o consentimento OAuth do Google, then o sistema lista todas as contas do Google Ads acessíveis por aquela identidade (incluindo sub-contas de MCC) para seleção.
- [ ] **AC2:** Given o usuário seleciona uma ou mais contas da lista e confirma, then essas contas são persistidas e aparecem em "Contas Conectadas" com nome, Customer ID, moeda, fuso horário, status e data de conexão.
- [ ] **AC3:** Given uma conta já conectada aparece na lista de seleção, then ela é exibida como "já conectada" e não pode ser selecionada novamente.
- [ ] **AC4:** Given uma conta conectada, when o usuário clica em "Desconectar" e confirma na tela, then a conta e seus tokens são removidos e ela deixa de aparecer na lista.
- [ ] **AC5:** Given o fluxo OAuth é negado ou falha, then o usuário vê uma mensagem de erro clara e nenhuma conta é criada.
- [ ] **AC6:** Given o token de uma conta conectada não pode mais ser renovado, then seu status muda para "precisa reconectar", sem afetar as demais contas.

## Domain Model

### Entities

| Entity | Definition | Spec Path | Status |
|--------|------------|-----------|--------|
| Connected Account | Conta do Google Ads conectada via OAuth, com tokens e metadados | specs/domain/definitions/connected-account.md | New |

### Relationships

```text
Connected Account (este change)
  │
  │ 1---N (changes futuros)
  ▼
Campaign, Suggestion (definidos em changes posteriores do epic)
```

### Glossary

| Term | Definition | First Defined In |
|------|------------|-------------------|
| MCC (Manager Account) | Conta gerenciadora do Google Ads que dá acesso a múltiplas sub-contas | Este spec |
| Customer ID | Identificador único de uma conta do Google Ads | Este spec |

### Bounded Contexts

- **Ads Integration** (definido no epic): este change implementa a parte de conexão/identidade.

## Specs Directory Changes

### Before

```text
specs/
├── INDEX.md
├── SNAPSHOT.md
├── architecture/
│   └── overview.md
└── domain/
    ├── glossary.md
    ├── definitions/
    └── use-cases/
```

### After

```text
specs/
├── INDEX.md                                    # entrada deste change adicionada
├── SNAPSHOT.md
├── architecture/
│   └── overview.md                             # atualizado com componentes ativos
└── domain/
    ├── glossary.md                             # + MCC, Customer ID
    ├── definitions/
    │   └── connected-account.md                # NOVO
    └── use-cases/
        └── connect-google-ads-account.md       # NOVO
```

### Changes Summary

| Path | Action | Description |
|------|--------|-------------|
| `specs/domain/glossary.md` | Modify | Adiciona termos MCC e Customer ID |
| `specs/domain/definitions/connected-account.md` | Create | Definição da entidade Connected Account |
| `specs/domain/use-cases/connect-google-ads-account.md` | Create | Caso de uso do fluxo de conexão |
| `specs/INDEX.md` | Modify | Registra `google-ads-manager-2` |

**Validation**: Durante `/sdd I want to verify the implementation`, o sistema checa que todos os arquivos listados aqui foram de fato criados/modificados, e que nenhum outro arquivo em `specs/` fora desta lista foi alterado.

## Components

> New components will be scaffolded during implementation.

### New Components

| Component | Type | Settings | Purpose |
|-----------|------|----------|---------|
| `config` | config | `{}` | Configuração do projeto (singleton) |
| `ads-manager-api` | contract | `visibility: internal` | Contrato de API entre webapp e server |
| `ads-manager-db` | database | `provider: postgresql`, `dedicated: false` | Persistência de `connected_accounts` |
| `ads-manager-server` | server | `server_type: api`, `databases: [ads-manager-db]`, `provides_contracts: [ads-manager-api]`, `consumes_contracts: []`, `helm: false` | OAuth, chamadas à Google Ads API |
| `ads-manager-webapp` | webapp | `contracts: [ads-manager-api]`, `helm: false` | Tela de Contas (conectar/listar/desconectar) |

### Modified Components

Nenhum — primeiro change implementado deste projeto.

## System Analysis

### Inferred Requirements

- Necessário armazenar `granted_scopes` para futura auditoria/depuração de permissões concedidas.

### Gaps & Assumptions

- Assume-se uso da biblioteca oficial/madura de cliente Google Ads API para Node/TypeScript (a escolha exata da lib fica a critério da implementação, respeitando o tech pack `fullstack-typescript`).
- Assume-se que o developer token da Google Ads API (a ser criado, ver Dependencies) tem nível suficiente para `ListAccessibleCustomers` e leitura básica de metadados de conta.

### Cross-References

- Depende do SPEC.md do epic: [Google Ads Manager](../../SPEC.md) — herda NFRs de segurança/single-user e a definição dos componentes.
- Bloqueia os changes seguintes do epic: `campaign-performance-dashboard`, `ai-performance-analysis`, `mcp-suggestion-apply`.

## Requirements Discovery

### Solicitation Phase

| # | Question | Answer | Source |
|---|----------|--------|--------|
| S1 | Você já tem um projeto no Google Cloud com client ID/secret OAuth para a Google Ads API, ou isso ainda precisa ser criado? | Precisa ser criado | User |
| S2 | Se o login OAuth for de uma conta MCC, o usuário deve poder escolher quais sub-contas conectar? | Sim — listar todas as contas acessíveis com checkboxes | User |
| S3 | Quais dados exibir na lista de contas conectadas? | Nome, Customer ID, moeda, fuso horário, status e data de conexão | User |
| S4 | Desconectar deve pedir confirmação em tela? | Sim — confirmação simples em tela, não alert nativo | User |

### User Feedback & Corrections

Nenhuma.

### Open Questions (BLOCKING)

Nenhuma. Todas as questões foram respondidas.

## Domain Updates

### Glossary Terms

| Term | Definition | Action |
|------|------------|--------|
| MCC (Manager Account) | Conta gerenciadora do Google Ads que dá acesso administrativo a múltiplas contas de anúncio (sub-contas) | add |
| Customer ID | Identificador único de uma conta do Google Ads, no formato `XXX-XXX-XXXX` | add |

### Definition Specs

| File | Description | Action |
|------|-------------|--------|
| `connected-account.md` | Entidade Connected Account: campos, ciclo de vida (active/suspended/needs_reconnect), relação com tokens OAuth | create |

### Architecture Docs

- [ ] Atualizar `specs/architecture/overview.md` com os componentes `ads-manager-server`, `ads-manager-db`, `ads-manager-api`, `ads-manager-webapp` e o fluxo OAuth

## Testing Strategy

### Unit Tests

| Component | Test Case | Expected Behavior |
|-----------|-----------|---------------------|
| ads-manager-server | Troca de código OAuth por tokens (sucesso) | Retorna access + refresh token |
| ads-manager-server | Troca de código OAuth por tokens (falha) | Lança erro tratável, não persiste conta |
| ads-manager-server | Criptografia/descriptografia de refresh token | Round-trip correto, nunca armazenado em texto plano |
| ads-manager-server | Validação do `state` do OAuth | Rejeita state ausente/incorreto |
| ads-manager-server | Parsing da lista de contas acessíveis (incluindo MCC) | Retorna lista normalizada com sub-contas |

### Integration Tests

| Scenario | Components | Expected Outcome |
|----------|------------|--------------------|
| Fluxo OAuth completo contra conta sandbox | webapp → api → server → Google (mock/sandbox) | Conta aparece na lista de acessíveis e pode ser persistida |
| Persistir contas selecionadas | server → db | Registros criados com token criptografado |
| Listar contas conectadas | server → db → api | Retorna dados corretos, sem expor tokens |
| Desconectar conta | server → db | Registro removido, chamadas futuras param |
| Refresh token revogado | server → Google (mock) | Status muda para `needs_reconnect` |

### E2E Tests

| User Flow | Steps | Expected Result |
|-----------|-------|--------------------|
| Conectar e ver conta | 1. Clicar "Conectar conta" 2. Completar OAuth (sandbox) 3. Selecionar conta(s) 4. Confirmar | Conta(s) aparecem na lista "Contas Conectadas" |
| Desconectar conta | 1. Abrir lista de contas 2. Clicar "Desconectar" 3. Confirmar | Conta some da lista |

### Test Data

| Entity | Required State | Purpose |
|--------|------------------|---------|
| Connected Account | Ativa, com dados completos | Caminho feliz |
| Connected Account | `needs_reconnect` | Testar banner e fluxo de reconexão |
| Google Ads sandbox account | MCC com 2+ sub-contas | Testar seleção múltipla |

## Dependencies

### Internal Dependencies

Nenhuma — primeiro change implementado do projeto.

### External Dependencies

| Service | API Version | Fallback |
|---------|-------------|----------|
| Google OAuth 2.0 | v2 | Erro claro ao usuário; nenhuma conta criada |
| Google Ads API | Versão atual suportada pela lib cliente escolhida | Erro claro ao usuário; retry manual |

**Pré-requisito de setup (manual, fora do código):** criar projeto no Google Cloud, configurar tela de consentimento OAuth, gerar client ID/secret, e solicitar developer token da Google Ads API. Deve estar pronto antes de testar este change fim a fim.

## Migration / Rollback

### Migration Steps

1. Criar tabela `connected_accounts` (primeira migration do projeto).

### Rollback Plan

1. Reverter a migration (drop da tabela `connected_accounts`) — seguro, pois nenhum outro change ainda depende de dados persistidos.

## Out of Scope

- Reconexão automática sem interação do usuário (a reconexão sempre passa pelo fluxo OAuth manual, FR1-FR3)
- Edição de metadados da conta (nome, etc.) — dados vêm sempre do Google Ads, não são editáveis localmente
- Busca de dados de campanhas/performance — coberto pelo próximo change (`campaign-performance-dashboard`)

## Open Questions

Nenhuma questão em aberto.

## References

- SPEC do epic: [Google Ads Manager](../../SPEC.md)
- Google Ads API — Accessible Customers: https://developers.google.com/google-ads/api/docs/account-management/listing-accounts
