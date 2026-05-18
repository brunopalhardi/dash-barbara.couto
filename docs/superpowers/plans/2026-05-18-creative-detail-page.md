# Página de Detalhe do Criativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar página interna `/desafio/criativo/[adId]` (+ `/guia/criativo/[adId]`) inspirada CliniFunnel com lista ranqueada de criativos + painel direito com preview, métricas avançadas (Hook/Hold/Body Rate, Score), radar chart e botão "Ver anúncio".

**Architecture:** 7 tasks sequenciais. Migration adiciona 3 colunas video em `ad_insights_daily`. Sync parser captura `video_3s/p25/p95_watched_actions` do Meta `video_play_actions[]`. Query nova `getAdDetail` agrega tudo + deriva Hook/Hold/Body/Score (fórmulas padrão de mercado). 3 componentes novos: `metric-bar`, `creative-radar`, `creative-detail-panel`. Página server-component server-side. TopCreativesGrid passa a apontar pra rota interna.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Recharts (RadarChart), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-18-creative-detail-page-design.md`

---

## File map

### Migration + schema
- Modify: `lib/schema/insights.ts` — adicionar `video_p3s`, `video_p25`, `video_p95`
- Create: `drizzle/0009_video_play_metrics.sql` — migration ALTER TABLE
- Modify: `drizzle/meta/_journal.json` — entry pro 0009 (auto via `db:generate`)

### Sync parser
- Modify: `lib/sync/syncMeta.ts` — `parseVideoMetric` helper + insert/update incluem `videoP3s/p25/p50/p75/p95/videoViews`

### Queries
- Modify: `lib/queries/dashboard.ts` — exportar `AdDetail` interface + função `getAdDetail(adId, range)`
- Modify: `lib/queries/dashboard.ts` (existing `getTopAds`) — incluir `videoViews/p3s/p25/p50/p75/p95` no select pra reuso futuro (opt-in via opção)

### Componentes
- Create: `components/dashboard/metric-bar.tsx` — barra horizontal com gradient + label/valor/%
- Create: `components/dashboard/creative-radar.tsx` — Recharts RadarChart 3 axes
- Create: `components/dashboard/creative-detail-panel.tsx` — painel completo da direita
- Create: `components/dashboard/creative-list.tsx` — lista ranqueada client com sort dropdown

### Páginas
- Create: `app/(dashboard)/desafio/criativo/[adId]/page.tsx`
- Create: `app/(dashboard)/guia/criativo/[adId]/page.tsx`

### Mudanças leves
- Modify: `components/dashboard/top-creatives-grid.tsx` — link de `wa.me/...ad/library...` pra `/desafio/criativo/[adId]` (recebe `basePath` prop)
- Modify: `app/(dashboard)/desafio/page.tsx` + `/guia/page.tsx` — passar `basePath` pro grid
- Modify: `package.json` + `lib/version.ts` — bump v0.8.0

---

## Task 1: Schema + migration pras 3 colunas de video novas

**Files:**
- Modify: `lib/schema/insights.ts`
- Create: `drizzle/0009_video_play_metrics.sql` (gerado via `db:generate`)
- Modify: `drizzle/meta/_journal.json` (auto)

### Step 1: Adicionar colunas no schema

Edit `lib/schema/insights.ts`. Localizar o bloco:

```typescript
    videoViews: integer("video_views"),
    videoP50: integer("video_p50"),
    videoP75: integer("video_p75"),
```

Substituir por:

```typescript
    videoViews: integer("video_views"),
    videoP3s: integer("video_p3s"),
    videoP25: integer("video_p25"),
    videoP50: integer("video_p50"),
    videoP75: integer("video_p75"),
    videoP95: integer("video_p95"),
```

### Step 2: Gerar migration

```bash
npm run db:generate
```

Esperado: novo arquivo `drizzle/0009_<adj>_<noun>.sql` com 3 `ALTER TABLE ... ADD COLUMN`. Renomear pra `drizzle/0009_video_play_metrics.sql`. Atualizar `drizzle/meta/_journal.json` linha do idx=9 com `"tag": "0009_video_play_metrics"` (pra bater filename — bug que pegamos antes em `0007_purchases`).

### Step 3: Aplicar em prod

```bash
set -a; source .env.local; set +a
npx tsx -e "
import postgres from 'postgres';
import fs from 'fs';
(async () => {
  const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
  const file = fs.readFileSync('drizzle/0009_video_play_metrics.sql', 'utf8');
  for (const stmt of file.split('--> statement-breakpoint')) {
    if (stmt.trim()) await sql.unsafe(stmt);
  }
  console.log('Migration aplicada');
  process.exit(0);
})();
"
```

(Aplica direto no banco — drizzle-kit migrate teve problemas antes; SQL direto é mais confiável.)

### Step 4: tsc + commit

```bash
npx tsc --noEmit
git add lib/schema/insights.ts drizzle/0009_video_play_metrics.sql drizzle/meta/_journal.json drizzle/meta/0009_snapshot.json
git commit -m "feat(insights): add video_p3s/p25/p95 columns"
```

---

## Task 2: Sync parser captura video_play_actions

**Files:**
- Modify: `lib/sync/syncMeta.ts`

### Step 1: Adicionar helper `parseVideoMetric`

Edit `lib/sync/syncMeta.ts`. Localizar `function extractConversions(insight: MetaInsight)` (linha ~103) e ADICIONAR antes dela:

```typescript
/**
 * Extrai uma métrica de video_play_actions[] do Meta pelo action_type.
 * Meta retorna como [{ action_type: "video_view", value: "1234" }, ...].
 * Os action_types relevantes:
 *   - video_view (views totais)
 *   - video_3_sec_watched_actions
 *   - video_p25_watched_actions
 *   - video_p50_watched_actions
 *   - video_p75_watched_actions
 *   - video_p95_watched_actions
 */
function parseVideoMetric(
  actions: MetaInsight["video_play_actions"] | undefined,
  actionType: string,
): number | null {
  if (!actions) return null;
  const found = actions.find((a) => a.action_type === actionType);
  if (!found) return null;
  const n = Number(found.value);
  return Number.isFinite(n) ? n : null;
}
```

### Step 2: Persistir os 6 campos no insert/update

Localizar (linha ~340-373):

```typescript
      for (const ins of apiInsights) {
        const adDbId = adIdMap.get(ins.ad_id);
        if (!adDbId) continue;
        const conversions = extractConversions(ins);
        await db
          .insert(adInsightsDaily)
          .values({
            adId: adDbId,
            date: ins.date_start,
            impressions: Number(ins.impressions ?? 0),
            clicks: Number(ins.clicks ?? 0),
            spend: ins.spend ?? "0",
            cpm: ins.cpm ?? null,
            ctr: ins.ctr ?? null,
            reach: ins.reach ? Number(ins.reach) : null,
            frequency: ins.frequency ?? null,
            linkClicks: ins.inline_link_clicks ? Number(ins.inline_link_clicks) : null,
            conversions,
          })
          .onConflictDoUpdate({
            target: [adInsightsDaily.adId, adInsightsDaily.date],
            set: {
              impressions: Number(ins.impressions ?? 0),
              clicks: Number(ins.clicks ?? 0),
              spend: ins.spend ?? "0",
              cpm: ins.cpm ?? null,
              ctr: ins.ctr ?? null,
              reach: ins.reach ? Number(ins.reach) : null,
              frequency: ins.frequency ?? null,
              linkClicks: ins.inline_link_clicks ? Number(ins.inline_link_clicks) : null,
              conversions,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.ad_insights_daily++;
      }
```

Substituir por:

```typescript
      for (const ins of apiInsights) {
        const adDbId = adIdMap.get(ins.ad_id);
        if (!adDbId) continue;
        const conversions = extractConversions(ins);
        const videoViews = parseVideoMetric(ins.video_play_actions, "video_view");
        const videoP3s = parseVideoMetric(ins.video_play_actions, "video_3_sec_watched_actions");
        const videoP25 = parseVideoMetric(ins.video_play_actions, "video_p25_watched_actions");
        const videoP50 = parseVideoMetric(ins.video_play_actions, "video_p50_watched_actions");
        const videoP75 = parseVideoMetric(ins.video_play_actions, "video_p75_watched_actions");
        const videoP95 = parseVideoMetric(ins.video_play_actions, "video_p95_watched_actions");
        await db
          .insert(adInsightsDaily)
          .values({
            adId: adDbId,
            date: ins.date_start,
            impressions: Number(ins.impressions ?? 0),
            clicks: Number(ins.clicks ?? 0),
            spend: ins.spend ?? "0",
            cpm: ins.cpm ?? null,
            ctr: ins.ctr ?? null,
            reach: ins.reach ? Number(ins.reach) : null,
            frequency: ins.frequency ?? null,
            linkClicks: ins.inline_link_clicks ? Number(ins.inline_link_clicks) : null,
            videoViews,
            videoP3s,
            videoP25,
            videoP50,
            videoP75,
            videoP95,
            conversions,
          })
          .onConflictDoUpdate({
            target: [adInsightsDaily.adId, adInsightsDaily.date],
            set: {
              impressions: Number(ins.impressions ?? 0),
              clicks: Number(ins.clicks ?? 0),
              spend: ins.spend ?? "0",
              cpm: ins.cpm ?? null,
              ctr: ins.ctr ?? null,
              reach: ins.reach ? Number(ins.reach) : null,
              frequency: ins.frequency ?? null,
              linkClicks: ins.inline_link_clicks ? Number(ins.inline_link_clicks) : null,
              videoViews,
              videoP3s,
              videoP25,
              videoP50,
              videoP75,
              videoP95,
              conversions,
              updatedAt: new Date(),
            },
          });
        r.rowsByTable.ad_insights_daily++;
      }
```

### Step 3: tsc + commit

```bash
npx tsc --noEmit
git add lib/sync/syncMeta.ts
git commit -m "feat(sync-meta): captura video_play_actions (3s, p25, p50, p75, p95)"
```

---

## Task 3: Query `getAdDetail`

**Files:**
- Modify: `lib/queries/dashboard.ts`

### Step 1: Adicionar interface `AdDetail`

Edit `lib/queries/dashboard.ts`. Localizar `export interface AdRow` (linha 53), inserir abaixo dela:

```typescript
export interface AdDetail {
  adId: number;
  metaAdId: string;
  adName: string;
  campaignName: string;
  thumbnailUrl: string | null;
  previewShareableLink: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  ctr: number; // %
  cpl: number;
  cac: number;
  roas: number;
  videoViews: number;
  video3s: number;
  video25: number;
  video50: number;
  video75: number;
  video95: number;
  hookRate: number; // %
  holdRate: number; // %
  bodyRate: number; // %
  score: number; // 0-100
}
```

### Step 2: Implementar `getAdDetail`

Adicionar ao final do arquivo:

```typescript
/**
 * Retorna métricas agregadas de UM ad no período + métricas derivadas
 * de vídeo (Hook Rate, Hold Rate, Body Rate, Score).
 *
 * Fórmulas:
 *   - Hook Rate = video_p3s / impressions × 100
 *   - Hold Rate = video_p25 / impressions × 100
 *   - Body Rate = video_p50 / impressions × 100
 *   - Score = (Hook × 0.3 + Hold × 0.4 + Body × 0.3)
 */
export async function getAdDetail(
  adId: number,
  range: DateRange,
): Promise<AdDetail | null> {
  const [row] = await db
    .select({
      adId: ads.id,
      metaAdId: ads.metaId,
      adName: ads.name,
      campaignName: campaigns.name,
      thumbnailUrl: creatives.thumbnailUrl,
      previewShareableLink: ads.previewUrl,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      leads: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'lead')::float), 0)`,
      purchases: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::float), 0)`,
      revenue: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'revenue')::float), 0)`,
      videoViews: sql<number>`coalesce(sum(${adInsightsDaily.videoViews})::int, 0)`,
      video3s: sql<number>`coalesce(sum(${adInsightsDaily.videoP3s})::int, 0)`,
      video25: sql<number>`coalesce(sum(${adInsightsDaily.videoP25})::int, 0)`,
      video50: sql<number>`coalesce(sum(${adInsightsDaily.videoP50})::int, 0)`,
      video75: sql<number>`coalesce(sum(${adInsightsDaily.videoP75})::int, 0)`,
      video95: sql<number>`coalesce(sum(${adInsightsDaily.videoP95})::int, 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .leftJoin(creatives, eq(creatives.id, ads.creativeId))
    .where(
      and(
        eq(ads.id, adId),
        gte(adInsightsDaily.date, range.from),
        lte(adInsightsDaily.date, range.to),
      ),
    )
    .groupBy(ads.id, ads.metaId, ads.name, ads.previewUrl, campaigns.name, creatives.thumbnailUrl);

  if (!row) return null;

  const impressions = Number(row.impressions);
  const clicks = Number(row.clicks);
  const spend = Number(row.spend);
  const leads = Number(row.leads);
  const purchases = Number(row.purchases);
  const revenue = Number(row.revenue);
  const video3s = Number(row.video3s);
  const video25 = Number(row.video25);
  const video50 = Number(row.video50);

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpl = leads > 0 ? spend / leads : 0;
  const cac = purchases > 0 ? spend / purchases : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const hookRate = impressions > 0 ? (video3s / impressions) * 100 : 0;
  const holdRate = impressions > 0 ? (video25 / impressions) * 100 : 0;
  const bodyRate = impressions > 0 ? (video50 / impressions) * 100 : 0;
  const score = hookRate * 0.3 + holdRate * 0.4 + bodyRate * 0.3;

  return {
    adId: row.adId,
    metaAdId: row.metaAdId,
    adName: row.adName,
    campaignName: row.campaignName,
    thumbnailUrl: row.thumbnailUrl,
    previewShareableLink: row.previewShareableLink,
    spend,
    impressions,
    clicks,
    leads,
    purchases,
    revenue,
    ctr,
    cpl,
    cac,
    roas,
    videoViews: Number(row.videoViews),
    video3s,
    video25,
    video50,
    video75: Number(row.video75),
    video95: Number(row.video95),
    hookRate,
    holdRate,
    bodyRate,
    score,
  };
}
```

### Step 3: tsc + commit

```bash
npx tsc --noEmit
git add lib/queries/dashboard.ts
git commit -m "feat(queries): getAdDetail com Hook/Hold/Body Rate + Score"
```

---

## Task 4: Componente `MetricBar`

**Files:**
- Create: `components/dashboard/metric-bar.tsx`

### Step 1: Criar componente

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricBarProps {
  label: string;
  /** Valor formatado pra display (ex.: "59.7%", "R$ 1.51", "1.234") */
  value: string;
  /** Percentual 0-100 pra largura da barra */
  percent: number;
  /** Tipo de gradient — define a cor */
  variant?: "ctr" | "hook" | "hold" | "body" | "cpl" | "score" | "spend";
  icon?: LucideIcon;
}

const VARIANT_GRADIENT: Record<NonNullable<MetricBarProps["variant"]>, string> = {
  ctr: "from-pink-500 to-rose-400",
  hook: "from-sky-500 to-blue-400",
  hold: "from-blue-500 to-indigo-400",
  body: "from-indigo-500 to-violet-400",
  cpl: "from-violet-500 to-fuchsia-400",
  score: "from-fuchsia-500 to-pink-400",
  spend: "from-emerald-500 to-teal-400",
};

export function MetricBar({ label, value, percent, variant = "ctr", icon: Icon }: MetricBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          {Icon ? <Icon className="h-3 w-3" /> : null}
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all", VARIANT_GRADIENT[variant])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
```

### Step 2: tsc + commit

```bash
npx tsc --noEmit
git add components/dashboard/metric-bar.tsx
git commit -m "feat(dashboard): MetricBar com gradient configurável"
```

---

## Task 5: Componente `CreativeRadar`

**Files:**
- Create: `components/dashboard/creative-radar.tsx`

### Step 1: Criar componente

```tsx
"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

interface CreativeRadarProps {
  hookRate: number; // 0-100
  holdRate: number; // 0-100
  bodyRate: number; // 0-100
}

export function CreativeRadar({ hookRate, holdRate, bodyRate }: CreativeRadarProps) {
  const data = [
    { axis: "Hook", value: hookRate },
    { axis: "Hold", value: holdRate },
    { axis: "Body", value: bodyRate },
  ];
  // Determina o domínio: pelo menos 25, ou 1.2× do maior
  const max = Math.max(25, ...data.map((d) => d.value)) * 1.2;
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--color-border)" strokeOpacity={0.4} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <PolarRadiusAxis
            tick={false}
            axisLine={false}
            domain={[0, max]}
          />
          <Radar
            dataKey="value"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.25}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Step 2: tsc + commit

```bash
npx tsc --noEmit
git add components/dashboard/creative-radar.tsx
git commit -m "feat(dashboard): CreativeRadar com Body/Hook/Hold"
```

---

## Task 6: Página `/desafio/criativo/[adId]` + componentes

**Files:**
- Create: `components/dashboard/creative-list.tsx`
- Create: `components/dashboard/creative-detail-panel.tsx`
- Create: `app/(dashboard)/desafio/criativo/[adId]/page.tsx`
- Create: `app/(dashboard)/guia/criativo/[adId]/page.tsx`

### Step 1: Criar `components/dashboard/creative-list.tsx`

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { AdRow } from "@/lib/queries/dashboard";

type SortKey = "ctr" | "roas" | "spend" | "purchases";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "ctr", label: "CTR" },
  { key: "roas", label: "ROAS" },
  { key: "spend", label: "Gasto" },
  { key: "purchases", label: "Vendas" },
];

interface CreativeListProps {
  ads: AdRow[];
  basePath: string; // "/desafio/criativo" | "/guia/criativo"
  activeAdId?: number;
}

function ctrOf(ad: AdRow): number {
  return ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
}

export function CreativeList({ ads, basePath, activeAdId }: CreativeListProps) {
  const [sortBy, setSortBy] = useState<SortKey>("ctr");

  const sorted = [...ads].sort((a, b) => {
    if (sortBy === "ctr") return ctrOf(b) - ctrOf(a);
    return (b[sortBy] as number) - (a[sortBy] as number);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Ordenar por</span>
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-md border border-border/60 bg-card text-xs text-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
        {sorted.map((ad, idx) => {
          const active = ad.adId === activeAdId;
          const ctr = ctrOf(ad);
          const roas = ad.spend > 0 ? ad.revenue / ad.spend : 0;
          return (
            <Link
              key={ad.adId}
              href={`${basePath}/${ad.adId}`}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-md border transition-colors",
                active
                  ? "bg-primary/10 border-primary/40"
                  : "bg-card border-border/60 hover:border-primary/30",
              )}
            >
              <div className="flex flex-col items-center gap-1 shrink-0 w-7">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">#{idx + 1}</span>
                <div className="h-7 w-7 rounded bg-muted/40 flex items-center justify-center overflow-hidden">
                  {ad.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={ad.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{ad.adName}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums flex gap-3">
                  <span>CTR {fmt.pct(ctr, 1)}</span>
                  <span>ROAS {fmt.ratio(roas)}</span>
                  <span>{fmt.money(ad.spend)}</span>
                </div>
              </div>
            </Link>
          );
        })}
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Sem criativos no período.
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

### Step 2: Criar `components/dashboard/creative-detail-panel.tsx`

```tsx
import { ExternalLink, ImageOff, Target, TrendingUp, ShoppingCart, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import { MetricBar } from "./metric-bar";
import { CreativeRadar } from "./creative-radar";
import type { AdDetail } from "@/lib/queries/dashboard";

interface CreativeDetailPanelProps {
  ad: AdDetail;
}

export function CreativeDetailPanel({ ad }: CreativeDetailPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Gasto
          </div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.money(ad.spend)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <Target className="h-3 w-3" /> Leads
          </div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.int(ad.leads)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <ShoppingCart className="h-3 w-3" /> Vendas
          </div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.int(ad.purchases)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Receita
          </div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.money(ad.revenue)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ROAS</div>
          <div className="text-lg font-bold tabular-nums mt-1">{fmt.ratio(ad.roas)}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CAC</div>
          <div className="text-lg font-bold tabular-nums mt-1">
            {ad.purchases > 0 ? fmt.money(ad.cac) : "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-card border-border/60">
          <CardContent className="p-5">
            <div className="aspect-video rounded-md bg-muted/30 mb-4 relative flex items-center justify-center overflow-hidden">
              {ad.thumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={ad.thumbnailUrl} alt={ad.adName} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="h-8 w-8" />
                  <span className="text-xs">sem thumb</span>
                </div>
              )}
              {ad.previewShareableLink ? (
                <a
                  href={ad.previewShareableLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background/90 border border-border text-xs font-medium hover:bg-background"
                >
                  Ver anúncio <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>

            <h2 className="text-lg font-semibold mb-1">{ad.adName}</h2>
            <p className="text-xs text-muted-foreground mb-4">{ad.campaignName}</p>

            <div className="space-y-3">
              <MetricBar
                label="CTR"
                value={fmt.pct(ad.ctr, 2)}
                percent={Math.min(100, ad.ctr * 10)}
                variant="ctr"
              />
              <MetricBar
                label="Hook Rate"
                value={fmt.pct(ad.hookRate, 1)}
                percent={ad.hookRate}
                variant="hook"
              />
              <MetricBar
                label="Hold Rate"
                value={fmt.pct(ad.holdRate, 1)}
                percent={ad.holdRate}
                variant="hold"
              />
              <MetricBar
                label="Body Rate"
                value={fmt.pct(ad.bodyRate, 1)}
                percent={ad.bodyRate}
                variant="body"
              />
              <MetricBar
                label="CPL"
                value={ad.leads > 0 ? fmt.money(ad.cpl) : "—"}
                percent={Math.min(100, ad.cpl > 0 ? Math.max(5, 100 - ad.cpl * 2) : 0)}
                variant="cpl"
              />
              <MetricBar
                label="Score"
                value={ad.score.toFixed(1)}
                percent={Math.min(100, ad.score)}
                variant="score"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60">
          <CardContent className="p-5">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
              Métricas de vídeo
            </h3>
            <CreativeRadar
              hookRate={ad.hookRate}
              holdRate={ad.holdRate}
              bodyRate={ad.bodyRate}
            />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
              <div>
                <div className="text-muted-foreground">Hook</div>
                <div className="font-semibold tabular-nums">{fmt.pct(ad.hookRate, 1)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Hold</div>
                <div className="font-semibold tabular-nums">{fmt.pct(ad.holdRate, 1)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Body</div>
                <div className="font-semibold tabular-nums">{fmt.pct(ad.bodyRate, 1)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function CreativeDetailEmpty() {
  return (
    <Card className="bg-card border-border/60">
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        Criativo não encontrado no período selecionado.
      </CardContent>
    </Card>
  );
}
```

### Step 3: Criar `app/(dashboard)/desafio/criativo/[adId]/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { getAdDetail, getTopAds, rangeCurrentCycle } from "@/lib/queries/dashboard";
import { CreativeList } from "@/components/dashboard/creative-list";
import { CreativeDetailEmpty, CreativeDetailPanel } from "@/components/dashboard/creative-detail-panel";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

const DEFAULT_CYCLE = 30;

function parseCycle(sp: { cycle?: string; start?: string; end?: string }) {
  const custom =
    sp.start && sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) && /^\d{4}-\d{2}-\d{2}$/.test(sp.end)
      ? { start: sp.start, end: sp.end }
      : undefined;
  if (custom) {
    const days = Math.round(
      (new Date(custom.end + "T00:00:00").getTime() -
        new Date(custom.start + "T00:00:00").getTime()) / 86_400_000,
    ) + 1;
    return { cycleDays: Math.max(1, days), custom };
  }
  const n = Number(sp.cycle ?? DEFAULT_CYCLE);
  return { cycleDays: Number.isFinite(n) && n > 0 ? n : DEFAULT_CYCLE, custom: undefined };
}

export default async function DesafioCreativeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ adId: string }>;
  searchParams: Promise<{ cycle?: string; start?: string; end?: string }>;
}) {
  const { adId: adIdRaw } = await params;
  const adId = Number(adIdRaw);
  if (!Number.isFinite(adId)) notFound();

  const sp = await searchParams;
  const { cycleDays, custom } = parseCycle(sp);
  const range = rangeCurrentCycle(cycleDays, custom);

  const [detail, ranking] = await Promise.all([
    getAdDetail(adId, range),
    getTopAds("desafio", range, { limit: 100, orderBy: "spend" }),
  ]);

  return (
    <>
      <PageHeader
        title="Análise de criativos"
        subtitle="Desafio · clique nos criativos pra comparar métricas"
        hidePicker
      />
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <CreativeList ads={ranking} basePath="/desafio/criativo" activeAdId={adId} />
        {detail ? <CreativeDetailPanel ad={detail} /> : <CreativeDetailEmpty />}
      </div>
    </>
  );
}
```

### Step 4: Criar `app/(dashboard)/guia/criativo/[adId]/page.tsx`

Mesmo conteúdo trocando `"desafio"` → `"guia"` no `getTopAds` e nos textos. Copia o arquivo de step 3 e altera:
- Linha `getTopAds("desafio", ...)` → `getTopAds("guia", ...)`
- `basePath="/desafio/criativo"` → `basePath="/guia/criativo"` (2 ocorrências)
- `subtitle="Desafio · ..."` → `subtitle="Guia · ..."`
- Renomear função `DesafioCreativeDetailPage` → `GuiaCreativeDetailPage`

### Step 5: tsc + build

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```

Esperado: tsc clean, build emitindo rotas `/desafio/criativo/[adId]` e `/guia/criativo/[adId]`.

### Step 6: Commit

```bash
git add components/dashboard/creative-list.tsx components/dashboard/creative-detail-panel.tsx \
  app/\(dashboard\)/desafio/criativo/ app/\(dashboard\)/guia/criativo/
git commit -m "feat(dashboard): página /criativo/[adId] com lista + painel detalhado"
```

---

## Task 7: TopCreativesGrid aponta pra rota interna + bump v0.8.0 + merge

**Files:**
- Modify: `components/dashboard/top-creatives-grid.tsx`
- Modify: `app/(dashboard)/desafio/page.tsx`
- Modify: `app/(dashboard)/guia/page.tsx`
- Modify: `package.json` (bump 0.7.0 → 0.8.0)

### Step 1: Atualizar `top-creatives-grid.tsx`

Substituir conteúdo:

```tsx
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { AdRow } from "@/lib/queries/dashboard";

interface TopCreativesGridProps {
  ads: AdRow[];
  limit?: number;
  /** Base href pra rota de detalhe (ex.: "/desafio/criativo"). Sem trailing slash. */
  basePath: string;
}

function roasColor(roas: number): string {
  if (roas >= 2) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (roas >= 1) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-rose-400 bg-rose-500/10 border-rose-500/30";
}

export function TopCreativesGrid({ ads, limit = 5, basePath }: TopCreativesGridProps) {
  const top = [...ads]
    .filter((a) => a.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);

  if (top.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem criativos com gasto no período.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {top.map((ad) => {
        const roas = ad.spend > 0 ? ad.revenue / ad.spend : 0;
        const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
        return (
          <Link
            key={ad.adId}
            href={`${basePath}/${ad.adId}`}
            title="Ver análise detalhada"
            className="rounded-lg border border-border/60 bg-card overflow-hidden flex flex-col hover:border-primary/40 transition-colors group"
          >
            <div className="aspect-square bg-muted/30 relative flex items-center justify-center">
              {ad.thumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ad.thumbnailUrl}
                  alt={ad.adName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">sem thumb</span>
              )}
              <span
                className={cn(
                  "absolute top-2 right-2 px-1.5 py-0.5 text-[10px] rounded border font-semibold tabular-nums",
                  roasColor(roas),
                )}
              >
                {fmt.ratio(roas)}
              </span>
              <ExternalLink className="absolute top-2 left-2 h-3.5 w-3.5 text-foreground/0 group-hover:text-foreground/80 transition-colors" />
            </div>
            <div className="p-2.5 flex-1 flex flex-col gap-1">
              <div className="text-xs font-medium truncate" title={ad.adName}>
                {ad.adName}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums flex justify-between">
                <span>{fmt.int(ad.impressions, true)} imp</span>
                <span>CTR {fmt.pct(ctr, 1)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums flex justify-between">
                <span>{fmt.money(ad.spend)}</span>
                <span>{fmt.int(ad.purchases)} vendas</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
```

### Step 2: Atualizar `app/(dashboard)/desafio/page.tsx`

Localizar `<TopCreativesGrid ads={adsTbl} limit={5} />` e substituir por:

```tsx
<TopCreativesGrid ads={adsTbl} limit={5} basePath="/desafio/criativo" />
```

### Step 3: Atualizar `app/(dashboard)/guia/page.tsx`

Mesma substituição:

```tsx
<TopCreativesGrid ads={adsTbl} limit={5} basePath="/guia/criativo" />
```

### Step 4: Bump versão

```bash
npm version 0.8.0 --no-git-tag-version
```

### Step 5: tsc + build + commit + merge

```bash
npx tsc --noEmit
npm run build 2>&1 | tail -5
git add components/dashboard/top-creatives-grid.tsx app/\(dashboard\)/desafio/page.tsx \
  app/\(dashboard\)/guia/page.tsx package.json package-lock.json
git commit -m "feat: top criativos aponta pra rota interna + bump v0.8.0"

git checkout main
git merge --no-ff feat/creative-detail-page -m "Merge branch 'feat/creative-detail-page'

v0.8.0 — Página de detalhe do criativo (/desafio/criativo/[adId]):
lista ranqueada por CTR/ROAS/Gasto/Vendas, painel direito com preview,
barras horizontais de CTR/Hook/Hold/Body/CPL/Score, radar Body×Hook×Hold,
botão 'Ver anúncio' usando preview_shareable_link.

Inclui:
- Schema: video_p3s/p25/p95 em ad_insights_daily
- Sync: captura video_play_actions completo
- Query: getAdDetail com fórmulas Hook (3s/imp), Hold (25%/imp),
  Body (50%/imp), Score (média ponderada)
- TopCreativesGrid: aponta pra rota interna em vez de Ad Library

Espelhado em /guia/criativo/[adId].
"
git push origin main
```

Vercel deploya automático. Após deploy verde, Bruno aperta "Sincronizar" no `/settings/integrations` pra popular as 3 colunas video novas.

---

## Verificação final

- [ ] `npm test` — todos verdes
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run build` — rotas `/desafio/criativo/[adId]` e `/guia/criativo/[adId]` listadas
- [ ] Sidebar mostra `v0.8.0 · <hash>` após deploy
- [ ] Click num card de Top Criativos no /desafio → abre /desafio/criativo/[adId]
- [ ] Lista esquerda permite trocar sort (CTR/ROAS/Gasto/Vendas)
- [ ] Botão "Ver anúncio" abre `preview_shareable_link` (ou some se for null)
- [ ] Bruno aperta Sincronizar → métricas de vídeo (Hook/Hold/Body) saem de 0%

## Fora de escopo confirmado

- Editar criativo dali (read-only)
- Comparar lado-a-lado
- Histórico temporal do criativo
- Re-fetch automático ao mudar período no detalhe (já server-renderiza com searchParams)
