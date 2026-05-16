"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface QualityDonutProps {
  /** 0-100 */
  score: number;
  /** Mostra os 3 componentes embaixo */
  breakdown?: {
    label: string;
    weight: number; // 0..1
    value: number; // 0..1
  }[];
  className?: string;
}

function scoreColor(score: number): string {
  if (score >= 75) return "var(--color-chart-2)"; // emerald
  if (score >= 50) return "var(--color-chart-3)"; // gold/amber
  return "var(--color-chart-4)"; // coral/red
}

function scoreLabel(score: number): string {
  if (score >= 75) return "ótimo";
  if (score >= 50) return "ok";
  if (score >= 25) return "atenção";
  return "ruim";
}

export function QualityDonut({ score, breakdown, className }: QualityDonutProps) {
  const color = scoreColor(score);
  const data = [
    { name: "score", value: score },
    { name: "remaining", value: Math.max(0, 100 - score) },
  ];

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative w-full h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={56}
              outerRadius={78}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="rgba(255,255,255,0.06)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-3xl font-bold tabular-nums leading-none" style={{ color }}>
            {score}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
            {scoreLabel(score)}
          </div>
        </div>
      </div>
      {breakdown ? (
        <div className="w-full space-y-1.5 text-[11px]">
          {breakdown.map((b) => (
            <div key={b.label}>
              <div className="flex justify-between text-muted-foreground">
                <span>{b.label}</span>
                <span className="tabular-nums">{Math.round(b.value * 100)} / 100</span>
              </div>
              <div className="h-1 mt-1 rounded bg-muted/40 overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${b.value * 100}%`,
                    background: color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
