# Guia — Detalhamento Tráfego Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar 4 tabelas de detalhamento de tráfego em `/guia` (Diário do Funil, por Campanha, por Criativo, por Página), inspiradas no Looker do Bruno mas com UI/UX próprio do dashboard.

**Architecture:** Server components Next.js consumindo 4 queries dedicadas em `lib/queries/funnel.ts`. Tabelas usam shadcn `Table` em wrapper `overflow-x-auto`. Cor monocromática + destaques sutis (CPA target, taxas críticas). Sem state client-side.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle, shadcn/ui Table, Tailwind.

---

## File Structure

**Criados:**
- `lib/queries/funnel.ts` — 4 funções de query
- `components/dashboard/funnel-table-daily.tsx`
- `components/dashboard/funnel-table-campaign.tsx`
- `components/dashboard/funnel-table-creative.tsx`
- `components/dashboard/funnel-table-page.tsx`

**Modificados:**
- `components/dashboard/format.ts` — `fmt.pct1` e helper `cpaTone(cpa, spend)` que retorna severity
- `app/(dashboard)/guia/page.tsx` — integra os 4 cards após "Compradores do período"

---

### Task 1: Helpers de formato

**Files:**
- Modify: `components/dashboard/format.ts`

- [ ] **Step 1: Adicionar helper de percentual 1-casa e tom de CPA**

Adicionar ao objeto `fmt` (depois de `pct` e antes de `ratio`):

```typescript
  pct1(v: number): string {
    if (!isFinite(v)) return "—";
    return v.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }) + "%";
  },
```

E depois do objeto `fmt` (no final do arquivo), exportar:

```typescript
/**
 * Severidade visual do CPA baseada no gasto do período: bom (<spend/3),
 * neutro (spend/3..spend/2), ruim (>spend/2). Útil para colorir células.
 */
export type CpaTone = "good" | "neutral" | "bad" | "none";

export function cpaTone(cpa: number, spend: number): CpaTone {
  if (!isFinite(cpa) || cpa === 0 || spend === 0) return "none";
  const low = spend / 3;
  const high = spend / 2;
  if (cpa < low) return "good";
  if (cpa < high) return "neutral";
  return "bad";
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/format.ts
git commit -m "feat(format): pct1 helper and cpaTone severity"
```

---

### Task 2: Query funnel diário

**Files:**
- Create: `lib/queries/funnel.ts`

- [ ] **Step 1: Criar arquivo com tipos compartilhados e query daily**

Conteúdo inicial de `lib/queries/funnel.ts`:

```typescript
import { and, eq, gte, like, lte, or, sql, type SQL, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adAccounts,
  adInsightsDaily,
  ads,
  adsets,
  campaigns,
  creatives,
} from "@/lib/schema";
import { getProduct, type Product, type ProductSlug } from "@/lib/products";
import type { DateRange } from "./dashboard";

/* ─── product scope (copiado de dashboard.ts para evitar export interno) ─── */

function extractAlternationTokens(re: RegExp): string[] {
  const src = re.source;
  const parts = src.split("|").map((p) => p.replace(/^\\/, "").replace(/\$$/, ""));
  return parts.map((p) => p.replace(/[.*+?(){}[\]\\^$|]/g, " ").trim()).filter(Boolean);
}

function productScopeWhere(product: Product): SQL[] {
  const where: SQL[] = [];
  if (product.metaAccountId) {
    where.push(eq(adAccounts.metaAccountId, product.metaAccountId));
  }
  if (product.namePattern) {
    const tokens = extractAlternationTokens(product.namePattern);
    if (tokens.length === 1) {
      where.push(like(sql`upper(${campaigns.name})`, `%${tokens[0].toUpperCase()}%`));
    } else if (tokens.length > 1) {
      where.push(
        or(...tokens.map((t) => like(sql`upper(${campaigns.name})`, `%${t.toUpperCase()}%`)))!,
      );
    }
  }
  return where;
}

/* ─── 1. Diário do Funil ─── */

export interface DailyFunnelRow {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  landingPageView: number;
  initiateCheckout: number;
  purchase: number;
}

export async function getDailyFunnel(
  slug: ProductSlug,
  range: DateRange,
): Promise<DailyFunnelRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];

  const rows = await db
    .select({
      date: adInsightsDaily.date,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      lpv: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'landing_page_view')::int), 0)`,
      chkt: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'initiate_checkout')::int), 0)`,
      purchase: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::int), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(adInsightsDaily.date)
    .orderBy(desc(adInsightsDaily.date));

  return rows.map((r) => ({
    date: r.date,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    spend: Number(r.spend),
    landingPageView: Number(r.lpv),
    initiateCheckout: Number(r.chkt),
    purchase: Number(r.purchase),
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/funnel.ts
git commit -m "feat(queries): getDailyFunnel for /guia daily breakdown"
```

---

### Task 3: Query funnel por campanha

**Files:**
- Modify: `lib/queries/funnel.ts`

- [ ] **Step 1: Adicionar getCampaignFunnel**

Adicionar no final de `lib/queries/funnel.ts`:

```typescript
/* ─── 2. Por Campanha ─── */

export interface CampaignFunnelRow {
  campaignId: number;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  landingPageView: number;
  initiateCheckout: number;
  purchase: number;
}

export async function getCampaignFunnel(
  slug: ProductSlug,
  range: DateRange,
): Promise<CampaignFunnelRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];

  const rows = await db
    .select({
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      reach: sql<number>`coalesce(sum(${adInsightsDaily.reach})::int, 0)`,
      lpv: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'landing_page_view')::int), 0)`,
      chkt: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'initiate_checkout')::int), 0)`,
      purchase: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::int), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(campaigns.id, campaigns.name)
    .orderBy(desc(sql`sum(${adInsightsDaily.spend})`));

  return rows.map((r) => ({
    campaignId: Number(r.campaignId),
    campaignName: String(r.campaignName),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    spend: Number(r.spend),
    reach: Number(r.reach),
    landingPageView: Number(r.lpv),
    initiateCheckout: Number(r.chkt),
    purchase: Number(r.purchase),
  }));
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add lib/queries/funnel.ts
git commit -m "feat(queries): getCampaignFunnel breakdown"
```

---

### Task 4: Query funnel por criativo

**Files:**
- Modify: `lib/queries/funnel.ts`

- [ ] **Step 1: Adicionar getCreativeFunnel**

Adicionar no final:

```typescript
/* ─── 3. Por Criativo ─── */

export interface CreativeFunnelRow {
  adId: number;
  adName: string;
  thumbnailUrl: string | null;
  landingUrl: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  purchase: number;
}

export async function getCreativeFunnel(
  slug: ProductSlug,
  range: DateRange,
  limit = 50,
): Promise<CreativeFunnelRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];

  const rows = await db
    .select({
      adId: ads.id,
      adName: ads.name,
      thumbnailUrl: creatives.thumbnailUrl,
      landingUrl: ads.landingUrl,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      purchase: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::int), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .leftJoin(creatives, eq(creatives.id, ads.creativeId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(ads.id, ads.name, creatives.thumbnailUrl, ads.landingUrl)
    .orderBy(desc(sql`sum(${adInsightsDaily.spend})`))
    .limit(limit);

  return rows.map((r) => ({
    adId: Number(r.adId),
    adName: String(r.adName),
    thumbnailUrl: r.thumbnailUrl,
    landingUrl: r.landingUrl,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    spend: Number(r.spend),
    purchase: Number(r.purchase),
  }));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/queries/funnel.ts
git commit -m "feat(queries): getCreativeFunnel top N by spend"
```

---

### Task 5: Query funnel por página

**Files:**
- Modify: `lib/queries/funnel.ts`

- [ ] **Step 1: Adicionar getPageFunnel**

Adicionar no final:

```typescript
/* ─── 4. Por Página ─── */

export interface PageFunnelRow {
  landingUrl: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  landingPageView: number;
  initiateCheckout: number;
  purchase: number;
}

export async function getPageFunnel(
  slug: ProductSlug,
  range: DateRange,
): Promise<PageFunnelRow[]> {
  const product = getProduct(slug);
  const conds = [
    gte(adInsightsDaily.date, range.from),
    lte(adInsightsDaily.date, range.to),
    ...productScopeWhere(product),
  ];

  const rows = await db
    .select({
      landingUrl: ads.landingUrl,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions})::int, 0)`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks})::int, 0)`,
      spend: sql<number>`coalesce(sum(${adInsightsDaily.spend})::float, 0)`,
      lpv: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'landing_page_view')::int), 0)`,
      chkt: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'initiate_checkout')::int), 0)`,
      purchase: sql<number>`coalesce(sum((${adInsightsDaily.conversions}->>'purchase')::int), 0)`,
    })
    .from(adInsightsDaily)
    .innerJoin(ads, eq(ads.id, adInsightsDaily.adId))
    .innerJoin(adsets, eq(adsets.id, ads.adsetId))
    .innerJoin(campaigns, eq(campaigns.id, adsets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(...conds))
    .groupBy(ads.landingUrl)
    .orderBy(desc(sql`sum(${adInsightsDaily.spend})`));

  return rows.map((r) => ({
    landingUrl: r.landingUrl,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    spend: Number(r.spend),
    landingPageView: Number(r.lpv),
    initiateCheckout: Number(r.chkt),
    purchase: Number(r.purchase),
  }));
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/queries/funnel.ts
git commit -m "feat(queries): getPageFunnel grouped by landing_url"
```

---

### Task 6: Componente FunnelTableDaily

**Files:**
- Create: `components/dashboard/funnel-table-daily.tsx`

- [ ] **Step 1: Criar componente**

Conteúdo:

```typescript
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt, cpaTone } from "./format";
import type { DailyFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneClass(tone: ReturnType<typeof cpaTone>): string {
  switch (tone) {
    case "good":
      return "text-emerald-400 font-medium";
    case "bad":
      return "text-rose-400 font-medium";
    case "neutral":
      return "text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

export function FunnelTableDaily({ rows }: { rows: DailyFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem dados de tráfego no período.
      </p>
    );
  }

  // Total
  const tot = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + r.spend,
      lpv: acc.lpv + r.landingPageView,
      chkt: acc.chkt + r.initiateCheckout,
      purchase: acc.purchase + r.purchase,
    }),
    { impressions: 0, clicks: 0, spend: 0, lpv: 0, chkt: 0, purchase: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">CPM</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Conn. Rate</TableHead>
            <TableHead className="text-right">PageViews</TableHead>
            <TableHead className="text-right">Checkout</TableHead>
            <TableHead className="text-right">CPA CHKT</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">LP→CHKT</TableHead>
            <TableHead className="text-right">CHKT→Compra</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const cpaChkt = r.initiateCheckout > 0 ? r.spend / r.initiateCheckout : NaN;
            const tone = cpaTone(cpa, r.spend);
            return (
              <TableRow key={r.date}>
                <TableCell className="tabular-nums text-sm font-medium">
                  {fmt.shortDate(r.date)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.money(ratio(r.spend, r.impressions) * 10)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.clicks, r.impressions))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.clicks > 0 ? fmt.money(r.spend / r.clicks) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.landingPageView, r.clicks))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.landingPageView)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.initiateCheckout)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {isFinite(cpaChkt) ? fmt.money(cpaChkt) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.purchase)}</TableCell>
                <TableCell className={`text-right tabular-nums ${toneClass(tone)}`}>
                  {isFinite(cpa) ? fmt.money(cpa) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.money(r.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.initiateCheckout, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.purchase, r.initiateCheckout))}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 font-medium bg-muted/20">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.impressions)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.money(ratio(tot.spend, tot.impressions) * 10)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.clicks, tot.impressions))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.clicks)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.clicks > 0 ? fmt.money(tot.spend / tot.clicks) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.lpv, tot.clicks))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.lpv)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.chkt)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.chkt > 0 ? fmt.money(tot.spend / tot.chkt) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.purchase)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.purchase > 0 ? fmt.money(tot.spend / tot.purchase) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.money(tot.spend)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.chkt, tot.lpv))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.purchase, tot.chkt))}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
```

Nota sobre CPM: `(spend / impressions) × 1000` é o mesmo que `ratio(spend, impressions) × 10` (já que `ratio` retorna ×100). Mais legível usar a multiplicação direta — vou ajustar pra `(r.spend / r.impressions) * 1000` se houver.

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/dashboard/funnel-table-daily.tsx
git commit -m "feat(dashboard): FunnelTableDaily component"
```

---

### Task 7: Componente FunnelTableCampaign

**Files:**
- Create: `components/dashboard/funnel-table-campaign.tsx`

- [ ] **Step 1: Criar componente**

```typescript
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt, cpaTone } from "./format";
import type { CampaignFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneClass(tone: ReturnType<typeof cpaTone>): string {
  if (tone === "good") return "text-emerald-400 font-medium";
  if (tone === "bad") return "text-rose-400 font-medium";
  if (tone === "neutral") return "text-amber-400";
  return "text-muted-foreground";
}

export function FunnelTableCampaign({ rows }: { rows: CampaignFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem campanhas com dados no período.
      </p>
    );
  }

  const tot = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + r.spend,
      reach: acc.reach + r.reach,
      lpv: acc.lpv + r.landingPageView,
      chkt: acc.chkt + r.initiateCheckout,
      purchase: acc.purchase + r.purchase,
    }),
    { impressions: 0, clicks: 0, spend: 0, reach: 0, lpv: 0, chkt: 0, purchase: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campanha</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">CPM</TableHead>
            <TableHead className="text-right">Freq.</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Conn. Rate</TableHead>
            <TableHead className="text-right">PageView</TableHead>
            <TableHead className="text-right">CHKT</TableHead>
            <TableHead className="text-right">CPA CHKT</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">LP→CHKT</TableHead>
            <TableHead className="text-right">CHKT→Compra</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const cpaChkt = r.initiateCheckout > 0 ? r.spend / r.initiateCheckout : NaN;
            const freq = r.reach > 0 ? r.impressions / r.reach : 0;
            return (
              <TableRow key={r.campaignId}>
                <TableCell className="font-medium max-w-[300px] truncate" title={r.campaignName}>
                  {r.campaignName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.impressions > 0 ? fmt.money((r.spend / r.impressions) * 1000) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {freq > 0 ? fmt.ratio(freq) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.clicks, r.impressions))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.clicks > 0 ? fmt.money(r.spend / r.clicks) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.landingPageView, r.clicks))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.landingPageView)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.initiateCheckout)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {isFinite(cpaChkt) ? fmt.money(cpaChkt) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.purchase)}</TableCell>
                <TableCell className={`text-right tabular-nums ${toneClass(cpaTone(cpa, r.spend))}`}>
                  {isFinite(cpa) ? fmt.money(cpa) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.initiateCheckout, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.purchase, r.initiateCheckout))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.money(r.spend)}</TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 font-medium bg-muted/20">
            <TableCell>Total ({rows.length})</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.impressions)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.impressions > 0 ? fmt.money((tot.spend / tot.impressions) * 1000) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">—</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.clicks, tot.impressions))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.clicks)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.clicks > 0 ? fmt.money(tot.spend / tot.clicks) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.lpv, tot.clicks))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.lpv)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.chkt)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.chkt > 0 ? fmt.money(tot.spend / tot.chkt) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.purchase)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.purchase > 0 ? fmt.money(tot.spend / tot.purchase) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.chkt, tot.lpv))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.purchase, tot.chkt))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.money(tot.spend)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/dashboard/funnel-table-campaign.tsx
git commit -m "feat(dashboard): FunnelTableCampaign component"
```

---

### Task 8: Componente FunnelTableCreative

**Files:**
- Create: `components/dashboard/funnel-table-creative.tsx`

- [ ] **Step 1: Criar componente**

```typescript
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt, cpaTone } from "./format";
import type { CreativeFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneClass(tone: ReturnType<typeof cpaTone>): string {
  if (tone === "good") return "text-emerald-400 font-medium";
  if (tone === "bad") return "text-rose-400 font-medium";
  if (tone === "neutral") return "text-amber-400";
  return "text-muted-foreground";
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  }
}

export function FunnelTableCreative({ rows, basePath }: { rows: CreativeFunnelRow[]; basePath: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem criativos com dados no período.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Thumb</TableHead>
            <TableHead>Anúncio</TableHead>
            <TableHead>Link LP</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">TxConv AD</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const tone = cpaTone(cpa, r.spend);
            const adHref = `${basePath}/${r.adId}`;
            return (
              <TableRow key={r.adId}>
                <TableCell className="w-[60px]">
                  <Link href={adHref}>
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnailUrl}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted" />
                    )}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[200px] truncate font-medium" title={r.adName}>
                  <Link href={adHref} className="hover:underline">
                    {r.adName}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[240px]">
                  {r.landingUrl ? (
                    <a
                      href={r.landingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                      title={r.landingUrl}
                    >
                      <span className="truncate max-w-[200px]">{shortenUrl(r.landingUrl)}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.clicks, r.impressions))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.clicks > 0 ? fmt.money(r.spend / r.clicks) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.purchase)}</TableCell>
                <TableCell className={`text-right tabular-nums ${toneClass(tone)}`}>
                  {isFinite(cpa) ? fmt.money(cpa) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.money(r.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.purchase, r.clicks))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/dashboard/funnel-table-creative.tsx
git commit -m "feat(dashboard): FunnelTableCreative with thumbs and LP links"
```

---

### Task 9: Componente FunnelTablePage

**Files:**
- Create: `components/dashboard/funnel-table-page.tsx`

- [ ] **Step 1: Criar componente**

```typescript
import { ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt, cpaTone } from "./format";
import type { PageFunnelRow } from "@/lib/queries/funnel";

function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function toneClass(tone: ReturnType<typeof cpaTone>): string {
  if (tone === "good") return "text-emerald-400 font-medium";
  if (tone === "bad") return "text-rose-400 font-medium";
  if (tone === "neutral") return "text-amber-400";
  return "text-muted-foreground";
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40 ? u.pathname.slice(0, 40) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url.length > 50 ? url.slice(0, 50) + "…" : url;
  }
}

export function FunnelTablePage({ rows }: { rows: PageFunnelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem páginas de destino com dados no período.
      </p>
    );
  }

  const tot = rows.reduce(
    (acc, r) => ({
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + r.spend,
      lpv: acc.lpv + r.landingPageView,
      chkt: acc.chkt + r.initiateCheckout,
      purchase: acc.purchase + r.purchase,
    }),
    { clicks: 0, spend: 0, lpv: 0, chkt: 0, purchase: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Página</TableHead>
            <TableHead className="text-right">Cliques</TableHead>
            <TableHead className="text-right">Conn. Rate</TableHead>
            <TableHead className="text-right">PageView</TableHead>
            <TableHead className="text-right">LP→CHKT</TableHead>
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Gasto</TableHead>
            <TableHead className="text-right">LP→Compra</TableHead>
            <TableHead className="text-right">CHKT→Compra</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => {
            const cpa = r.purchase > 0 ? r.spend / r.purchase : NaN;
            const tone = cpaTone(cpa, r.spend);
            return (
              <TableRow key={r.landingUrl ?? `null-${idx}`}>
                <TableCell className="max-w-[320px]">
                  {r.landingUrl ? (
                    <a
                      href={r.landingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                      title={r.landingUrl}
                    >
                      <span className="truncate max-w-[280px]">{shortenUrl(r.landingUrl)}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">Sem URL</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.landingPageView, r.clicks))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.landingPageView)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.initiateCheckout, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.int(r.purchase)}</TableCell>
                <TableCell className={`text-right tabular-nums ${toneClass(tone)}`}>
                  {isFinite(cpa) ? fmt.money(cpa) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt.money(r.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.purchase, r.landingPageView))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt.pct1(ratio(r.purchase, r.initiateCheckout))}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 font-medium bg-muted/20">
            <TableCell>Total ({rows.length})</TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.clicks)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.lpv, tot.clicks))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.lpv)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.chkt, tot.lpv))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.int(tot.purchase)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {tot.purchase > 0 ? fmt.money(tot.spend / tot.purchase) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt.money(tot.spend)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.purchase, tot.lpv))}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmt.pct1(ratio(tot.purchase, tot.chkt))}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/dashboard/funnel-table-page.tsx
git commit -m "feat(dashboard): FunnelTablePage grouped by landing URL"
```

---

### Task 10: Integrar no /guia

**Files:**
- Modify: `app/(dashboard)/guia/page.tsx`

- [ ] **Step 1: Adicionar imports e chamadas de query em paralelo**

No topo do arquivo, depois dos imports existentes, adicionar:

```typescript
import {
  getCampaignFunnel,
  getCreativeFunnel,
  getDailyFunnel,
  getPageFunnel,
} from "@/lib/queries/funnel";
import { FunnelTableDaily } from "@/components/dashboard/funnel-table-daily";
import { FunnelTableCampaign } from "@/components/dashboard/funnel-table-campaign";
import { FunnelTableCreative } from "@/components/dashboard/funnel-table-creative";
import { FunnelTablePage } from "@/components/dashboard/funnel-table-page";
```

No bloco `Promise.all([...])`, adicionar 4 chamadas:

```typescript
    getDailyFunnel("guia", currentRange),
    getCampaignFunnel("guia", currentRange),
    getCreativeFunnel("guia", currentRange, 50),
    getPageFunnel("guia", currentRange),
```

E desestruturar do array:

```typescript
    dailyFunnel, campaignFunnel, creativeFunnel, pageFunnel,
```

- [ ] **Step 2: Renderizar os 4 cards após "Compradores do período"**

Logo depois do `<Card>` de "Compradores do período · {buyers.length}", adicionar:

```typescript
      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Detalhamento diário do funil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelTableDaily rows={dailyFunnel} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Detalhamento por campanha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelTableCampaign rows={campaignFunnel} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Detalhamento por criativo · top 50 por gasto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelTableCreative rows={creativeFunnel} basePath="/guia/criativo" />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Detalhamento por página de destino
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelTablePage rows={pageFunnel} />
        </CardContent>
      </Card>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS, sem warnings.

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/guia/page.tsx
git commit -m "feat(guia): integrate 4 funnel detail tables"
```

---

### Task 11: Smoke check final

- [ ] `npm run test` — 80+ tests passam
- [ ] `npm run lint` — sem novos warnings
- [ ] `npm run build` — passa
- [ ] Inspecionar `/guia` localmente (Bruno faz)
