import { cn } from "@/lib/utils";

interface FunnelStage {
  label: string;
  value: string;
  hint?: string;
  /** 0..1 — largura relativa do trapézio */
  width: number;
}

interface FunnelChartProps {
  stages: FunnelStage[];
  className?: string;
}

/**
 * Funil visual com 3+ estágios. Cada estágio é um bloco com width derivada
 * do valor relativo (1.0 = full, depois decrescente). Inspirado no painel
 * "Tráfego" do VK Metrics.
 */
export function FunnelChart({ stages, className }: FunnelChartProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 py-2", className)}>
      {stages.map((s, i) => {
        const widthPct = Math.max(20, s.width * 100); // mínimo 20% pra ficar legível
        return (
          <div
            key={s.label}
            className="relative flex items-center justify-center text-center"
            style={{
              width: `${widthPct}%`,
              minHeight: 56,
              clipPath:
                i === stages.length - 1
                  ? "polygon(0 0, 100% 0, 90% 100%, 10% 100%)"
                  : "polygon(0 0, 100% 0, 95% 100%, 5% 100%)",
              background: `linear-gradient(180deg, var(--color-primary) 0%, color-mix(in oklab, var(--color-primary) ${
                90 - i * 18
              }%, transparent) 100%)`,
            }}
          >
            <div className="text-primary-foreground px-4 leading-tight">
              <div className="text-base font-semibold tabular-nums">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider opacity-80">{s.label}</div>
            </div>
          </div>
        );
      })}
      {stages.some((s) => s.hint) ? (
        <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
          {stages
            .filter((s) => s.hint)
            .map((s) => (
              <div key={s.label}>
                <span className="font-medium text-foreground">{s.label}:</span> {s.hint}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
