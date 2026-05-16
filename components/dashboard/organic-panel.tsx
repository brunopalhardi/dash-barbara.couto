"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { OrganicSummary } from "@/lib/queries/organic";

interface Props {
  data: OrganicSummary;
}

const SOURCE_LABELS: Record<string, string> = {
  organic_insta_reels: "Reels",
  organic_insta_bio: "Bio Instagram",
  organic_grupos: "Grupos WhatsApp",
  organic_email: "Email marketing",
  organic_youtube: "YouTube",
  organic_telegram: "Telegram",
  desconhecido: "Desconhecido",
};

function labelOf(s: string) {
  return SOURCE_LABELS[s] ?? s.replace(/^organic_/, "");
}

export function OrganicPanel({ data }: Props) {
  const maxCount = Math.max(1, ...data.byOrigin.map((o) => o.count));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Total */}
      <div className="lg:col-span-1 flex flex-col gap-3">
        <div className="rounded-lg border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Total leads (orgânico)
          </div>
          <div className="mt-2 text-3xl font-bold tabular-nums">
            {fmt.int(data.totalLeads)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            no período · agrupado por <code className="text-primary">utm_source</code>
          </div>
        </div>

        {/* Bar list por origem */}
        <div className="rounded-lg border border-border/60 bg-card p-5 flex-1">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Leads por origem
          </div>
          {data.byOrigin.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Nenhum lead orgânico capturado ainda. Adiciona o snippet de tracking nas
              suas LPs e usa <code className="text-primary">utm_medium=organic</code>
              nos links.
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.byOrigin.map((o) => (
                <div key={o.source}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground">{labelOf(o.source)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmt.int(o.count)} ({fmt.pct(o.pct, 1)})
                    </span>
                  </div>
                  <div className="h-2 rounded bg-muted/40 overflow-hidden">
                    <div
                      className={cn("h-full bg-primary")}
                      style={{ width: `${(o.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bar chart diário */}
      <div className="lg:col-span-2 rounded-lg border border-border/60 bg-card p-5">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
          Leads por dia (orgânico)
        </div>
        {data.daily.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            Sem dados pra mostrar.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => fmt.shortDate(v)}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.21 0.006 60)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v) => fmt.shortDate(v as string)}
                formatter={(value) => [fmt.int(Number(value)), "Leads"]}
              />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
