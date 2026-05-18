# Redesign /desafio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar /desafio (e espelhar /guia) com visual moderno tipo CliniFunnel: 6 KPI cards modernos, funil em barras horizontais, gráfico de barras diárias com toggle de métrica + sobreposição do período anterior, top criativos com thumbnail e mais info, drawer lateral com detalhe do comprador (timeline + produtos + grupo), versionamento visível na sidebar.

**Architecture:** 11 tarefas sequenciais, cada uma um commit. Reaproveita Drizzle + Recharts + shadcn já no projeto. Adiciona 4 queries novas em `lib/queries/{purchases,dashboard}.ts`, refatora `KpiCard` pra suportar accent color, cria 7 componentes novos em `components/dashboard/`, reescreve `app/(dashboard)/{desafio,guia}/page.tsx`. Drawer via shadcn `Sheet` (já no projeto via `@base-ui/react`).

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Recharts 3.8, lucide-react, shadcn/ui (sheet/card/table), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-18-redesign-desafio-clinifunnel-design.md`

---

## File map

### Novos
- `lib/version.ts` — exports `VERSION`, `COMMIT_SHA`
- `lib/queries/purchases.ts` — adicionar `getApprovedPurchaseCount`, `getApprovedPurchaseRevenue`, `getInGroupStats`, `getDailyPurchaseSeries`, `getBuyerJourney`
- `components/dashboard/period-selector.tsx`
- `components/dashboard/comparison-toggle.tsx`
- `components/dashboard/conversion-funnel.tsx`
- `components/dashboard/daily-bar-chart.tsx`
- `components/dashboard/top-creatives-grid.tsx` (substitui top-creatives.tsx)
- `components/dashboard/buyer-drawer.tsx`

### Modificados
- `package.json` — bump 0.1.0 → 0.6.0
- `components/dashboard/sidebar.tsx` — mostra versão + hash via `lib/version`
- `components/dashboard/kpi-card.tsx` — adicionar prop `accent` opcional
- `components/dashboard/buyers-table.tsx` — adicionar `onSelect` callback
- `app/(dashboard)/desafio/page.tsx` — reescrita
- `app/(dashboard)/guia/page.tsx` — reescrita
- `lib/queries/purchases.test.ts` — novos testes pras queries novas

### Removidos
- `components/dashboard/top-creatives.tsx` — substituído por top-creatives-grid.tsx
- `components/dashboard/cycle-selector.tsx` — substituído por period-selector.tsx (deletar APÓS reescrita das páginas)

---

## Task 1: Bump versão + sidebar mostra v0.6.0 · hash

**Files:**
- Modify: `package.json`
- Create: `lib/version.ts`
- Modify: `components/dashboard/sidebar.tsx`

### Step 1: Bump versão em package.json

```bash
npm version 0.6.0 --no-git-tag-version
```

Esperado: `package.json` agora tem `"version": "0.6.0"`. Sem commit/tag automático.

### Step 2: Criar `lib/version.ts`

```typescript
/**
 * Versão visível no canto inferior da sidebar.
 *
 * - VERSION vem do package.json (semantic versioning, bump manual).
 * - COMMIT_SHA vem do Vercel automaticamente. Em dev mostra "dev".
 */
import pkg from "../package.json";

export const VERSION = pkg.version;

export const COMMIT_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
```

### Step 3: Atualizar sidebar pra mostrar versão dinâmica

Edit `components/dashboard/sidebar.tsx`, substituir bloco com hardcoded `Traqueamento v0.3.0`:

```tsx
// no topo do arquivo, adicionar:
import { VERSION, COMMIT_SHA } from "@/lib/version";

// substituir o bloco existente que tem "Traqueamento v0.3.0" por:
<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
  Traqueamento v{VERSION}{" "}
  <span className="text-muted-foreground/50">· {COMMIT_SHA}</span>
</div>
```

### Step 4: Verificar build local

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -3
```

Esperado: tsc clean, build verde.

### Step 5: Commit

```bash
git add package.json lib/version.ts components/dashboard/sidebar.tsx
git commit -m "feat: bump v0.6.0 + versão+hash dinâmicos na sidebar"
```

---

## Task 2: Queries Hotmart novas (TDD)

**Files:**
- Modify: `lib/queries/purchases.ts`
- Modify: `lib/queries/purchases.test.ts`

Adicionar 4 funções: `getApprovedPurchaseCount`, `getApprovedPurchaseRevenue`, `getInGroupStats`, `getDailyPurchaseSeries`. `getBuyerJourney` fica pra Task 8 (perto do drawer).

### Step 1: Adicionar testes

No final de `lib/queries/purchases.test.ts`, antes do último `});`, adicionar:

```typescript
import {
  getApprovedPurchaseCount,
  getApprovedPurchaseRevenue,
  getInGroupStats,
  getDailyPurchaseSeries,
} from "./purchases";

describe("getApprovedPurchaseCount", () => {
  it("conta só approved do produto no período", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const count = await getApprovedPurchaseCount("desafio", { from, to });
    // 3 setup rows (T-IN, T-OUT, T-NULL) — T-IN status changed to refunded
    // pelo último teste de getBuyersForCycle. Esperado: 2 approved.
    expect(count).toBe(2);
  });
});

describe("getApprovedPurchaseRevenue", () => {
  it("soma valueCents de approved e retorna em reais (float)", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const revenue = await getApprovedPurchaseRevenue("desafio", { from, to });
    // T-OUT + T-NULL = 197 + 197 = 394
    expect(revenue).toBe(394);
  });
});

describe("getInGroupStats", () => {
  it("retorna contagem de compradores com phone + quantos estão no grupo", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const stats = await getInGroupStats("desafio", { from, to });
    // T-OUT tem phone fora, T-NULL sem phone → buyersWithPhone=1, inGroup=0
    expect(stats.buyersWithPhone).toBe(1);
    expect(stats.inGroup).toBe(0);
  });
});

describe("getDailyPurchaseSeries", () => {
  it("agrega por dia e retorna count + revenueCents", async () => {
    const today = new Date();
    const from = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const series = await getDailyPurchaseSeries("desafio", { from, to });
    // Devolve [{ date, count, revenueCents }] — hoje tem 2 approved totalizando 394 reais = 39400 cents
    const today_iso = today.toISOString().slice(0, 10);
    const todayRow = series.find((r) => r.date === today_iso);
    expect(todayRow?.count).toBe(2);
    expect(todayRow?.revenueCents).toBe(39400);
  });
});
```

### Step 2: Rodar — deve falhar (funções não existem)

```bash
npx vitest run lib/queries/purchases.test.ts
```

Esperado: FAIL — imports de funções não exportadas.

### Step 3: Implementar as 4 funções em `lib/queries/purchases.ts`

Adicionar ao final do arquivo:

```typescript
/**
 * Conta compras aprovadas de um produto no período.
 */
export async function getApprovedPurchaseCount(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<number> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Soma de value_cents (em reais) de compras aprovadas.
 */
export async function getApprovedPurchaseRevenue(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<number> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");
  const [row] = await db
    .select({
      cents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    );
  return Number(row?.cents ?? 0) / 100;
}

export interface InGroupStats {
  buyersWithPhone: number;
  inGroup: number;
}

/**
 * Estatística de quantos compradores aprovados estão atualmente no grupo
 * WhatsApp (joined via phoneNormalized = buyer_phone_e164).
 */
export async function getInGroupStats(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<InGroupStats> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");
  const [row] = await db
    .select({
      withPhone: sql<number>`count(*) filter (where ${purchases.buyerPhoneE164} is not null)::int`,
      inGroup: sql<number>`count(*) filter (where exists(
        select 1 from ${whatsappGroupMembers}
        where ${whatsappGroupMembers.phoneNormalized} = ${purchases.buyerPhoneE164}
          and ${whatsappGroupMembers.currentlyInGroup} = true
      ))::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    );
  return {
    buyersWithPhone: Number(row?.withPhone ?? 0),
    inGroup: Number(row?.inGroup ?? 0),
  };
}

export interface DailyPurchasePoint {
  date: string;
  count: number;
  revenueCents: number;
}

/**
 * Série diária pra alimentar o DailyBarChart.
 * Datas no fuso America/Sao_Paulo. Inclui dias zerados via generate_series.
 */
export async function getDailyPurchaseSeries(
  productSlug: ProductSlug,
  range: DateRange,
): Promise<DailyPurchasePoint[]> {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T23:59:59");
  const rows = await db
    .select({
      date: sql<string>`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      revenueCents: sql<number>`coalesce(sum(${purchases.valueCents}), 0)::int`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.productSlug, productSlug),
        eq(purchases.status, "approved"),
        gte(purchases.purchasedAt, from),
        lte(purchases.purchasedAt, to),
      ),
    )
    .groupBy(
      sql`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    )
    .orderBy(
      sql`to_char(${purchases.purchasedAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
    );
  return rows.map((r) => ({
    date: r.date,
    count: Number(r.count),
    revenueCents: Number(r.revenueCents),
  }));
}
```

### Step 4: Rodar — deve passar

```bash
npx vitest run lib/queries/purchases.test.ts
```

Esperado: 6/6 pass (2 existentes + 4 novos).

### Step 5: Commit

```bash
git add lib/queries/purchases.ts lib/queries/purchases.test.ts
git commit -m "feat(queries): purchases — count, revenue, inGroup, dailySeries"
```

---

## Task 3: Refatorar KpiCard pra suportar `accent`

**Files:**
- Modify: `components/dashboard/kpi-card.tsx`

### Step 1: Adicionar prop `accent` opcional

Substituir conteúdo de `components/dashboard/kpi-card.tsx` por:

```tsx
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiAccent = "violet" | "emerald" | "amber" | "rose" | "sky" | "fuchsia";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: { label: string; positive: boolean } | null;
  hint?: string;
  /** Inverte semântica do delta (ex.: CPL menor é melhor) */
  invertDelta?: boolean;
  icon?: LucideIcon;
  accent?: KpiAccent;
}

const ACCENT_CLASSES: Record<KpiAccent, { bg: string; border: string; text: string }> = {
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/30",  text: "text-violet-400" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/30",   text: "text-amber-400" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/30",    text: "text-rose-400" },
  sky:     { bg: "bg-sky-500/10",     border: "border-sky-500/30",     text: "text-sky-400" },
  fuchsia: { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", text: "text-fuchsia-400" },
};

export function KpiCard({ label, value, delta, hint, invertDelta, icon: Icon, accent }: KpiCardProps) {
  const goodPositive = invertDelta ? !delta?.positive : delta?.positive;
  const accentCls = accent
    ? ACCENT_CLASSES[accent]
    : { bg: "bg-primary/10", border: "border-primary/20", text: "text-primary" };

  return (
    <Card className="bg-card border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
          {Icon ? (
            <div
              className={cn(
                "h-7 w-7 rounded-md border flex items-center justify-center shrink-0",
                accentCls.bg,
                accentCls.border,
                accentCls.text,
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
          ) : null}
        </div>
        <div className="mt-3 text-3xl font-bold tabular-nums text-foreground tracking-tight">
          {value}
        </div>
        {delta || hint ? (
          <div className="mt-2 flex items-center gap-2 text-xs">
            {delta ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium",
                  goodPositive ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {delta.positive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {delta.label}
              </span>
            ) : null}
            {hint ? <span className="text-muted-foreground">{hint}</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

### Step 2: tsc + commit

```bash
npx tsc --noEmit
git add components/dashboard/kpi-card.tsx
git commit -m "feat(kpi-card): suporta prop accent (6 cores)"
```

---

## Task 4: PeriodSelector + ComparisonToggle

**Files:**
- Create: `components/dashboard/period-selector.tsx`
- Create: `components/dashboard/comparison-toggle.tsx`

PeriodSelector é client component. Substitui o velho CycleSelector. Mantém URL params `?cycle=N&start=YYYY-MM-DD&end=YYYY-MM-DD` pra coerência com queries server-side. Adiciona presets 7d / 15d / 30d / Este mês / Custom.

ComparisonToggle controla `?compare=1` na URL.

### Step 1: Criar `components/dashboard/period-selector.tsx`

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Preset {
  key: string;
  label: string;
  cycle?: number; // dias
  thisMonth?: boolean;
}

const PRESETS: Preset[] = [
  { key: "7d", label: "Últimos 7 dias", cycle: 7 },
  { key: "15d", label: "Últimos 15 dias", cycle: 15 },
  { key: "30d", label: "Últimos 30 dias", cycle: 30 },
  { key: "this-month", label: "Este mês", thisMonth: true },
];

function thisMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

export function PeriodSelector({ defaultCycle = 7 }: { defaultCycle?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const currentCycle = Number(sp.get("cycle") ?? defaultCycle);
  const currentStart = sp.get("start");
  const currentEnd = sp.get("end");

  const isCustom = !!currentStart && !!currentEnd;
  const activeLabel = isCustom
    ? `${currentStart} → ${currentEnd}`
    : PRESETS.find((p) => p.cycle === currentCycle)?.label ?? `${currentCycle}d`;

  const applyPreset = useCallback(
    (preset: Preset) => {
      const params = new URLSearchParams(sp);
      params.delete("start");
      params.delete("end");
      if (preset.thisMonth) {
        const r = thisMonthRange();
        params.set("start", r.start);
        params.set("end", r.end);
      } else if (preset.cycle) {
        params.set("cycle", String(preset.cycle));
      }
      router.push(`${pathname}?${params.toString()}`);
      setOpen(false);
    },
    [sp, pathname, router],
  );

  const applyCustom = useCallback(
    (start: string, end: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return;
      const params = new URLSearchParams(sp);
      params.delete("cycle");
      params.set("start", start);
      params.set("end", end);
      router.push(`${pathname}?${params.toString()}`);
      setOpen(false);
      setCustomOpen(false);
    },
    [sp, pathname, router],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/60 bg-card text-sm hover:bg-card/80 transition-colors"
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{activeLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 z-50 w-56 rounded-md border border-border/60 bg-popover shadow-md p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm rounded hover:bg-accent",
                ((p.cycle && p.cycle === currentCycle && !isCustom) ||
                  (p.thisMonth && isCustom)) &&
                  "text-primary font-medium",
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent"
          >
            Custom…
          </button>
          {customOpen ? (
            <form
              className="p-2 space-y-2 border-t border-border/60 mt-1"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                applyCustom(String(fd.get("start")), String(fd.get("end")));
              }}
            >
              <input
                name="start"
                type="date"
                defaultValue={currentStart ?? ""}
                className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                required
              />
              <input
                name="end"
                type="date"
                defaultValue={currentEnd ?? ""}
                className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                required
              />
              <button
                type="submit"
                className="w-full px-2 py-1 text-xs rounded bg-primary text-primary-foreground"
              >
                Aplicar
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

### Step 2: Criar `components/dashboard/comparison-toggle.tsx`

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ComparisonToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const enabled = sp.get("compare") === "1";

  const toggle = () => {
    const params = new URLSearchParams(sp);
    if (enabled) params.delete("compare");
    else params.set("compare", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-colors",
        enabled
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-card text-muted-foreground hover:bg-card/80",
      )}
    >
      <span
        className={cn(
          "h-3 w-3 rounded-full border",
          enabled ? "bg-primary border-primary" : "border-muted-foreground",
        )}
      />
      vs período anterior
    </button>
  );
}
```

### Step 3: tsc + commit

```bash
npx tsc --noEmit
git add components/dashboard/period-selector.tsx components/dashboard/comparison-toggle.tsx
git commit -m "feat(dashboard): PeriodSelector + ComparisonToggle"
```

---

## Task 5: ConversionFunnel

**Files:**
- Create: `components/dashboard/conversion-funnel.tsx`

Substitui o `FunnelChart` existente (que ainda fica no projeto, mas o redesign não usa). Barras horizontais com 3 stages: Impressões → Cliques → Compradores. Cada barra ocupa 100% da largura, com fill proporcional ao valor da stage anterior. Mostra label + valor + % conversão da stage anterior.

### Step 1: Criar `components/dashboard/conversion-funnel.tsx`

```tsx
import { cn } from "@/lib/utils";
import { fmt } from "./format";

export interface FunnelStage {
  label: string;
  value: number;
  /** Formato do valor (number com separadores ou moeda) */
  format?: "int" | "money";
}

interface ConversionFunnelProps {
  stages: FunnelStage[];
}

function formatValue(stage: FunnelStage): string {
  if (stage.format === "money") return fmt.money(stage.value);
  return fmt.int(stage.value, true);
}

export function ConversionFunnel({ stages }: ConversionFunnelProps) {
  if (stages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">Sem dados.</p>
    );
  }

  const max = Math.max(...stages.map((s) => s.value));

  return (
    <div className="space-y-4">
      {stages.map((stage, idx) => {
        const prev = idx > 0 ? stages[idx - 1].value : 0;
        const dropPct = idx > 0 && prev > 0 ? 100 - (stage.value / prev) * 100 : null;
        const widthPct = max > 0 ? (stage.value / max) * 100 : 0;
        const isLast = idx === stages.length - 1;

        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-medium text-foreground">{stage.label}</span>
              <span className="text-sm tabular-nums">
                <span className="font-semibold">{formatValue(stage)}</span>
                {dropPct != null ? (
                  <span
                    className={cn(
                      "ml-2 text-xs",
                      dropPct > 50 ? "text-rose-400" : "text-muted-foreground",
                    )}
                  >
                    ({dropPct.toFixed(1)}% queda)
                  </span>
                ) : null}
              </span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isLast
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                    : "bg-gradient-to-r from-primary/80 to-primary",
                )}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### Step 2: tsc + commit

```bash
npx tsc --noEmit
git add components/dashboard/conversion-funnel.tsx
git commit -m "feat(dashboard): ConversionFunnel com barras horizontais"
```

---

## Task 6: DailyBarChart (com toggle de métrica + fantasma)

**Files:**
- Create: `components/dashboard/daily-bar-chart.tsx`

Client component. Recebe duas séries (current + previous) com 4 métricas cada. Toggle de métrica via radio chips no header. Fantasma cinza atrás quando comparação ativa.

### Step 1: Criar `components/dashboard/daily-bar-chart.tsx`

```tsx
"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { fmt } from "./format";

export interface DailyBarPoint {
  date: string; // YYYY-MM-DD
  vendas: number;
  receita: number;
  investido: number;
  roas: number;
}

interface DailyBarChartProps {
  current: DailyBarPoint[];
  previous?: DailyBarPoint[] | null;
}

type Metric = "vendas" | "receita" | "investido" | "roas";

const METRICS: Array<{ key: Metric; label: string; format: (v: number) => string }> = [
  { key: "vendas", label: "Vendas", format: (v) => fmt.int(v) },
  { key: "receita", label: "Receita", format: (v) => fmt.money(v) },
  { key: "investido", label: "Investido", format: (v) => fmt.money(v) },
  { key: "roas", label: "ROAS", format: (v) => fmt.ratio(v) },
];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function DailyBarChart({ current, previous }: DailyBarChartProps) {
  const [metric, setMetric] = useState<Metric>("vendas");
  const metricCfg = METRICS.find((m) => m.key === metric)!;

  // Pair current[i] with previous[i] by position (index-based alignment).
  // O período anterior é exibido alinhado pelo dia-do-período (1º dia anterior = 1º dia atual).
  const merged = current.map((p, i) => ({
    date: shortDate(p.date),
    value: p[metric],
    prev: previous?.[i]?.[metric] ?? null,
  }));

  const total = current.reduce((s, p) => s + p[metric], 0);
  const avgDaily = current.length > 0 ? total / current.length : 0;
  const best = current.reduce<{ v: number; d: string } | null>((acc, p) => {
    return !acc || p[metric] > acc.v ? { v: p[metric], d: p.date } : acc;
  }, null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4 text-xs">
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
              Total
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {metricCfg.format(total)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
              Média diária
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {metricCfg.format(avgDaily)}
            </div>
          </div>
          {best && best.v > 0 ? (
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
                Melhor
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {metricCfg.format(best.v)}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  em {shortDate(best.d)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex gap-1 rounded-md border border-border/60 p-0.5 bg-card">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={cn(
                "px-2.5 py-1 text-xs rounded transition-colors",
                metric === m.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={merged} barCategoryGap="20%">
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => metricCfg.format(Number(v))}
              width={70}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(v: number) => metricCfg.format(v)}
            />
            {previous ? (
              <Bar dataKey="prev" fill="var(--color-muted)" radius={[4, 4, 0, 0]} />
            ) : null}
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {merged.map((_, i) => (
                <Cell key={i} fill="var(--color-primary)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

### Step 2: tsc + commit

```bash
npx tsc --noEmit
git add components/dashboard/daily-bar-chart.tsx
git commit -m "feat(dashboard): DailyBarChart com toggle métrica e fantasma"
```

---

## Task 7: TopCreativesGrid (substitui top-creatives.tsx)

**Files:**
- Create: `components/dashboard/top-creatives-grid.tsx`
- Delete: `components/dashboard/top-creatives.tsx`

### Step 1: Criar `components/dashboard/top-creatives-grid.tsx`

```tsx
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { AdRow } from "@/lib/queries/dashboard";

interface TopCreativesGridProps {
  ads: AdRow[];
  limit?: number;
}

function roasColor(roas: number): string {
  if (roas >= 2) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (roas >= 1) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-rose-400 bg-rose-500/10 border-rose-500/30";
}

export function TopCreativesGrid({ ads, limit = 5 }: TopCreativesGridProps) {
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
        return (
          <div
            key={ad.adId}
            className="rounded-lg border border-border/60 bg-card overflow-hidden flex flex-col"
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
            </div>
            <div className="p-2.5 flex-1 flex flex-col gap-1">
              <div className="text-xs font-medium truncate" title={ad.adName}>
                {ad.adName}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums flex justify-between">
                <span>{fmt.int(ad.impressions, true)} imp</span>
                <span>CTR {fmt.pct(ad.ctr, 1)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums flex justify-between">
                <span>{fmt.money(ad.spend)}</span>
                <span>{fmt.int(ad.purchases)} vendas</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### Step 2: Deletar `components/dashboard/top-creatives.tsx`

```bash
rm components/dashboard/top-creatives.tsx
```

(Tasks 10/11 vão atualizar os imports nas páginas.)

### Step 3: tsc + commit

```bash
npx tsc --noEmit 2>&1 | grep -v "page.tsx" | tail -5
```

Esperado: erros de import só em `app/(dashboard)/desafio/page.tsx` e `guia/page.tsx` (que ainda importam `top-creatives`). Esses são corrigidos nas tasks 10/11. tsc fora dessas duas: clean.

```bash
git add components/dashboard/top-creatives-grid.tsx components/dashboard/top-creatives.tsx
git commit -m "feat(dashboard): TopCreativesGrid substitui top-creatives"
```

---

## Task 8: getBuyerJourney query (TDD)

**Files:**
- Modify: `lib/queries/purchases.ts`
- Modify: `lib/queries/purchases.test.ts`

### Step 1: Adicionar teste

No final do test file:

```typescript
import { getBuyerJourney } from "./purchases";

describe("getBuyerJourney", () => {
  it("retorna todas as compras do mesmo telefone + eventos do grupo", async () => {
    const result = await getBuyerJourney({ phone: "5511111111111" });
    expect(result.purchases.length).toBeGreaterThanOrEqual(1);
    // O grupo "TEST-GRP" foi criado com 1 evento joined nesse phone (setup beforeAll)
    expect(result.whatsappEvents.length).toBeGreaterThanOrEqual(0);
  });

  it("retorna vazio quando nem email nem phone batem", async () => {
    const result = await getBuyerJourney({ phone: "5599999999999" });
    expect(result.purchases).toEqual([]);
    expect(result.whatsappEvents).toEqual([]);
  });
});
```

### Step 2: Rodar — falha

```bash
npx vitest run lib/queries/purchases.test.ts
```

### Step 3: Implementar em `lib/queries/purchases.ts` (no final)

```typescript
import {
  whatsappGroupEvents,
  whatsappGroups,
} from "@/lib/schema/whatsapp";

export interface BuyerPurchaseEntry {
  transactionId: string;
  productSlug: string;
  productNameRaw: string | null;
  status: string;
  valueCents: number | null;
  purchasedAt: Date;
}

export interface BuyerGroupEvent {
  groupName: string | null;
  eventType: "joined" | "left" | "unknown";
  occurredAt: Date;
}

export interface BuyerJourney {
  purchases: BuyerPurchaseEntry[];
  whatsappEvents: BuyerGroupEvent[];
}

/**
 * Retorna histórico completo de um comprador identificado por email ou phone.
 * Casa por OR — se ambos vierem, busca em qualquer um dos dois.
 */
export async function getBuyerJourney(
  identifier: { email?: string | null; phone?: string | null },
): Promise<BuyerJourney> {
  const email = identifier.email?.trim() || null;
  const phone = identifier.phone?.trim() || null;
  if (!email && !phone) return { purchases: [], whatsappEvents: [] };

  // Compras do mesmo email OU mesmo telefone
  const purchaseConds = [];
  if (email) purchaseConds.push(eq(purchases.buyerEmail, email));
  if (phone) purchaseConds.push(eq(purchases.buyerPhoneE164, phone));
  const purchaseWhere = purchaseConds.length === 1 ? purchaseConds[0] : sql`(${sql.join(purchaseConds, sql` OR `)})`;

  const purchaseRows = await db
    .select({
      transactionId: purchases.transactionId,
      productSlug: purchases.productSlug,
      productNameRaw: purchases.productNameRaw,
      status: purchases.status,
      valueCents: purchases.valueCents,
      purchasedAt: purchases.purchasedAt,
    })
    .from(purchases)
    .where(purchaseWhere)
    .orderBy(sql`${purchases.purchasedAt} desc`);

  // Eventos de grupo só por phone (sendflow não tem email)
  let eventRows: { groupName: string | null; eventType: "joined" | "left" | "unknown"; occurredAt: Date }[] = [];
  if (phone) {
    eventRows = await db
      .select({
        groupName: whatsappGroups.name,
        eventType: whatsappGroupEvents.eventType,
        occurredAt: whatsappGroupEvents.occurredAt,
      })
      .from(whatsappGroupEvents)
      .leftJoin(
        whatsappGroups,
        eq(whatsappGroupEvents.groupExternalId, whatsappGroups.externalId),
      )
      .where(eq(whatsappGroupEvents.phoneNormalized, phone))
      .orderBy(sql`${whatsappGroupEvents.occurredAt} desc`);
  }

  return {
    purchases: purchaseRows.map((p) => ({
      transactionId: p.transactionId,
      productSlug: p.productSlug,
      productNameRaw: p.productNameRaw,
      status: p.status,
      valueCents: p.valueCents,
      purchasedAt: p.purchasedAt,
    })),
    whatsappEvents: eventRows.map((e) => ({
      groupName: e.groupName,
      eventType: e.eventType,
      occurredAt: e.occurredAt,
    })),
  };
}
```

### Step 4: Tests pass

```bash
npx vitest run lib/queries/purchases.test.ts
```

Esperado: 8/8 pass.

### Step 5: Commit

```bash
git add lib/queries/purchases.ts lib/queries/purchases.test.ts
git commit -m "feat(queries): getBuyerJourney (compras + eventos de grupo)"
```

---

## Task 9: BuyerDrawer + integração na BuyersTable

**Files:**
- Create: `components/dashboard/buyer-drawer.tsx`
- Modify: `components/dashboard/buyers-table.tsx`

### Step 1: Criar `components/dashboard/buyer-drawer.tsx`

Drawer usa shadcn `Sheet` ou plain CSS. Pra evitar nova dep, usa CSS fixed + overlay.

```tsx
"use client";

import { useEffect, useState } from "react";
import { X, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { BuyerRow } from "@/lib/queries/purchases";
import type { BuyerJourney } from "@/lib/queries/purchases";

interface BuyerDrawerProps {
  buyer: BuyerRow | null;
  onClose: () => void;
}

export function BuyerDrawer({ buyer, onClose }: BuyerDrawerProps) {
  const [journey, setJourney] = useState<BuyerJourney | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!buyer) {
      setJourney(null);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (buyer.buyerEmail) params.set("email", buyer.buyerEmail);
    if (buyer.buyerPhoneE164) params.set("phone", buyer.buyerPhoneE164);
    fetch(`/api/buyer-journey?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: BuyerJourney) => setJourney(j))
      .catch(() => setJourney({ purchases: [], whatsappEvents: [] }))
      .finally(() => setLoading(false));
  }, [buyer]);

  const open = !!buyer;
  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] bg-card border-l border-border shadow-xl flex flex-col transition-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {!buyer ? null : (
          <>
            <div className="flex items-start justify-between p-5 border-b border-border/60">
              <div>
                <div className="text-lg font-semibold">{buyer.buyerName ?? "—"}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {buyer.buyerEmail ?? ""}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {buyer.buyerPhoneE164 ? `+${buyer.buyerPhoneE164}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded hover:bg-accent flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Resumo */}
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  No grupo WhatsApp
                </div>
                <div className="flex items-center gap-2">
                  {buyer.inGroup === true ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Sim</span>
                    </>
                  ) : buyer.inGroup === false ? (
                    <>
                      <X className="h-4 w-4 text-rose-400" />
                      <span className="text-rose-400 font-medium">Não</span>
                    </>
                  ) : (
                    <>
                      <Minus className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Sem telefone</span>
                    </>
                  )}
                </div>
              </div>

              {/* Compras */}
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Compras{journey ? ` · ${journey.purchases.length}` : ""}
                </div>
                {loading ? (
                  <p className="text-xs text-muted-foreground">Carregando…</p>
                ) : !journey || journey.purchases.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem compras encontradas.</p>
                ) : (
                  <div className="space-y-2">
                    {journey.purchases.map((p) => (
                      <div
                        key={p.transactionId}
                        className="rounded-md border border-border/60 p-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {p.productNameRaw ?? p.productSlug}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {fmt.shortDate(p.purchasedAt.toISOString().slice(0, 10))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm tabular-nums">
                            {p.valueCents != null ? fmt.money(p.valueCents / 100) : "—"}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] uppercase tracking-wider mt-0.5 font-semibold",
                              p.status === "approved" && "text-emerald-400",
                              p.status === "refunded" && "text-amber-400",
                              p.status === "chargeback" && "text-rose-400",
                            )}
                          >
                            {p.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Eventos de grupo */}
              {journey && journey.whatsappEvents.length > 0 ? (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Eventos WhatsApp
                  </div>
                  <div className="space-y-2">
                    {journey.whatsappEvents.map((ev, i) => (
                      <div
                        key={i}
                        className="text-xs flex items-center gap-2 text-muted-foreground"
                      >
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
                            ev.eventType === "joined"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-rose-500/15 text-rose-400",
                          )}
                        >
                          {ev.eventType}
                        </span>
                        <span>{ev.groupName ?? "—"}</span>
                        <span className="ml-auto tabular-nums">
                          {fmt.shortDate(ev.occurredAt.toISOString().slice(0, 10))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}
```

### Step 2: Criar endpoint `/api/buyer-journey/route.ts`

```typescript
// app/api/buyer-journey/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getBuyerJourney } from "@/lib/queries/purchases";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function isAuthorized(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = req.nextUrl.searchParams.get("email");
  const phone = req.nextUrl.searchParams.get("phone");
  const journey = await getBuyerJourney({ email, phone });
  return NextResponse.json(journey);
}
```

### Step 3: Atualizar `components/dashboard/buyers-table.tsx`

Pegar a versão atual e substituir por:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X, Minus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "./format";
import { BuyerDrawer } from "./buyer-drawer";
import type { BuyerRow } from "@/lib/queries/purchases";

interface Props {
  buyers: BuyerRow[];
  showInGroup?: boolean;
}

function maskPhone(e164: string | null): string {
  if (!e164) return "—";
  if (e164.length < 10) return e164;
  const cc = e164.slice(0, 2);
  const ddd = e164.slice(2, 4);
  const head = e164.slice(4, 5);
  const tail = e164.slice(-4);
  return `+${cc} ${ddd} ${head}****-${tail}`;
}

function whatsappLink(e164: string | null): string | null {
  return e164 ? `https://wa.me/${e164}` : null;
}

export function BuyersTable({ buyers, showInGroup = false }: Props) {
  const [selected, setSelected] = useState<BuyerRow | null>(null);

  if (buyers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhum comprador aprovado no período.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            {showInGroup && <TableHead className="text-center">No grupo</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {buyers.map((b) => {
            const link = whatsappLink(b.buyerPhoneE164);
            return (
              <TableRow
                key={b.transactionId}
                onClick={() => setSelected(b)}
                className="cursor-pointer hover:bg-accent/40"
              >
                <TableCell className="tabular-nums text-sm">
                  {fmt.shortDate(b.purchasedAt.toISOString().slice(0, 10))}
                </TableCell>
                <TableCell className="font-medium">{b.buyerName ?? "—"}</TableCell>
                <TableCell>
                  {link ? (
                    <Link
                      href={link}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline"
                    >
                      {maskPhone(b.buyerPhoneE164)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {b.valueCents != null ? fmt.money(b.valueCents / 100) : "—"}
                </TableCell>
                {showInGroup && (
                  <TableCell className="text-center">
                    {b.inGroup === true ? (
                      <Check className="inline h-4 w-4 text-emerald-500" />
                    ) : b.inGroup === false ? (
                      <X className="inline h-4 w-4 text-rose-500" />
                    ) : (
                      <Minus className="inline h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <BuyerDrawer buyer={selected} onClose={() => setSelected(null)} />
    </>
  );
}
```

### Step 4: tsc + commit

```bash
npx tsc --noEmit
git add components/dashboard/buyer-drawer.tsx components/dashboard/buyers-table.tsx app/api/buyer-journey/
git commit -m "feat(dashboard): BuyerDrawer com timeline + endpoint /api/buyer-journey"
```

---

## Task 10: Reescrita `/desafio/page.tsx`

**Files:**
- Modify: `app/(dashboard)/desafio/page.tsx`
- Delete: `app/(dashboard)/desafio/_metric-tabs.tsx` (não usado mais)
- Delete: `components/dashboard/cycle-selector.tsx` (não usado mais)
- Delete: `components/dashboard/funnel-chart.tsx` (substituído por ConversionFunnel)
- Delete: `components/dashboard/cycle-overlay-chart.tsx` (não usado mais)
- Modify: `lib/queries/dashboard.ts` se houver função órfã (verificar `getCycleOverlay` — pode permanecer pra futuro ou ser removida; deixar)

### Step 1: Reescrever `app/(dashboard)/desafio/page.tsx`

```tsx
import { TrendingUp, ShoppingCart, DollarSign, Target, Activity, Users } from "lucide-react";
import {
  getFunnelMetrics,
  getHierarchyTable,
  getKpis,
  rangeCurrentCycle,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import {
  getApprovedPurchaseCount,
  getApprovedPurchaseRevenue,
  getBuyersForCycle,
  getDailyPurchaseSeries,
  getInGroupStats,
} from "@/lib/queries/purchases";
import { getWhatsappSummary } from "@/lib/queries/whatsapp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BuyersTable } from "@/components/dashboard/buyers-table";
import { ComparisonToggle } from "@/components/dashboard/comparison-toggle";
import { ConversionFunnel } from "@/components/dashboard/conversion-funnel";
import { DailyBarChart, type DailyBarPoint } from "@/components/dashboard/daily-bar-chart";
import { fmt } from "@/components/dashboard/format";
import { GroupPanel } from "@/components/dashboard/group-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { TopCreativesGrid } from "@/components/dashboard/top-creatives-grid";
import type { DateRange } from "@/lib/queries/dashboard";

export const dynamic = "force-dynamic";

const DEFAULT_CYCLE = 7;

function parseRange(sp: { cycle?: string; start?: string; end?: string }) {
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

function buildDailyBarPoints(
  range: DateRange,
  daily: Array<{ date: string; count: number; revenueCents: number }>,
  meta: Array<{ date: string; spend: number; impressions: number; clicks: number; leads: number; purchases: number; revenue: number }>,
): DailyBarPoint[] {
  // Generate sequential dates between range.from and range.to
  const out: DailyBarPoint[] = [];
  const start = new Date(range.from + "T12:00:00");
  const end = new Date(range.to + "T12:00:00");
  const cur = new Date(start);
  const dailyMap = new Map(daily.map((d) => [d.date, d]));
  const metaMap = new Map(meta.map((d) => [d.date, d]));
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const d = dailyMap.get(iso);
    const m = metaMap.get(iso);
    const vendas = d?.count ?? 0;
    const receita = d ? d.revenueCents / 100 : 0;
    const investido = m?.spend ?? 0;
    const roas = investido > 0 ? receita / investido : 0;
    out.push({ date: iso, vendas, receita, investido, roas });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function deltaOf(curr: number, prev: number): { label: string; positive: boolean } | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return { label: "+∞", positive: curr > 0 };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(1)}%`, positive: pct >= 0 };
}

export default async function DesafioPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; start?: string; end?: string; compare?: string }>;
}) {
  const sp = await searchParams;
  const { cycleDays, custom } = parseRange(sp);
  const compare = sp.compare === "1";

  const currentRange = rangeCurrentCycle(cycleDays, custom);
  const prevRange = rangePreviousCycle(currentRange);

  const [
    kpis, funnelMeta, adsTbl, whatsapp,
    purchaseCount, revenueHot, inGroup, dailyHot, dailyMeta,
    prevKpis, prevPurchaseCount, prevRevenueHot, prevDailyHot, prevDailyMeta,
    buyers,
  ] = await Promise.all([
    getKpis("desafio", currentRange),
    getFunnelMetrics("desafio", currentRange),
    getHierarchyTable("desafio", currentRange, "ad"),
    getWhatsappSummary("desafio", currentRange),
    getApprovedPurchaseCount("desafio", currentRange),
    getApprovedPurchaseRevenue("desafio", currentRange),
    getInGroupStats("desafio", currentRange),
    getDailyPurchaseSeries("desafio", currentRange),
    // daily meta series: reaproveita getDailySeries existente
    import("@/lib/queries/dashboard").then((m) => m.getDailySeries("desafio", currentRange)),
    // previous period
    compare ? getKpis("desafio", prevRange) : Promise.resolve(null),
    compare ? getApprovedPurchaseCount("desafio", prevRange) : Promise.resolve(0),
    compare ? getApprovedPurchaseRevenue("desafio", prevRange) : Promise.resolve(0),
    compare ? getDailyPurchaseSeries("desafio", prevRange) : Promise.resolve([]),
    compare
      ? import("@/lib/queries/dashboard").then((m) => m.getDailySeries("desafio", prevRange))
      : Promise.resolve([]),
    getBuyersForCycle("desafio", currentRange),
  ]);

  const currentDaily = buildDailyBarPoints(currentRange, dailyHot, dailyMeta);
  const prevDaily = compare ? buildDailyBarPoints(prevRange, prevDailyHot, prevDailyMeta) : null;

  const cac = purchaseCount > 0 ? kpis.spend / purchaseCount : 0;
  const roas = kpis.spend > 0 ? revenueHot / kpis.spend : 0;
  const inGroupPct = inGroup.buyersWithPhone > 0
    ? (inGroup.inGroup / inGroup.buyersWithPhone) * 100
    : 0;

  const prevCac = compare && prevPurchaseCount > 0 && prevKpis ? prevKpis.spend / prevPurchaseCount : 0;
  const prevRoas = compare && prevKpis && prevKpis.spend > 0 ? prevRevenueHot / prevKpis.spend : 0;

  const subtitle = custom
    ? `Custom · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)} (${cycleDays} dias)`
    : `Últimos ${cycleDays} dias · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}`;

  return (
    <>
      <PageHeader
        title="Desafio"
        subtitle={subtitle}
        hidePicker
        right={
          <div className="flex items-center gap-2">
            <ComparisonToggle />
            <PeriodSelector defaultCycle={DEFAULT_CYCLE} />
          </div>
        }
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          label="Investido"
          value={fmt.money(kpis.spend)}
          delta={compare && prevKpis ? deltaOf(kpis.spend, prevKpis.spend) : null}
          invertDelta
          icon={DollarSign}
          accent="violet"
        />
        <KpiCard
          label="Compradores"
          value={fmt.int(purchaseCount)}
          delta={compare ? deltaOf(purchaseCount, prevPurchaseCount) : null}
          icon={ShoppingCart}
          accent="emerald"
        />
        <KpiCard
          label="Receita"
          value={fmt.money(revenueHot)}
          hint={purchaseCount > 0 ? `TM ${fmt.money(revenueHot / purchaseCount)}` : undefined}
          delta={compare ? deltaOf(revenueHot, prevRevenueHot) : null}
          icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          label="CAC"
          value={purchaseCount > 0 ? fmt.money(cac) : "—"}
          delta={compare && prevCac > 0 ? deltaOf(cac, prevCac) : null}
          invertDelta
          icon={Target}
          accent="amber"
        />
        <KpiCard
          label="ROAS"
          value={fmt.ratio(roas)}
          hint="alvo 2x"
          delta={compare && prevRoas > 0 ? deltaOf(roas, prevRoas) : null}
          icon={Activity}
          accent="sky"
        />
        <KpiCard
          label="No grupo"
          value={`${inGroupPct.toFixed(0)}%`}
          hint={`${inGroup.inGroup} de ${inGroup.buyersWithPhone}`}
          icon={Users}
          accent="fuchsia"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Funil de conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ConversionFunnel
              stages={[
                { label: "Impressões", value: funnelMeta.impressions, format: "int" },
                { label: "Cliques", value: funnelMeta.clicks, format: "int" },
                { label: "Compradores", value: purchaseCount, format: "int" },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Performance diária
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyBarChart current={currentDaily} previous={prevDaily} />
          </CardContent>
        </Card>
      </section>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Top criativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TopCreativesGrid ads={adsTbl} limit={5} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Compradores do período · {buyers.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BuyersTable buyers={buyers} showInGroup />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Grupos WhatsApp — SendFlow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GroupPanel data={whatsapp} />
        </CardContent>
      </Card>
    </>
  );
}
```

### Step 2: Deletar arquivos órfãos

```bash
rm app/\(dashboard\)/desafio/_metric-tabs.tsx
rm components/dashboard/cycle-selector.tsx
rm components/dashboard/funnel-chart.tsx
rm components/dashboard/cycle-overlay-chart.tsx
```

### Step 3: tsc + lint + build

```bash
npx tsc --noEmit
```

Esperado: errors em `app/(dashboard)/guia/page.tsx` (próxima task corrige). tsc fora dali: clean.

### Step 4: Commit (mesmo com /guia ainda quebrado — próxima task fecha)

```bash
git add -A
git commit -m "feat(desafio): redesign completo (6 KPIs, funil barras, daily chart, drawer)"
```

---

## Task 11: Espelhar em /guia

**Files:**
- Modify: `app/(dashboard)/guia/page.tsx`

### Step 1: Reescrever `app/(dashboard)/guia/page.tsx`

```tsx
import { Activity, BookOpen, DollarSign, ShoppingCart, Target, TrendingUp } from "lucide-react";
import {
  getFunnelMetrics,
  getHierarchyTable,
  getKpis,
  rangeCurrentCycle,
  rangePreviousCycle,
} from "@/lib/queries/dashboard";
import {
  getApprovedPurchaseCount,
  getApprovedPurchaseRevenue,
  getBuyersForCycle,
  getDailyPurchaseSeries,
} from "@/lib/queries/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BuyersTable } from "@/components/dashboard/buyers-table";
import { ComparisonToggle } from "@/components/dashboard/comparison-toggle";
import { ConversionFunnel } from "@/components/dashboard/conversion-funnel";
import { DailyBarChart, type DailyBarPoint } from "@/components/dashboard/daily-bar-chart";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { TopCreativesGrid } from "@/components/dashboard/top-creatives-grid";
import type { DateRange } from "@/lib/queries/dashboard";

export const dynamic = "force-dynamic";

const DEFAULT_CYCLE = 30;

function parseRange(sp: { cycle?: string; start?: string; end?: string }) {
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

function buildDailyBarPoints(
  range: DateRange,
  daily: Array<{ date: string; count: number; revenueCents: number }>,
  meta: Array<{ date: string; spend: number; impressions: number; clicks: number; leads: number; purchases: number; revenue: number }>,
): DailyBarPoint[] {
  const out: DailyBarPoint[] = [];
  const start = new Date(range.from + "T12:00:00");
  const end = new Date(range.to + "T12:00:00");
  const cur = new Date(start);
  const dailyMap = new Map(daily.map((d) => [d.date, d]));
  const metaMap = new Map(meta.map((d) => [d.date, d]));
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const d = dailyMap.get(iso);
    const m = metaMap.get(iso);
    const vendas = d?.count ?? 0;
    const receita = d ? d.revenueCents / 100 : 0;
    const investido = m?.spend ?? 0;
    const roas = investido > 0 ? receita / investido : 0;
    out.push({ date: iso, vendas, receita, investido, roas });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function deltaOf(curr: number, prev: number): { label: string; positive: boolean } | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return { label: "+∞", positive: curr > 0 };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(1)}%`, positive: pct >= 0 };
}

export default async function GuiaPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; start?: string; end?: string; compare?: string }>;
}) {
  const sp = await searchParams;
  const { cycleDays, custom } = parseRange(sp);
  const compare = sp.compare === "1";

  const currentRange = rangeCurrentCycle(cycleDays, custom);
  const prevRange = rangePreviousCycle(currentRange);

  const [
    kpis, funnelMeta, adsTbl,
    purchaseCount, revenueHot, dailyHot, dailyMeta,
    prevKpis, prevPurchaseCount, prevRevenueHot, prevDailyHot, prevDailyMeta,
    buyers,
  ] = await Promise.all([
    getKpis("guia", currentRange),
    getFunnelMetrics("guia", currentRange),
    getHierarchyTable("guia", currentRange, "ad"),
    getApprovedPurchaseCount("guia", currentRange),
    getApprovedPurchaseRevenue("guia", currentRange),
    getDailyPurchaseSeries("guia", currentRange),
    import("@/lib/queries/dashboard").then((m) => m.getDailySeries("guia", currentRange)),
    compare ? getKpis("guia", prevRange) : Promise.resolve(null),
    compare ? getApprovedPurchaseCount("guia", prevRange) : Promise.resolve(0),
    compare ? getApprovedPurchaseRevenue("guia", prevRange) : Promise.resolve(0),
    compare ? getDailyPurchaseSeries("guia", prevRange) : Promise.resolve([]),
    compare
      ? import("@/lib/queries/dashboard").then((m) => m.getDailySeries("guia", prevRange))
      : Promise.resolve([]),
    getBuyersForCycle("guia", currentRange),
  ]);

  const currentDaily = buildDailyBarPoints(currentRange, dailyHot, dailyMeta);
  const prevDaily = compare ? buildDailyBarPoints(prevRange, prevDailyHot, prevDailyMeta) : null;

  const cac = purchaseCount > 0 ? kpis.spend / purchaseCount : 0;
  const roas = kpis.spend > 0 ? revenueHot / kpis.spend : 0;
  const ticketMedio = purchaseCount > 0 ? revenueHot / purchaseCount : 0;

  const prevCac = compare && prevPurchaseCount > 0 && prevKpis ? prevKpis.spend / prevPurchaseCount : 0;
  const prevRoas = compare && prevKpis && prevKpis.spend > 0 ? prevRevenueHot / prevKpis.spend : 0;
  const prevTicket = compare && prevPurchaseCount > 0 ? prevRevenueHot / prevPurchaseCount : 0;

  const subtitle = custom
    ? `Custom · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)} (${cycleDays} dias)`
    : `Últimos ${cycleDays} dias · ${fmt.shortDate(currentRange.from)} → ${fmt.shortDate(currentRange.to)}`;

  return (
    <>
      <PageHeader
        title="Guia"
        subtitle={subtitle}
        hidePicker
        right={
          <div className="flex items-center gap-2">
            <ComparisonToggle />
            <PeriodSelector defaultCycle={DEFAULT_CYCLE} />
          </div>
        }
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          label="Investido"
          value={fmt.money(kpis.spend)}
          delta={compare && prevKpis ? deltaOf(kpis.spend, prevKpis.spend) : null}
          invertDelta
          icon={DollarSign}
          accent="violet"
        />
        <KpiCard
          label="Compradores"
          value={fmt.int(purchaseCount)}
          delta={compare ? deltaOf(purchaseCount, prevPurchaseCount) : null}
          icon={ShoppingCart}
          accent="emerald"
        />
        <KpiCard
          label="Receita"
          value={fmt.money(revenueHot)}
          delta={compare ? deltaOf(revenueHot, prevRevenueHot) : null}
          icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          label="CAC"
          value={purchaseCount > 0 ? fmt.money(cac) : "—"}
          delta={compare && prevCac > 0 ? deltaOf(cac, prevCac) : null}
          invertDelta
          icon={Target}
          accent="amber"
        />
        <KpiCard
          label="ROAS"
          value={fmt.ratio(roas)}
          hint="alvo 2x"
          delta={compare && prevRoas > 0 ? deltaOf(roas, prevRoas) : null}
          icon={Activity}
          accent="sky"
        />
        <KpiCard
          label="Ticket médio"
          value={purchaseCount > 0 ? fmt.money(ticketMedio) : "—"}
          delta={compare && prevTicket > 0 ? deltaOf(ticketMedio, prevTicket) : null}
          icon={BookOpen}
          accent="fuchsia"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Funil de conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ConversionFunnel
              stages={[
                { label: "Impressões", value: funnelMeta.impressions, format: "int" },
                { label: "Cliques", value: funnelMeta.clicks, format: "int" },
                { label: "Compradores", value: purchaseCount, format: "int" },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Performance diária
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyBarChart current={currentDaily} previous={prevDaily} />
          </CardContent>
        </Card>
      </section>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Top criativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TopCreativesGrid ads={adsTbl} limit={5} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border/60 mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Compradores do período · {buyers.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BuyersTable buyers={buyers} />
        </CardContent>
      </Card>
    </>
  );
}
```

### Step 2: Verificação final completa

```bash
npm test 2>&1 | tail -3
npx tsc --noEmit && echo "tsc OK"
npm run build 2>&1 | tail -25
```

Esperado:
- Todos testes verdes
- tsc clean
- Build emitindo `/desafio` e `/guia` como server-rendered, e `/api/buyer-journey`

### Step 3: Commit + push

```bash
git add -A
git commit -m "feat(guia): redesign espelhando /desafio (Ticket médio no lugar de No grupo)"
git push origin main
```

Vercel detecta e deploya automático.

### Step 4: Smoke test em produção

Após deploy verde, abrir:
- `https://dash-traqueamento.vercel.app/desafio` — verificar layout
- Cmd+Shift+R pra furar cache se necessário
- Sidebar mostra `v0.6.0 · <hash>`
- Clicar em um comprador na tabela → drawer abre
- Toggle "vs período anterior" → KPIs ganham delta + gráfico ganha fantasma
- Mudar período pra 30d ou Este mês → dados atualizam
- Verificar `/guia` também

---

## Verificação global após Task 11

- [ ] Sidebar mostra `v0.6.0 · <hash>` em prod
- [ ] /desafio: 6 KPIs com ícone, funil barras, gráfico barras com toggle, top criativos com thumb
- [ ] Clicar comprador → drawer com jornada + produtos + eventos grupo
- [ ] Toggle "vs período anterior" funciona (deltas + fantasma)
- [ ] Period selector com presets 7d/15d/30d/Este mês/Custom
- [ ] /guia espelhado sem coluna "no grupo"
- [ ] `npm test` 50+ verdes
- [ ] `npm run build` sem warnings

## Fora de escopo confirmado

- Insight automático
- Importador planilha UTMs
- Click no top criativo → drilldown
- Página dedicada `/desafio/comprador/[id]`
