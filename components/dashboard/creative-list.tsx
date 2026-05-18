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
