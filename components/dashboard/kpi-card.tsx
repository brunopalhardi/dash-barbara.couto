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
