---
title: Google Ads Manager
spec_type: tech
type: epic
status: active
domain: Ads Management
issue: N/A
created: 2026-08-15
updated: 2026-08-16
sdd_version: 7.3.0
---

# Epic: Google Ads Manager

## Overview

Ferramenta web para gerenciar campanhas de Google Ads em um único lugar: conectar uma ou mais contas, visualizar como as campanhas estão performando, obter análise e sugestões de melhoria via Claude, e aplicar as mudanças aprovadas diretamente na conta através do MCP `google-ads-mcp-rw`. Este é o primeiro produto da linha "gerenciador de ferramentas de ads" — outras plataformas de anúncio ficam fora de escopo por enquanto.

### Background

Hoje, gerenciar e otimizar campanhas do Google Ads exige checar manualmente o painel do Google Ads e interpretar os dados sem apoio de IA. Não existe uma ferramenta unificada que conecte contas, mostre performance e sugira/aplique otimizações com IA.

### Current State

Nenhuma ferramenta existe ainda — este é o projeto inicial (`ads-manager`), recém-inicializado com a metodologia SDD e o tech pack `fullstack-typescript`.

## Original Requirements

> Quero criar um projeto que vai ser sobre um gerenciador de ferramentas de ads. Inicialmente o foco da ferramenta será o google ads. Esta ferramenta deverá ter uma interface gráfica web moderna. A idéia é que, através dessa ferramenta possamos conectar a contas de google ads (pode ser mais de uma). Quando conectar deve retornar dados importantes para saber como as campanhas estão performando. Deverá ter uma opção onde será possível interagir com o claude, fornecendo os dados necessários para que analise como está a performance e sugira melhorias. Estas melhorias posteriormente deverão ser feitas através do MCP google-ads-mcp-rw.

## User Stories

1. Como dono da conta, quero conectar uma ou mais contas do Google Ads via OAuth, para gerenciar todas as campanhas em um só lugar.
2. Como dono da conta, quero ver as métricas-chave das minhas campanhas, para avaliar rapidamente a performance.
3. Como dono da conta, quero conversar com o Claude sobre os dados das campanhas, para obter análise e sugestões de melhoria.
4. Como dono da conta, quero revisar e aprovar as mudanças sugeridas antes de aplicá-las, para manter controle sobre o orçamento.
5. Como dono da conta, quero que mudanças aprovadas sejam aplicadas automaticamente via MCP, para não precisar replicá-las manualmente no painel do Google Ads.
6. Como dono da conta, quero desconectar/remover uma conta conectada, para controlar a quais contas a ferramenta tem acesso.

## Functional Requirements

1. Conectar conta(s) do Google Ads via OAuth (suporta múltiplas contas simultâneas)
2. Buscar e exibir métricas-chave de performance das campanhas após conectar uma conta
3. Permitir seleção de período (presets 7/30/90 dias + intervalo customizado, padrão 30 dias)
4. Interagir com o Claude em formato de chat, fornecendo os dados de performance como contexto, para obter análise e sugestões de melhoria
5. Exibir sugestões do Claude com o que muda, entidade afetada e impacto esperado, com ações individuais de Aprovar/Rejeitar
6. Aplicar sugestões aprovadas na conta real via MCP `google-ads-mcp-rw`, só marcando como "aplicada" após confirmação de sucesso
7. Desconectar uma conta, removendo seus tokens e cessando chamadas futuras para ela
8. Manter log de auditoria das mudanças aplicadas, retido independentemente do ciclo de vida da conta (mesmo após desconexão)

## Non-Functional Requirements

- **Performance:** dashboard carrega métricas em poucos segundos via cache local, evitando bater na API do Google Ads a cada visualização; resposta do Claude pode ser mais lenta (streaming aceitável).
- **Security:** tokens OAuth do Google Ads e credenciais do MCP armazenados criptografados no banco; toda chamada à API do Google Ads e ao MCP acontece exclusivamente no servidor, nunca exposta ao browser. **Sem senha/proteção de acesso à aplicação** — decisão explícita, uso single-user local.
- **Scalability:** baixa prioridade — uso single-user, poucas dezenas de contas no máximo; não requer arquitetura distribuída.
- **Reliability:** se a API do Google Ads falhar ou atingir rate limit, exibir o último dado em cache com indicador de "desatualizado" em vez de quebrar a tela; chamadas ao MCP só marcam uma sugestão como "aplicada" após confirmação de sucesso — falhas mantêm a sugestão pendente com erro visível.

## Technical Design

### Architecture

Aplicação fullstack single-user, sem camada de autenticação própria:

- **webapp** (frontend web moderno) → consome **contract** (API interna) → **server** (backend) orquestra:
  - OAuth e chamadas à Google Ads API (conexão de contas, busca de métricas)
  - Montagem de contexto de performance e chamadas à API da Anthropic (análise via Claude)
  - Chamadas ao MCP `google-ads-mcp-rw` para aplicar mudanças aprovadas
- **database** persiste contas conectadas, cache de métricas de campanhas, sugestões e o log de auditoria de mudanças aplicadas.
- Deploy local simples (sem Kubernetes/Helm nesta fase).

### Data Model (overview)

| Entity | Purpose |
|--------|---------|
| `connected_accounts` | Conta Google Ads conectada: id, nome, tokens OAuth (criptografados), status (ativo / precisa reconectar) |
| `campaigns` | Cache de campanhas e métricas por conta e período: impressões, cliques, CTR, CPC, custo, conversões, taxa de conversão, custo/conversão, ROAS, orçamento vs. gasto, status |
| `suggestions` | Sugestão gerada pelo Claude: entidade afetada, descrição, payload da ação MCP, status (pending/approved/rejected/applied/failed), timestamps |
| `applied_changes_audit_log` | Log de auditoria de mudanças efetivamente aplicadas via MCP — retido mesmo após a conta ser desconectada |

Granularidade principal do dashboard é por **campanha**; dados de grupo de anúncios e palavra-chave são buscados sob demanda para compor o contexto de análise do Claude (não há tela de drill-down dedicada nesta v1).

## API Contract

Endpoints principais expostos pelo `server` e consumidos exclusivamente pelo `webapp`:

| Endpoint | Descrição |
|----------|-----------|
| Connect account (OAuth callback) | Completa o fluxo OAuth e registra a conta conectada |
| List / disconnect accounts | Lista contas conectadas; remove uma conta e seus dados |
| Get campaigns + metrics | Retorna campanhas e métricas para uma conta e período |
| Request Claude analysis | Envia dados de performance como contexto e retorna sugestões |
| List / approve / reject suggestions | Gerencia o ciclo de vida das sugestões |

**Erros:** validação (400), não encontrado (404), conflito — conta duplicada ou sugestão obsoleta (409), falha upstream — Google Ads/MCP/Claude indisponível (502/503).

## Security Considerations

- Tokens OAuth do Google Ads e credenciais do MCP: criptografados em repouso.
- Toda credencial e chamada externa (Google Ads API, Anthropic API, MCP) fica no servidor; nunca chega ao cliente/browser.
- Sem autenticação de acesso à aplicação — aceito por ser uso local single-user.
- Mudanças reais em conta de anúncio (via MCP) exigem aprovação humana explícita por sugestão — nunca aplicação automática.

## Error Handling

| Cenário | Comportamento |
|---------|----------------|
| OAuth negado ou falho | Erro claro ao usuário; nenhuma conta "quebrada" é criada |
| Token expirado / refresh falha | Conta marcada "precisa reconectar", banner no dashboard; outras contas continuam funcionando |
| Rate limit da Google Ads API | Backoff; exibe cache com indicador de "desatualizado" |
| Conta sem campanhas/dados no período | Estado vazio, não erro |
| Análise solicitada sem dados carregados | Pede para selecionar conta/campanha primeiro |
| MCP indisponível ao aplicar mudança | Erro de conexão; sugestão permanece pendente; permite retry |
| Conectar a mesma conta duas vezes | Detecta e evita duplicata |
| Sugestão obsoleta (ex: campanha alterada externamente entre aprovação e aplicação) | Valida antes de aplicar; mostra conflito ao usuário |

## Observability

- Log de auditoria persistente de toda mudança efetivamente aplicada via MCP (o quê, quando, resultado), retido independentemente da conta permanecer conectada.
- Erros de integração (Google Ads API, Anthropic API, MCP) devem ser logados com contexto suficiente para diagnóstico (conta, sugestão, endpoint).

## Acceptance Criteria

### Conexão de Contas

- **AC1:** Given consentimento OAuth válido, when o usuário completa o fluxo, then a conta aparece na lista de contas conectadas.
- **AC2:** Given múltiplas contas conectadas, when o usuário seleciona uma, then os dados exibidos refletem apenas aquela conta.
- **AC3:** Given uma conta conectada é desconectada, then seus tokens são removidos e nenhuma chamada futura é feita para ela.

### Visibilidade de Performance

- **AC4:** Given uma conta conectada e um período selecionado, when o dashboard carrega, then as campanhas mostram impressões, cliques, CTR, CPC, custo, conversões, taxa de conversão, custo/conversão, ROAS, orçamento vs. gasto e status.
- **AC5:** Given a API do Google Ads está indisponível, when os dados não podem ser atualizados, then o último cache é exibido com indicador de "desatualizado" em vez de tela de erro.

### Análise com IA

- **AC6:** Given dados de campanha carregados, when o usuário solicita análise, then o Claude retorna sugestões específicas e acionáveis baseadas nesses dados.
- **AC7:** Given uma pergunta de follow-up, when enviada, then o Claude mantém o contexto da troca anterior na mesma sessão.

### Revisão e Aplicação de Sugestões

- **AC8:** Given uma ou mais sugestões, when exibidas, then cada uma mostra a entidade afetada, a mudança proposta e o impacto esperado, com ações independentes de Aprovar/Rejeitar.
- **AC9:** Given uma sugestão aprovada, when aplicada via MCP, then a mudança é executada na conta real e a sugestão só é marcada "aplicada" após confirmação de sucesso.
- **AC10:** Given a chamada ao MCP falha, then a sugestão permanece "pendente" com erro visível, e o usuário pode tentar novamente.

## Domain Model

### Entities

| Entity | Definition | Spec Path | Status |
|--------|-----------|-----------|--------|
| Connected Account | Conta do Google Ads conectada via OAuth | specs/domain/definitions/ (a popular) | New |
| Campaign | Campanha do Google Ads com métricas de performance em cache | specs/domain/definitions/ (a popular) | New |
| Suggestion | Sugestão de melhoria gerada pelo Claude, com ciclo de vida próprio | specs/domain/definitions/ (a popular) | New |
| Applied Change (Audit Log) | Registro de uma mudança efetivamente aplicada via MCP | specs/domain/definitions/ (a popular) | New |

### Relationships

```
Connected Account 1---N Campaign
Connected Account 1---N Suggestion
Suggestion 1---0..1 Applied Change (Audit Log)
```

### Glossary

| Term | Definition | First Defined In |
|------|-----------|-------------------|
| MCP | Model Context Protocol — protocolo usado pelo `google-ads-mcp-rw` para expor ações de escrita no Google Ads ao Claude/servidor | Este SPEC |
| google-ads-mcp-rw | MCP server (read-write) usado para aplicar mudanças reais nas campanhas — github.com/maxghenis/google-ads-mcp-rw | Este SPEC |
| Suggestion | Sugestão de melhoria gerada pela análise do Claude sobre os dados de performance | Este SPEC |

### Bounded Contexts

- **Ads Integration** — conexão de contas, coleta de métricas do Google Ads
- **AI Analysis** — interação com Claude, geração de sugestões
- **Change Application** — aprovação e aplicação de mudanças via MCP

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
├── INDEX.md                              # entrada do change adicionada
├── SNAPSHOT.md
├── architecture/
│   └── overview.md                       # atualizado com os componentes deste epic
└── domain/
    ├── glossary.md                       # termos: MCP, google-ads-mcp-rw, Suggestion
    ├── definitions/                      # Connected Account, Campaign, Suggestion, Applied Change
    └── use-cases/                        # casos de uso das 6 user stories
```

### Changes Summary

| Path | Action | Description |
|------|--------|-------------|
| `specs/INDEX.md` | Modified | Registra o change `google-ads-manager-1` |
| `specs/domain/glossary.md` | Modified | Adiciona termos de domínio (MCP, google-ads-mcp-rw, Suggestion) |
| `specs/domain/definitions/` | New entries | Connected Account, Campaign, Suggestion, Applied Change |
| `specs/architecture/overview.md` | Modified | Lista os novos componentes (server, database, contract, webapp) |

## Components

> New components will be scaffolded during implementation.

### New Components

| Component | Type | Settings | Purpose |
|-----------|------|----------|---------|
| `config` | config | `{}` | Configuração do projeto (singleton) |
| `ads-manager-api` | contract | `visibility: internal` | Contrato de API entre webapp e server |
| `ads-manager-db` | database | `provider: postgresql`, `dedicated: false` | Persistência de contas, campanhas (cache), sugestões e log de auditoria |
| `ads-manager-server` | server | `server_type: api`, `databases: [ads-manager-db]`, `provides_contracts: [ads-manager-api]`, `consumes_contracts: []`, `helm: false` | Backend: OAuth, coleta de métricas, orquestração da análise via Claude, chamadas ao MCP |
| `ads-manager-webapp` | webapp | `contracts: [ads-manager-api]`, `helm: false` | Interface web: contas, dashboard, chat de análise, sugestões |

### Modified Components

Nenhum — projeto recém-inicializado, sem componentes existentes.

## System Analysis

### Inferred Requirements

- Cache de métricas para não estourar rate limit da Google Ads API a cada carregamento do dashboard.
- Máquina de estados explícita para sugestões (pending → approved/rejected → applied/failed).

### Gaps & Assumptions

- Assume-se nível de developer token "Basic" ou "Standard" da Google Ads API (a confirmar durante implementação, afeta limites de quota).
- Assume-se que o MCP `google-ads-mcp-rw` expõe ações suficientes para os tipos de sugestão que o Claude vier a propor (pausar/ativar campanha ou palavra-chave, ajustar orçamento/lance); o conjunto exato de ações disponíveis só será confirmado ao integrar o MCP.

### Dependencies

- Google Ads API developer token + credenciais OAuth (projeto no Google Cloud) — deve ser provisionado antes da implementação do componente `server`.
- MCP `google-ads-mcp-rw` (github.com/maxghenis/google-ads-mcp-rw) — precisa ser deployado/configurado; ações possíveis limitadas ao que esse MCP expõe.
- Acesso à API da Anthropic (chave de API) para a funcionalidade de análise.

## Requirements Discovery

### Component Discovery Phase

| # | Question | Answer | Source |
|---|----------|--------|--------|
| D1 | Como você pretende rodar/hospedar essa ferramenta? | Local, simples (sem Kubernetes por enquanto) | User |
| D2 | Sobre o MCP 'google-ads-mcp-rw': qual o status dele? | Precisa ser criado/configurado — github.com/maxghenis/google-ads-mcp-rw | User |

### Solicitation Phase

| # | Question | Answer | Source |
|---|----------|--------|--------|
| S1 | Confirmação do problema, usuário primário, resultado esperado e requisitos funcionais (rascunho apresentado) | Confirmado sem alterações | User |
| S2 | Quais métricas/dados por campanha? Granularidade? Período padrão? Single-user ou multi-user? Aprovação obrigatória antes de aplicar via MCP? | Usuário delegou a decisão ("peço para que analise as melhores opções"). Definido: métricas padrão de performance; granularidade principal em campanha (com dados de grupo de anúncios/palavra-chave sob demanda); período padrão 30 dias (presets 7/30/90 + custom); single-user; aprovação explícita obrigatória antes de aplicar qualquer mudança | Assistant (recommended, user-confirmed) |
| S3 | Requisitos não-funcionais (rascunho apresentado) | Confirmado sem alterações | User |
| S4 | User stories (6 propostas — rascunho apresentado) | Confirmado sem alterações | User |
| S5 | Critérios de aceitação Given/When/Then (rascunho apresentado) | Confirmado sem alterações | User |
| S6 | Casos de borda e tratamento de erros (rascunho apresentado) | Confirmado sem alterações | User |
| S7 | Dependências e restrições (rascunho apresentado) | Confirmado sem alterações | User |
| S8 | Ideias de testes unitários, integração e E2E (rascunho apresentado) | Confirmado sem alterações | User |
| S9 | Deep-dive técnico por componente + a aplicação deve ter senha/proteção de acesso? O log de auditoria deve ser mantido ao desconectar uma conta? | Não precisa de senha/proteção de acesso. Manter os logs de auditoria mesmo após desconectar a conta | User |

### User Feedback & Corrections

- 2026-08-16: Usuário pediu para manter as tarefas atualizadas no GitHub Project https://github.com/users/terrueldev/projects/1/views/1 conforme forem criadas a partir do plano de implementação (instrução de processo, não requisito de produto).

### Open Questions (BLOCKING)

Nenhuma. Todas as questões levantadas durante a solicitação foram respondidas.

## Testing Strategy

### Unit Tests

| Test | Maps to |
|------|---------|
| Troca/refresh de token OAuth (sucesso, falha, negado) | AC1, AC3 |
| Cálculo/agregação de métricas a partir da resposta da API do Google Ads | AC4 |
| Máquina de estados da sugestão (pending → approved → applied/rejected) | AC8, AC9, AC10 |
| Construção do payload MCP por tipo de sugestão | AC9 |

### Integration Tests

| Test | Maps to |
|------|---------|
| Fluxo OAuth completo contra conta de teste/sandbox | AC1, AC2 |
| Endpoint de métricas de campanha retorna formato esperado pelo dashboard | AC4, AC5 |
| Endpoint de análise via Claude retorna sugestões estruturadas | AC6, AC7 |
| Aplicar sugestão via MCP (mock de sucesso e falha) atualiza status corretamente | AC9, AC10 |
| Desconectar conta remove tokens e para chamadas futuras | AC3 |

### E2E Tests

| Test | Maps to |
|------|---------|
| Conectar conta → ver dashboard → pedir análise → aprovar sugestão → ver aplicada | AC1, AC4, AC6, AC8, AC9 |
| Caminho de erro: MCP indisponível ao aplicar mudança | AC10 |

### Test Data

- Conta Google Ads de teste/sandbox com campanhas de exemplo (mix de ativas/pausadas, com e sem conversões)
- Respostas mockadas do MCP `google-ads-mcp-rw` (sucesso e falha) para testes de integração/E2E sem tocar em conta real

## Dependencies

### Internal

- Nenhuma — primeiro epic do projeto.

### External

- Google Ads API (developer token + OAuth do Google Cloud)
- MCP `google-ads-mcp-rw` (github.com/maxghenis/google-ads-mcp-rw)
- API da Anthropic (Claude)

## Migration / Rollback

Não aplicável — projeto novo, sem dados ou usuários existentes a migrar.

## Out of Scope

- Suporte multiusuário, autenticação ou autorização da aplicação
- Outras plataformas de anúncio além do Google Ads (ex: Meta Ads, TikTok Ads) — possível expansão futura
- Aplicação totalmente automática de sugestões sem aprovação humana
- Analytics de tendência histórica além do período selecionado (ex: forecasting de longo prazo)

## Open Questions

Nenhuma questão em aberto.

## References

- MCP google-ads-mcp-rw: https://github.com/maxghenis/google-ads-mcp-rw
- GitHub Project (acompanhamento de tarefas): https://github.com/users/terrueldev/projects/1/views/1

## Changes

Este epic será decomposto nos seguintes changes (feature-level), na ordem de dependência abaixo. Cada um terá seu próprio SPEC.md detalhado, criado via solicitação de requisitos específica ao entrar em planejamento.

| Change | Description | Dependencies |
|--------|-------------|--------------|
| `google-ads-connection` | Conectar, listar e desconectar contas do Google Ads via OAuth (múltiplas contas) | None |
| `campaign-performance-dashboard` | Buscar e exibir métricas de performance das campanhas por conta/período, com cache e indicador de dados desatualizados | `google-ads-connection` |
| `ai-performance-analysis` | Chat com o Claude para analisar performance e gerar sugestões de melhoria a partir dos dados de campanha | `campaign-performance-dashboard` |
| `mcp-suggestion-apply` | Revisão, aprovação e aplicação de sugestões via MCP `google-ads-mcp-rw`, com log de auditoria | `ai-performance-analysis` |

## Cross-Cutting Concerns

- Aplicação single-user, sem login/autenticação própria (decisão explícita).
- Toda credencial (OAuth Google Ads, MCP, Anthropic) e toda chamada externa correspondente vive exclusivamente no `server` — nunca no `webapp`.
- Nenhuma mudança real em conta de anúncio é aplicada sem aprovação humana explícita por sugestão.
- Log de auditoria de mudanças aplicadas é independente do ciclo de vida da conta (não é apagado ao desconectar).
- Cache de métricas de campanha para respeitar rate limits da Google Ads API.
