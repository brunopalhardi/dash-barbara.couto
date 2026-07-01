"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TopCreativesGrid } from "./top-creatives-grid";
import type { AdRow } from "@/lib/queries/dashboard";

type Metric = "purchases" | "spend" | "roas" | "ctr";

const METRICS: { key: Metric; label: string }[] = [
  { key: "purchases", label: "Vendas" },
  { key: "spend", label: "Gasto" },
  { key: "roas", label: "ROAS" },
  { key: "ctr", label: "CTR" },
];

function ctrOf(ad: AdRow): number {
  return ad.impressions > 0 ? ad.clicks / ad.impressions : 0;
}

function valueOf(ad: AdRow, metric: Metric): number {
  if (metric === "ctr") return ctrOf(ad);
  return ad[metric] as number;
}

/**
 * Top criativos no padrão do Gui: top 5 ordenado pela métrica selecionada.
 * Recebe um pool amplo de anúncios ativos e reordena no client — sem refetch.
 * Default = Vendas (só os com venda entram). Demais métricas mostram top do pool.
 */
export function TopCreativesToggle({
  ads,
  limit = 5,
  basePath,
}: {
  ads: AdRow[];
  limit?: number;
  basePath: string;
}) {
  const [metric, setMetric] = useState<Metric>("purchases");

  const pool = metric === "purchases" ? ads.filter((a) => a.purchases > 0) : ads;
  const sorted = [...pool].sort((a, b) => valueOf(b, metric) - valueOf(a, metric));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={cn(
              "px-2.5 py-1 rounded-md border text-xs transition-colors tabular-nums",
              metric === m.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-card text-muted-foreground hover:bg-card/80",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <TopCreativesGrid ads={sorted} limit={limit} basePath={basePath} />
    </div>
  );
}
