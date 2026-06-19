# Tabela de campanhas com auditoria de criativo — /desafio

**Data:** 2026-06-19
**Contexto:** fork Barbara Couto. Sequência do fix `fix/gasto-anuncios-pausados` (PR #1), que passou a contar gasto de anúncios pausados/deletados. O KPI "Investido" agora reconcilia com o Gerenciador, mas não há visão **por campanha** nem visibilidade de gasto que não tem criativo ativo rodando.

## Objetivo

Dar ao time uma tabela de **campanhas do produto com gasto completo** (reconciliando 1:1 com o KPI Investido) e **sinalizar campanhas que gastam sem nenhum criativo ativo** — pra auditar o que o gestor de tráfego está fazendo.

Mantém o "Top criativos" como está (só ativos, opção 1 já rotulada na UI).

## Decisões de produto (definidas com o Bruno)

- **Gatilho de ⚠ atenção:** campanha com `gasto > 0` E `0 anúncios ativos com criativo`. Sinal = dinheiro saindo sem criativo rastreável rodando.
- **Colunas (enxuto):** Campanha · Gasto (€, completo) · % do total · nº criativos ativos · status (⚠ ou ok).
- **Sem** vendas/ROAS/leads por campanha (escopo enxuto).
- **Escopo de gasto:** campanhas com `product_slug = 'desafio'` (mesmo filtro do KPI Investido → reconcilia). Gasto fora da nomenclatura cai em `outros` e **não** aparece aqui (é outro gatilho de auditoria, não escolhido → follow-up).

## Arquitetura

Três peças, espelhando o padrão das outras seções da página.

### 1. Query — `getCampaignBreakdown(productSlug, range)` (`lib/queries/dashboard.ts`)

`SELECT` agrupado por campanha (join `ad_insights_daily → ads → adsets → campaigns → ad_accounts`), filtrado por `campaigns.productSlug = productSlug` e pelo range:

- `campaignId`, `name`
- `spend`: `sumToEur(adInsightsDaily.spend, adAccounts.currency)` — **sem** filtro `onlyActive` (inclui stubs/pausados → gasto completo)
- `activeCreatives`: `count(distinct ad)` onde `ads.status = 'ACTIVE'` E `ads.creativeId IS NOT NULL`

Retorna linhas cruas (sem % / total — isso é responsabilidade da função pura abaixo). Ordenação final por gasto desc fica no consumidor.

### 2. Função pura — `buildCampaignRows(rows)` (`lib/queries/dashboard.ts` ou helper)

Recebe as linhas cruas e devolve:

- `total`: soma dos `spend` (deve igualar o KPI Investido)
- `rows`: cada linha + `pctOfTotal` (= `spend / total`, 0 se total 0) + `needsAttention` (= `spend > 0 && activeCreatives === 0`), ordenadas por `spend` desc

Pura → testável sem DB.

### 3. Componente — `CampaignTable` (`components/dashboard/campaign-table.tsx`)

Card "**Campanhas · gasto do período**", renderizado na `/desafio` abaixo do card de Top Criativos. Tabela:

| Campanha | Gasto | % | Criativos ativos | Status |
|---|---|---|---|---|

- Linha com `needsAttention`: badge âmbar **⚠ sem criativo ativo** + leve realce de fundo.
- Linha normal: status "ok" discreto (ou nº de criativos).
- **Rodapé** com Total (= Investido) — reconciliação explícita.
- Formatação de moeda via `fmt.money` (EUR/pt-PT, já configurado).

### 4. Página `/desafio` (`app/(dashboard)/desafio/page.tsx`)

- Adiciona `getCampaignBreakdown("desafio", currentRange)` no `Promise.all`.
- Passa por `buildCampaignRows` e renderiza `<CampaignTable>`.
- Respeita `?hoje=1` (mesmo `currentRange` das outras queries).
- Nenhuma mudança nas seções existentes.

## Testes

`buildCampaignRows` (pura), em `lib/queries/dashboard.test.ts` (ou arquivo dedicado):

1. Campanha com ≥1 criativo ativo → `needsAttention = false`.
2. Campanha com gasto e `activeCreatives = 0` (só stubs) → `needsAttention = true`.
3. `total` = soma dos spends; `pctOfTotal` por linha soma ~100%.
4. Lista vazia → `total = 0`, `rows = []` (sem divisão por zero).
5. Ordenação: maior gasto primeiro.

## Fora de escopo / follow-ups

- Espelhar no Geral (query já parametrizada por `productSlug`).
- Gatilho "fora da nomenclatura" (gasto em `outros`) como segunda categoria de auditoria.
- Vendas/ROAS por campanha (limitação de atribuição Hotmart já documentada no projeto).
