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
  ReferenceLine,
  CartesianGrid,
} from "recharts";
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
  { key: "vendas", label: "vendas", format: (v) => fmt.int(v) },
  { key: "receita", label: "receita", format: (v) => fmt.money(v) },
  { key: "investido", label: "investido", format: (v) => fmt.money(v) },
  { key: "roas", label: "roas", format: (v) => fmt.ratio(v) },
];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const WEEKDAYS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

function weekdayPt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS_PT[new Date(y, m - 1, d).getDay()];
}

const COLOR_BEST = "#34d399";
const COLOR_ABOVE = "#6366f1";
const COLOR_BELOW = "#52525b";
const COLOR_PREV = "rgba(99, 102, 241, 0.25)";
const COLOR_AVG = "rgba(251, 191, 36, 0.5)";

export function DailyBarChart({ current, previous }: DailyBarChartProps) {
  const [metric, setMetric] = useState<Metric>("vendas");
  const metricCfg = METRICS.find((m) => m.key === metric)!;

  const merged = current.map((p, i) => ({
    date: shortDate(p.date),
    isoDate: p.date,
    weekday: weekdayPt(p.date),
    value: p[metric],
    prev: previous?.[i]?.[metric] ?? null,
  }));

  const total = current.reduce((s, p) => s + p[metric], 0);
  const avgDaily = current.length > 0 ? total / current.length : 0;
  const best = current.reduce<{ v: number; d: string } | null>((acc, p) => {
    return !acc || p[metric] > acc.v ? { v: p[metric], d: p.date } : acc;
  }, null);

  const hasCompare = previous && previous.length > 0;
  const prevTotal = previous?.reduce((s, p) => s + p[metric], 0) ?? 0;
  const delta =
    hasCompare && prevTotal > 0
      ? { pct: ((total - prevTotal) / prevTotal) * 100, positive: total >= prevTotal }
      : null;

  function colorForValue(v: number): string {
    if (best && v === best.v && v > 0) return COLOR_BEST;
    if (v >= avgDaily) return COLOR_ABOVE;
    return COLOR_BELOW;
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
        <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
          {hasCompare ? (
            <>
              <Stat label="Total · atual" value={metricCfg.format(total)} />
              <Stat
                label="Total · anterior"
                value={metricCfg.format(prevTotal)}
                muted
              />
              {delta ? (
                <Stat
                  label="Delta"
                  value={`${delta.positive ? "↑" : "↓"} ${Math.abs(delta.pct).toFixed(1)}%`}
                  tone={delta.positive ? "good" : "bad"}
                />
              ) : null}
            </>
          ) : (
            <>
              <Stat label="Total" value={metricCfg.format(total)} />
              <Stat label="Média / dia" value={metricCfg.format(avgDaily)} />
              {best && best.v > 0 ? (
                <Stat
                  label="Melhor dia"
                  value={metricCfg.format(best.v)}
                  hint={`em ${shortDate(best.d)}`}
                  tone="good"
                />
              ) : null}
            </>
          )}
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-[3px]">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={`font-mono text-[11px] tracking-wide font-medium px-2.5 py-1.5 rounded transition-colors lowercase ${
                metric === m.key
                  ? "bg-white/[0.06] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={merged} barCategoryGap="22%">
            <CartesianGrid
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={(props) => {
                const { x, y, payload, index } = props as {
                  x: number | string;
                  y: number | string;
                  payload: { value: string };
                  index: number;
                };
                const item = merged[index];
                const wd = item?.weekday ?? "";
                const isBest = item && best && item.value === best.v && item.value > 0;
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      y={0}
                      dy={12}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--color-muted-foreground)"
                      fontFamily="var(--font-mono)"
                    >
                      {payload.value}
                    </text>
                    <text
                      y={0}
                      dy={26}
                      textAnchor="middle"
                      fontSize={9}
                      fill={isBest ? COLOR_BEST : "var(--color-muted-foreground)"}
                      opacity={isBest ? 1 : 0.6}
                      fontWeight={isBest ? 600 : 400}
                      fontFamily="var(--font-mono)"
                    >
                      {isBest ? "↑ melhor" : wd}
                    </text>
                  </g>
                );
              }}
              tickLine={false}
              axisLine={false}
              height={36}
            />
            <YAxis
              tick={{
                fontSize: 10,
                fill: "var(--color-muted-foreground)",
                fontFamily: "var(--font-mono)",
              }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => metricCfg.format(Number(v))}
              width={70}
            />
            {avgDaily > 0 ? (
              <ReferenceLine
                y={avgDaily}
                stroke={COLOR_AVG}
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{
                  value: `avg ${metricCfg.format(avgDaily)}`,
                  position: "right",
                  fill: COLOR_AVG,
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                }}
              />
            ) : null}
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
              }}
              labelStyle={{
                color: "var(--color-foreground)",
                fontFamily: "var(--font-mono)",
              }}
              itemStyle={{ color: "var(--color-foreground)" }}
              formatter={(v, name) => [
                metricCfg.format(Number(v)),
                name === "prev" ? "anterior" : "atual",
              ]}
            />
            {hasCompare ? (
              <Bar dataKey="prev" fill={COLOR_PREV} radius={[3, 3, 0, 0]} />
            ) : null}
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {merged.map((m, i) => (
                <Cell key={i} fill={colorForValue(m.value)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 flex-wrap">
        <Legend color={COLOR_BEST} label="melhor dia" />
        <Legend color={COLOR_ABOVE} label="acima da média" />
        <Legend color={COLOR_BELOW} label="abaixo da média" />
        {hasCompare ? <Legend color={COLOR_PREV} label="período anterior" /> : null}
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 border-t border-dashed"
            style={{ borderColor: COLOR_AVG }}
          />
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase">
            média do período
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  muted,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  tone?: "good" | "bad";
}) {
  const valueClass = muted
    ? "text-muted-foreground"
    : tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : "";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-medium">
        {label}
      </div>
      <div
        className={`font-mono font-medium tabular-nums text-[22px] leading-none tracking-tight mt-1.5 ${valueClass}`}
      >
        {value}
        {hint ? (
          <span className="text-sm text-muted-foreground font-normal ml-1.5 tracking-normal">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
      <span className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase">
        {label}
      </span>
    </div>
  );
}
