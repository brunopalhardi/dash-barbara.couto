# Meta Pixel Funnel — Backend (fase 1)

**Status:** Aprovado
**Data:** 2026-05-27
**Escopo:** Backend apenas. O front (4 tabelas de detalhamento em `/guia`) é fase 2, spec própria.

---

## Contexto

Bruno mantém hoje um dashboard no Looker Studio conectado direto ao Meta Ads que mostra 4 tabelas de detalhamento do funil de tráfego: Diário do Funil, por Campanha, por Criativo e por Página. Queremos replicar essa visão (com UI/UX melhor e responsiva) dentro da rota `/guia` do dashboard próprio.

Auditoria do sync atual mostrou que parte das colunas exibidas no Looker depende de eventos do Pixel (LandingPageView, InitiateCheckout) e de URLs de destino dos anúncios que **não estão sendo capturadas hoje**. Antes de construir o front, precisamos ampliar o backend.

## Objetivo

Disponibilizar no banco, com histórico backfilled, as métricas e dimensões que faltam para alimentar as 4 tabelas:

- **`landing_page_view`** por ad por dia (Pixel)
- **`initiate_checkout`** por ad por dia (Pixel)
- **`landing_url`** por ad (URL de destino do criativo)

Adicionalmente, resolver dívida técnica conhecida: declarar `adset_insights_daily` e `campaign_insights_daily` no schema Drizzle (hoje existem só em prod) e incluir as novas métricas agregadas.

## Não-objetivos

- Construir UI ou queries específicas das tabelas (fase 2).
- Replicar no `/desafio` (o front da fase 2 cobre só `/guia`; o backend daqui já beneficia ambos automaticamente).
- Promover Pixel events de JSON para colunas dedicadas (Opção B descartada — fica pra quando virar SaaS multi-tenant).
- Lead scoring, atribuição multi-touch, qualquer ML.

## Arquitetura

### Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `lib/schema/meta.ts` | +coluna `landingUrl: text("landing_url")` em `ads` (nullable) |
| `lib/schema/insights.ts` | Tipar `conversions` como `AdConversions` (novas chaves opcionais) |
| `lib/schema/views.ts` (novo) | Declarar `adsetInsightsDaily` e `campaignInsightsDaily` como `pgMaterializedView` com SQL completo |
| `lib/schema/index.ts` | Re-exportar views |
| `lib/meta/types.ts` | +tipos para `object_story_spec` / `asset_feed_spec` em `MetaCreative` |
| `lib/meta/client.ts` | Pedir `object_story_spec,asset_feed_spec` no `getCreativesByIds` |
| `lib/meta/extractors.ts` (novo) | `extractLandingUrl(creative)` testa 3 paths |
| `lib/sync/syncMeta.ts` | (a) ampliar `extractConversions` com `landing_page_view` e `initiate_checkout`; (b) popular `landingUrl` no upsert de ads; (c) `REFRESH MATERIALIZED VIEW CONCURRENTLY` ao final do sync |
| `lib/sync/syncMeta.test.ts` | Testes para `extractConversions` (novos matchers) e `extractLandingUrl` (3 formatos) |
| `drizzle/manual/002_pixel_funnel_views.sql` (novo) | `DROP + CREATE` das duas MVs com novas colunas |

### Schema

**`ads.landing_url`** — `text` nullable. Nullable porque ads cujo criativo foi deletado / story sem link retornam `null` (já tratado pelo sync atual: skip).

**`ad_insights_daily.conversions`** — sem migration estrutural. JSON tipado:

```typescript
export type AdConversions = {
  lead?: number;
  purchase?: number;
  revenue?: number;
  follow?: number;
  engagement?: number;
  landing_page_view?: number;
  initiate_checkout?: number;
};
```

Rows antigas (sem as chaves novas) leem como `undefined` — sem quebra.

### Sync

**Extração da URL de destino** (`lib/meta/extractors.ts`):

A Meta retorna o link em 3 lugares diferentes dependendo do tipo de criativo. Helper testa em ordem:

1. `object_story_spec.link_data.link` (imagem single)
2. `object_story_spec.video_data.call_to_action.value.link` (vídeo)
3. `asset_feed_spec.link_urls[0].website_url` (Advantage+/asset feed)

Retorna a primeira string válida ou `null`. Se houver múltiplos links (asset feed), guarda o primeiro — mesmo comportamento do Looker.

**Ampliação de `extractConversions`** (`lib/sync/syncMeta.ts:133`):

```typescript
const isLandingPageView = (t: string) =>
  t === "landing_page_view" ||
  t === "offsite_conversion.fb_pixel_view_content";

const checkoutMatchers = [
  (t: string) => t === "omni_initiated_checkout",
  (t: string) => t === "offsite_conversion.fb_pixel_initiate_checkout",
  (t: string) => t === "initiate_checkout",
];

return {
  // ...campos existentes
  landing_page_view: sumActions(insight.actions, isLandingPageView),
  initiate_checkout: pickByPriority(insight.actions, checkoutMatchers),
};
```

`pickByPriority` no checkout (igual ao `purchase`) porque Meta reporta o mesmo evento sob múltiplos `action_type` simultaneamente — `sumActions` duplicaria. `landing_page_view` usa `sumActions` porque costuma vir em único type.

### Materialized views

Definição atual em prod (`drizzle/manual/001_insights_views.sql`):

- `adset_insights_daily` — agrega `ad_insights_daily` por adset_id × date, soma impressions/clicks/spend/link_clicks/video_views, calcula CPM e CTR.
- `campaign_insights_daily` — mesma agregação por campaign_id × date (sem video_views).

Nova definição inclui agregações dos JSONs:

```sql
SUM(COALESCE((i.conversions->>'landing_page_view')::int, 0)) AS landing_page_view,
SUM(COALESCE((i.conversions->>'initiate_checkout')::int, 0)) AS initiate_checkout,
SUM(COALESCE((i.conversions->>'purchase')::int, 0)) AS purchase,
SUM(COALESCE((i.conversions->>'revenue')::numeric, 0))::numeric(14,2) AS revenue
```

Migration `drizzle/manual/002_pixel_funnel_views.sql`:

```sql
-- Backup das definições atuais ficou em git history (001_insights_views.sql)
DROP MATERIALIZED VIEW IF EXISTS adset_insights_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS campaign_insights_daily CASCADE;

CREATE MATERIALIZED VIEW adset_insights_daily AS ...;
CREATE UNIQUE INDEX adset_insights_daily_uq ON adset_insights_daily(adset_id, date);

CREATE MATERIALIZED VIEW campaign_insights_daily AS ...;
CREATE UNIQUE INDEX campaign_insights_daily_uq ON campaign_insights_daily(campaign_id, date);
```

Os unique indexes habilitam `REFRESH MATERIALIZED VIEW CONCURRENTLY` (sem lock leitura).

**Declaração em Drizzle** (`lib/schema/views.ts`): usar `pgMaterializedView(name, columns).existing()` para informar ao Drizzle que a view já existe e não tentar criá-la via `db:push`. Resolve a pendência conhecida (CLAUDE.md item 3).

### Backfill

`syncMeta({ mode: "backfill" })` já existe e cobre 90 dias. Ao rodar pós-deploy:

- Reescreve `conversions` JSON de cada row (substitui, não merge) → novas chaves aparecem.
- `landing_url` populada via upsert normal de ads.
- Refresh das MVs ao final.

Trigger: `POST /api/sync/refresh-now?mode=backfill` uma vez, fora de horário de pico.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| MVs em prod podem ter detalhes não capturados em `001_insights_views.sql` | Antes da migration, rodar `pg_get_viewdef('adset_insights_daily', true)` no Supabase SQL editor e comparar. Se diff, ajustar |
| `REFRESH CONCURRENTLY` precisa de unique index | Já incluído no `CREATE INDEX` da migration |
| Pixel mal configurado (não dispara InitiateCheckout) | A validação pós-deploy (query SQL abaixo) detecta zerado generalizado → é Pixel, não código |
| Backfill consome rate-limit Meta | Rodar fora de horário (madrugada SP) |

## Rollback

- Schema: `ALTER TABLE ads DROP COLUMN landing_url` — trivial.
- JSON conversions: chaves novas convivem com leitores antigos (que ignoram). Zero rollback.
- MVs: definição original preservada no git (`001_insights_views.sql`). Restaurar via `DROP + CREATE` do arquivo antigo.
- Código: revert do PR no Vercel.

## Critérios de pronto

- [ ] `npm run test` passa com novos testes de `extractConversions` e `extractLandingUrl`
- [ ] Migration aplicada em prod via `drizzle-kit migrate` (não `db:push`)
- [ ] Sync `backfill` rodado uma vez, sem erro
- [ ] Query de validação retorna dados não-zero:
  ```sql
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE conversions ? 'landing_page_view') AS com_lpv,
    COUNT(*) FILTER (WHERE conversions ? 'initiate_checkout') AS com_chkt
  FROM ad_insights_daily
  WHERE date >= CURRENT_DATE - 30;
  ```
- [ ] `landing_url` populada em ≥90% dos ads do Guia ativos:
  ```sql
  SELECT
    COUNT(*) AS total,
    COUNT(landing_url) AS com_url
  FROM ads a
  JOIN adsets s ON s.id = a.adset_id
  JOIN campaigns c ON c.id = s.campaign_id
  WHERE c.name ~ 'PERPETUO-GUIA|GUIA.*OBA' AND a.status = 'ACTIVE';
  ```
- [ ] Comparação manual com Looker em 3 datas: impressões, LPV e Checkout dentro de ±5%
- [ ] Cron diário roda sem novo erro nos logs Vercel

## Próximo passo

Fase 2: spec própria para o front das 4 tabelas em `/guia`, com queries dedicadas e componentes de tabela responsiva.
