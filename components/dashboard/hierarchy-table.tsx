"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { HierarchyRow } from "@/lib/queries/dashboard";

type Level = "campaign" | "adset" | "ad";
type SortKey = "name" | "spend" | "purchases" | "cpa" | "roas" | "profit" | "leads" | "cpl";

interface Props {
  data: { campaign: HierarchyRow[]; adset: HierarchyRow[]; ad: HierarchyRow[] };
}

const LEVEL_LABELS: Record<Level, string> = {
  campaign: "Campanhas",
  adset: "Conjuntos",
  ad: "Anúncios",
};

export function HierarchyTable({ data }: Props) {
  const [level, setLevel] = useState<Level>("campaign");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = data[level];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    const sorted = [...base].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (t, r) => ({
        spend: t.spend + r.spend,
        purchases: t.purchases + r.purchases,
        revenue: t.revenue + r.revenue,
        leads: t.leads + r.leads,
        profit: t.profit + r.profit,
      }),
      { spend: 0, purchases: 0, revenue: 0, leads: 0, profit: 0 },
    );
  }, [filtered]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const SortHead = ({ k, children, align = "right" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" }) => {
    const active = sortKey === k;
    return (
      <th
        className={cn(
          "py-2 px-2 text-[11px] uppercase tracking-wider font-normal text-muted-foreground cursor-pointer hover:text-foreground transition-colors",
          align === "right" ? "text-right" : "text-left",
        )}
        onClick={() => toggleSort(k)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )
          ) : null}
        </span>
      </th>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="inline-flex items-center rounded-md bg-card border border-border/60 p-0.5 text-xs">
          {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={cn(
                "px-3 py-1.5 rounded-sm transition-colors font-medium",
                level === l
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {LEVEL_LABELS[l]} ({data[l].length})
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-2 h-8 px-2 rounded-md bg-card border border-border/60 text-xs flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome…"
            className="bg-transparent outline-none flex-1 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-b border-border/50">
            <tr>
              <th className="w-7"></th>
              <SortHead k="name" align="left">Nome</SortHead>
              <th className="text-right py-2 px-2 text-[11px] uppercase tracking-wider font-normal text-muted-foreground">Orçamento</th>
              <SortHead k="spend">Gasto</SortHead>
              <SortHead k="purchases">Vendas</SortHead>
              <SortHead k="cpa">CPA</SortHead>
              <SortHead k="roas">ROAS</SortHead>
              <SortHead k="profit">Lucro</SortHead>
              <SortHead k="leads">Leads</SortHead>
              <SortHead k="cpl">CPL</SortHead>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-6 text-center text-muted-foreground">
                  Nenhum {LEVEL_LABELS[level].toLowerCase()} no período.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="py-2 pl-2">
                    {level === "ad" && r.thumbnailUrl ? (
                      <Image
                        src={r.thumbnailUrl}
                        alt=""
                        width={28}
                        height={28}
                        className="rounded object-cover h-7 w-7"
                        unoptimized
                      />
                    ) : (
                      <span
                        className={cn(
                          "inline-block h-2 w-2 rounded-full",
                          r.status === "ACTIVE" ? "bg-emerald-400" : "bg-muted-foreground/40",
                        )}
                        title={r.status}
                      />
                    )}
                  </td>
                  <td className="py-2 px-2 max-w-xs truncate text-foreground">{r.name}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {r.dailyBudget != null ? `${fmt.money(r.dailyBudget)}/d` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.money(r.spend)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.int(r.purchases)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.money(r.cpa)}</td>
                  <td
                    className={cn(
                      "py-2 px-2 text-right tabular-nums font-medium",
                      r.roas >= 1 ? "text-emerald-400" : r.roas > 0 ? "text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {fmt.ratio(r.roas)}x
                  </td>
                  <td
                    className={cn(
                      "py-2 px-2 text-right tabular-nums",
                      r.profit >= 0 ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {fmt.money(r.profit)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt.int(r.leads)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmt.money(r.cpl)}</td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot>
              <tr className="border-t border-border/60 bg-card/40">
                <td className="py-2 pl-2"></td>
                <td className="py-2 px-2 font-medium uppercase text-[10px] tracking-wider text-muted-foreground">
                  Total ({filtered.length})
                </td>
                <td></td>
                <td className="py-2 px-2 text-right tabular-nums font-medium">{fmt.money(totals.spend)}</td>
                <td className="py-2 px-2 text-right tabular-nums font-medium">{fmt.int(totals.purchases)}</td>
                <td></td>
                <td className="py-2 px-2 text-right tabular-nums font-medium">
                  {fmt.ratio(totals.spend > 0 ? totals.revenue / totals.spend : 0)}x
                </td>
                <td
                  className={cn(
                    "py-2 px-2 text-right tabular-nums font-medium",
                    totals.profit >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {fmt.money(totals.profit)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-medium">{fmt.int(totals.leads)}</td>
                <td></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
