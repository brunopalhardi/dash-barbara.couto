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
