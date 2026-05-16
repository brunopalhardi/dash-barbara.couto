# Plano — Desafio: aprofundar métricas, orgânico e WhatsApp

> **Status:** Fases 1, 2 e 3 entregues em produção. Aguardando validação do Bruno antes de seguir.
> **Última atualização:** 2026-05-16
> **Princípio:** uma fase de cada vez. Implementar → validar em produção com dados reais → debugar → próxima.
> Bugs encontrados em cada fase ficam registrados na seção "Bug tracking" no fim deste doc.

## Por que esse plano

O Desafio é o produto que mais precisa de profundidade analítica:
- ciclo semanal (ou 14/15 dias em campanhas estendidas)
- a maior parte da venda vem de **orgânico** (Reels, bio, grupos) — hoje não temos como medir
- a entrega acontece em **grupos de WhatsApp** via SendFlow — comprou mas não entrou no grupo é o vazamento mais caro do funil

Referência visual: VK Metrics, painel "Desafio 7D - O bom do Alzheimer" com Captação / Eventos / Outras etapas / Debriefing / Reports.

---

## Fases (do mais fácil pro mais difícil)

### 🟢 Fase 1 — Seletor de período flexível (1-2h)

**Problema:** hoje o dash Desafio assume sempre "semana corrente seg→dom" (7 dias). Quando a captação é de 14 ou 15 dias, o KPI de semana atual fica errado.

**O que entregar:**
- Novo seletor: `7d` / `14d` / `15d` / `30d` / `Custom (data início + data fim)`
- Manter o gráfico de "linhas sobrepostas por semana" — só que cada "semana" passa a ser a janela do ciclo escolhido
- KPIs reagem ao período selecionado
- Persistir período na URL (`?range=14&start=2026-05-01`)

**Arquivos afetados:**
- `components/dashboard/date-range-picker.tsx` (presets + input custom)
- `lib/queries/dashboard.ts` (`rangeCurrentWeek` → `rangeCurrentCycle(daysPerCycle)`)
- `app/(dashboard)/desafio/page.tsx`
- `lib/queries/dashboard.ts:getWeeklyOverlay` → `getCycleOverlay(cycleDays, cyclesBack)`

**Como saber que funcionou:** Bruno consegue ver "ciclo atual vs últimos 4 ciclos" com janelas de 7, 14 ou 15 dias sem mexer no código.

---

### 🟢 Fase 2 — Painéis do Desafio inspirados no VK (3-4h)

**Problema:** o dash atual tem KPI cards + gráfico overlay. Falta o detalhamento que o VK mostra.

**O que entregar (4 painéis novos):**

1. **TRÁFEGO (funil)** — CPM, CTR, Tx.Conv. (visitas → leads → vendas) em formato de funil visual
2. **QUALIDADE (donut + score)** — score 0-100 baseado em peso entre %vendas/leads, %ROAS > 1, %CPL < meta
3. **Tabela Campanhas / Conjuntos / Anúncios** — com colunas: Nome, Orçamento, Gasto, Vendas, CPA, ROAS, Lucro, Leads, CPL. Toggle entre 3 níveis (campanha/adset/ad), busca por nome, ordenação por coluna
4. **Principais criativos** — carrossel/grid com top 5 ads por gasto + thumbnail + nome + gasto

**Arquivos novos:**
- `components/dashboard/funnel-chart.tsx`
- `components/dashboard/quality-donut.tsx`
- `components/dashboard/campaigns-table.tsx` (com tabs Campanhas/Conjuntos/Anúncios)
- `lib/queries/dashboard.ts` (`getHierarchyTable(level, productSlug, range)`)

**Como saber que funcionou:** vejo no Desafio os 4 painéis renderizados com dados reais, números batem com Gerenciador.

---

### 🟡 Fase 3 — Tracking de orgânico via UTMs (4-6h, depende de mudanças nas LPs)

**Problema:** todo lead que vem de Reels, bio, grupos chega "Desconhecido" porque o Pixel não distingue origem.

**Como o VK faz:** mostra `organic_insta_reels`, `organic_grupos`, `organic_insta_bio`, `Desconhecido` no painel "Orgânico" → isso é o `utm_source` do link clicado.

**Estratégia (3 partes):**

**3a. Padronização de UTMs** — todo link orgânico postado pelo time precisa ter UTM. Convenção:
```
?utm_source=organic_insta_reels   (todos os reels)
?utm_source=organic_insta_bio     (link na bio)
?utm_source=organic_grupos        (grupos de WhatsApp/Telegram)
?utm_source=organic_email         (email marketing)
?utm_medium=organic               (sempre "organic" no orgânico)
?utm_campaign=desafio_2026_05     (ciclo do desafio)
?utm_content=reels_video_01       (identifica peça específica — opcional)
```
Bruno entrega a tabela final dessas convenções (já tem alguma planilha?).

**3b. Captura no checkout/LP**:
- Script JS leve injetado na LP da Hotmart (ou nossa LP própria) que:
  1. Lê os `utm_*` da URL no primeiro hit
  2. Salva em cookie de 30d
  3. No submit do form (lead) e na compra (Hotmart), envia pra nossa API
- Endpoint novo: `POST /api/track/lead` recebe `{ utms, fbclid, email, phone, gclid, landed_at }`

**3c. Persistência + dashboard**:
- Nova tabela `organic_leads` (ou estender `leads` existente com colunas UTM)
- Painel "Orgânico" no Desafio: barra horizontal "Leads por origem" + total + chart "Leads por dia (orgânico)"

**Decisões pendentes:**
- Bruno usa landing page própria ou checkout direto da Hotmart? (afeta onde injetar o script)
- Quer separar "lead orgânico" de "venda orgânica" ou só tracking de lead com cruzamento depois?

**Arquivos:**
- `public/track.js` (script público que vai na LP)
- `app/api/track/lead/route.ts`
- `lib/schema/tracking.ts` (nova tabela)
- `lib/queries/organic.ts` (queries de orgânico por produto/período)
- `components/dashboard/organic-panel.tsx`

---

### 🟡 Fase 4 — Integração SendFlow (2-3h)

**Problema:** queremos saber quem entrou no grupo de WhatsApp do Desafio (e cruzar com vendas).

**O que SendFlow oferece:**
- **Webhook outbound** (eles → nós): quando alguém entra/sai do grupo, dispara `POST <nossa URL>` com payload contendo telefone + grupo + timestamp
- **API REST** (nós → eles): `POST /imports`, `POST /campaigns/start` (não precisa pra esse caso de uso)

**O que entregar:**
- Endpoint `POST /api/webhooks/sendflow` que:
  1. Valida assinatura/token compartilhado (Bruno coloca em env var)
  2. Persiste o evento em `whatsapp_group_events` (tabela nova)
  3. Atualiza `whatsapp_group_members` (telefone único + grupo + último visto + status)
- Painel "Grupos WhatsApp" no Desafio: número de pessoas no grupo do ciclo atual, evolução diária, gráfico tipo funil "vendas → entraram no grupo"

**Pendências:**
- Bruno precisa criar o webhook no painel SendFlow apontando pra `https://dash-traqueamento.vercel.app/api/webhooks/sendflow?token=...`
- Token compartilhado pra autenticar (Bruno gera e cola na Vercel como `SENDFLOW_WEBHOOK_TOKEN`)
- Payload exato do SendFlow — pegar com o suporte deles ou interceptar um evento real

**Arquivos:**
- `lib/schema/whatsapp.ts`
- `app/api/webhooks/sendflow/route.ts`
- `lib/queries/whatsapp.ts`
- `components/dashboard/group-panel.tsx`

---

### 🟠 Fase 5 — Aba "Pendentes no grupo" (3-4h, depende da Fase 4 + Hotmart)

**Problema:** quem comprou mas não entrou no grupo do ciclo atual = vazamento direto de receita (a pessoa pode pedir reembolso por não receber a entrega).

**O que entregar:**
- Aba nova no Desafio: **"Pendentes no grupo"**
- Tabela de pessoas que:
  - Compraram dentro do ciclo atual (Hotmart) → match por email/telefone normalizado
  - **NÃO** aparecem na tabela `whatsapp_group_members` do grupo do ciclo
- Cada linha: nome, email, telefone, produto, data da compra, horas desde a compra
- Botão "Copiar telefone" + "Enviar lembrete via SendFlow" (futuro)

**Pré-requisitos:**
- Hotmart webhook implementado (Fase 5.0 — pode rolar em paralelo)
- Fase 4 entregue
- Normalização de telefone consistente entre Hotmart e SendFlow (ex.: `+5511999...` vs `(11) 99999...`)

**Arquivos:**
- `app/api/webhooks/hotmart/route.ts` (se ainda não existir)
- `lib/queries/group-pending.ts`
- `app/(dashboard)/desafio/_pending-tab.tsx`

---

### 🔴 Fase 6 — Reports do Desafio (futuro)

Painel "Debriefing" / "Reports" que o VK tem:
- Snapshot do ciclo completo após o fim do desafio
- Comparação com últimos 3 ciclos
- Export PDF/CSV pra apresentar pra equipe

Adiar até Fases 1-5 estarem estáveis.

---

## Ordem sugerida de execução

```
Fase 1 → valida → Fase 2 → valida → Fase 3 → valida → Fase 4 → valida → Fase 5 → valida → Fase 6
```

Cada validação é: Bruno olha em produção com dados reais, compara com Gerenciador / VK Metrics / planilha, me reporta o que diverge antes de eu seguir.

---

## Status das fases

- ✅ Fase 1 — Seletor de ciclo flexível (commit `5d473d9`)
- ✅ Fase 2 — Painéis avançados (commit `b07821d`)
- ✅ Fase 3 — Tracking de orgânico via UTMs (commit `8a7ffb9`) — **pendente Bruno colar o script nas LPs**
- ⏳ **Mini-Fase 3.5** — adaptar à convenção real de UTMs do Bruno + reescrever links Hotmart com `src` (escopo discutido em 16/05, ainda não implementado)
- ⏳ Fase 4 — SendFlow integration
- ⏳ Fase 5 — Hotmart webhook + aba "Pendentes no grupo"

## Mini-Fase 3.5 — ajustes pra convenção real (não implementada ainda)

Descoberto ao ver a planilha de leads do Bruno (16/05): a convenção UTM real é diferente
da proposta original do plano. A planilha usa:

- `utm_source` = `Organico` ou `MetaAds` (origem ampla)
- `utm_campaign` = `Desafio7D` / `B-VENDAS-DESAFIO-F-LP1` / `Grupos-Antigos`
- `utm_medium` = `Instagram` / `Whatsapp` / `01-Q`
- `utm_content` = `Reels` / `AD10-IMG-DESAFIO`

A proposta original assumia `utm_medium=organic` como signal. Adaptar:

1. **`/api/track/lead`** — classifier reconhece `utm_source ILIKE 'organic%'` ou `'Organico'` como organic; `'MetaAds'` ou fbclid como meta. Manter compatibilidade com a convenção original.
2. **`/lib/queries/organic.ts`** — filtro por produto reconhece `utm_campaign` em qualquer caixa (já usa `ilike`, ok); revisar `productMatchClause` pra cobrir `Desafio7D` (slug+versão sem separador).
3. **`/public/track.js`** — nova feature: ao carregar a página, scanear todos `<a href*="hotmart.com">` e `<a href*="pay.hotmart.com">` e injetar `?src=<utm_source>__<utm_campaign>__<utm_content>` no href. Faz isso só se ainda não tiver `src=` no link. Assim a atribuição sobrevive ao pulo LP→checkout mesmo se a pessoa não preencher form na LP.
4. (opcional) **Botão de teste em `/settings/integrations`** que faz um POST mock pra `/api/track/lead` confirmando que tá tudo funcionando.

Estimativa: ~1h.

---

## Decisões sobre Hotmart (puxado pra Fase 5)

Bruno perguntou em 16/05 sobre como rastrear pós-checkout. Resposta:

- **Webhook é o caminho** (95% dos casos) — Hotmart manda POST quando venda fecha, payload contém o `src` que veio do link. Cadastrar no painel apontando pra `https://dash-traqueamento.vercel.app/api/webhooks/hotmart` com HOTTOK.
- **REST API** complementa pra backfill de vendas antigas (OAuth client credentials, `POST /security/oauth/token` + `GET /payments/api/v1/sales/history`). Implementar só depois do webhook estar estável.
- Eventos relevantes: `PURCHASE_APPROVED`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`.
- **Pendência do Bruno:** gerar HOTTOK, cadastrar no `Secret KEYs/tokens.md` + Vercel env `HOTMART_WEBHOOK_SECRET`, cadastrar webhook no painel Hotmart.

## Como instalar o tracking de orgânico (Fase 3)

**Snippet pra colar no `<head>` de qualquer LP (própria ou seção custom do Hotmart):**

```html
<script async src="https://dash-traqueamento.vercel.app/track.js"></script>
```

O script:
1. Lê `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`, `gclid` da URL
2. Salva tudo em cookie `tq_attr` (30 dias, first-touch wins)
3. **Auto-captura forms** que tenham `<input type="email">` ou `<input name="phone|telefone|whatsapp">` — no submit, dispara POST pra `/api/track/lead`
4. Expõe `window.traqueamento.capture({ email, phone, name })` se precisar disparar manualmente (ex.: SPA / pixel custom)

**Convenção de UTMs (resumo):**

| utm_source | Uso |
|---|---|
| `organic_insta_reels` | Reels do @obomdoalzheimer |
| `organic_insta_bio` | Link da bio Instagram |
| `organic_grupos` | Grupos WhatsApp/Telegram próprios |
| `organic_email` | Email marketing |
| `organic_youtube` | YouTube (se vier) |

Pareados sempre com `utm_medium=organic` e `utm_campaign=<produto>_<ciclo>` (ex.: `desafio_2026_05`).

## Bug tracking

> Cada vez que algo diverge ou quebra, registramos aqui com data + sintoma + causa + fix.
> Fase atual no topo.

### Fase em andamento: _validação Fases 1-3 (Bruno comparando com Gerenciador / VK / planilha)_

### Pendências de validação

- [ ] **Fase 1** — números de KPIs com ciclos 7d/14d/15d batem com Gerenciador?
- [ ] **Fase 2** — funil (CPM/CTR/Tx.Conv), score de qualidade (faz sentido as metas default 1.5x ROAS / R$50 CPL / 1% conv?), tabela hierárquica (orçamentos exibidos corretamente — Meta retorna em centavos, divido por 100)
- [ ] **Fase 3** — script público `track.js` instalado em alguma LP de teste? Capturou algum lead? Painel Orgânico mostra dados?

### Histórico de bugs corrigidos

_Vazio — sem bugs reportados ainda._

---

## Notas técnicas — referência rápida

### SendFlow

- **Auth:** Bearer token no header `Authorization`
- **Webhook outbound:** SendFlow dispara `POST` na URL configurada quando há entrada/saída de grupo. Payload exato a confirmar com suporte.
- **Docs (último visto):** `https://app.sendflowai.com/docs/whatsapp/webhook-workflow` (404 quando tentei do meu lado — Bruno tem acesso pelo painel deles)
- **Blog com exemplos API:** https://blog.sendflow.pro/artigo/sendflow-api-exemplos-prontos-importar-lista-de-chats-em-csv/

### Hotmart

- **Webhook:** Bruno precisa cadastrar `https://dash-traqueamento.vercel.app/api/webhooks/hotmart` no painel da Hotmart
- **HOTTOK:** secret pra assinar o webhook (cola em env `HOTMART_WEBHOOK_SECRET`)
- **Eventos relevantes:** `PURCHASE_APPROVED`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`

### Convenção de UTMs (a confirmar com Bruno)

| utm_source | Onde | Exemplo de uso |
|---|---|---|
| `organic_insta_reels` | Reels do @obomalzheimer | Link arrastável no reel |
| `organic_insta_bio` | Link na bio | Linktree / link único |
| `organic_grupos` | Grupos próprios de WhatsApp | Link compartilhado em grupos |
| `organic_email` | Email marketing | Newsletter / sequência |
| `paid_meta_ads` | Meta Ads (já vem do Pixel) | Auto via fbclid |
