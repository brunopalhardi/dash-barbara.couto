"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { fmt } from "./format";
import type { AdRow } from "@/lib/queries/dashboard";

type SortKey = "ctr" | "roas" | "spend" | "purchases";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "spend", label: "gasto" },
  { key: "purchases", label: "vendas" },
  { key: "roas", label: "roas" },
  { key: "ctr", label: "ctr" },
];

interface CreativeListProps {
  ads: AdRow[];
  basePath: string;
  activeAdId?: number;
}

function ctrOf(ad: AdRow): number {
  return ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
}

export function CreativeList({ ads, basePath, activeAdId }: CreativeListProps) {
  const [sortBy, setSortBy] = useState<SortKey>("spend");

  const sorted = [...ads].sort((a, b) => {
    if (sortBy === "ctr") return ctrOf(b) - ctrOf(a);
    return (b[sortBy] as number) - (a[sortBy] as number);
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Sort toggle */}
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase">
          ordenar por
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-[3px]">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setSortBy(o.key)}
              className={`font-mono text-[10px] tracking-wide font-medium px-2 py-1 rounded transition-colors lowercase ${
                sortBy === o.key
                  ? "bg-white/[0.06] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
        {sorted.map((ad, idx) => {
          const active = ad.adId === activeAdId;
          const ctr = ctrOf(ad);
          const roas = ad.spend > 0 ? ad.revenue / ad.spend : 0;
          const isWinner = idx === 0 && ad.purchases > 0;

          return (
            <Link
              key={ad.adId}
              href={`${basePath}/${ad.adId}`}
              className={`relative flex items-center gap-3 p-2.5 rounded-md border transition-colors overflow-hidden ${
                active
                  ? "border-primary/50 bg-primary/[0.06]"
                  : "border-border bg-card hover:border-border-hi"
              }`}
            >
              {/* Active accent rail */}
              {active && (
                <div className="absolute inset-y-0 left-0 w-[2px] bg-primary" />
              )}

              {/* Rank pill */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div
                  className={`font-mono tabular-nums text-[10px] font-medium leading-none ${
                    isWinner
                      ? "text-emerald-400"
                      : active
                        ? "text-primary"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <div className="h-9 w-9 rounded bg-muted/30 flex items-center justify-center overflow-hidden border border-white/5">
                  {ad.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={ad.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageOff className="h-3 w-3 text-muted-foreground/60" />
                  )}
                </div>
              </div>

              {/* Name + stats */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`text-[13px] font-medium truncate ${
                      active ? "text-foreground" : "text-foreground/90"
                    }`}
                    title={ad.adName}
                  >
                    {ad.adName}
                  </div>
                  {ad.status !== "ACTIVE" ? (
                    <span
                      className="shrink-0 font-mono text-[9px] tracking-wide lowercase px-1 py-0.5 rounded border border-amber-500/40 text-amber-300/90 bg-amber-500/10"
                      title={`Status no Meta: ${ad.status.toLowerCase()}`}
                    >
                      {ad.status.toLowerCase()}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 mt-1 font-mono tabular-nums text-[10px] text-muted-foreground/70">
                  <span>
                    <span className="text-muted-foreground/40">ctr</span>{" "}
                    {fmt.pct1(ctr)}
                  </span>
                  <span>
                    <span className="text-muted-foreground/40">roas</span>{" "}
                    {fmt.ratio(roas)}
                  </span>
                  <span className="text-foreground/80 font-medium">
                    {fmt.money(ad.spend)}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}

        {sorted.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground/60 text-center py-6 lowercase">
            sem criativos no período
          </p>
        ) : null}
      </div>
    </div>
  );
}
