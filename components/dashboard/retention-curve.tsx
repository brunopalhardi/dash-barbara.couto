"use client";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface RetentionPoint { pct: number; audiencePct: number }

export function RetentionCurve({ curve, pitchPct }: { curve: RetentionPoint[]; pitchPct: number | null }) {
  if (curve.length === 0) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Sem dados de retenção no período.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={curve} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ret" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="pct" tickFormatter={(v) => `${v}%`}
          fontSize={10} fontFamily="var(--font-mono)" stroke="rgba(255,255,255,0.5)"
          tickLine={false} axisLine={false} ticks={[0, 20, 40, 60, 80, 100]} />
        <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]}
          fontSize={10} fontFamily="var(--font-mono)" stroke="rgba(255,255,255,0.5)"
          tickLine={false} axisLine={false} width={44} />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.1)" }}
          contentStyle={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
          labelStyle={{ color: "var(--color-foreground)", fontFamily: "var(--font-mono)" }}
          itemStyle={{ color: "var(--color-foreground)" }}
          labelFormatter={(v) => `${v}% do vídeo`}
          formatter={(value) => {
            const num = typeof value === "number" ? value : Number(value);
            return [`${num.toFixed(1)}% da audiência`, "retenção"];
          }}
        />
        {pitchPct != null && (
          <ReferenceLine x={Math.round(pitchPct)} stroke="var(--color-chart-5)" strokeDasharray="5 4"
            label={{ value: "pitch", fill: "var(--color-chart-5)", fontSize: 11, position: "top" }} />
        )}
        <Area type="monotone" dataKey="audiencePct" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#ret)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
