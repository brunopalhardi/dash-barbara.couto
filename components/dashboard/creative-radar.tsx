"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

interface CreativeRadarProps {
  hookRate: number; // 0-100
  holdRate: number; // 0-100
  bodyRate: number; // 0-100
}

export function CreativeRadar({ hookRate, holdRate, bodyRate }: CreativeRadarProps) {
  const data = [
    { axis: "Hook", value: hookRate },
    { axis: "Hold", value: holdRate },
    { axis: "Body", value: bodyRate },
  ];
  // Determina o domínio: pelo menos 25, ou 1.2× do maior
  const max = Math.max(25, ...data.map((d) => d.value)) * 1.2;
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--color-border)" strokeOpacity={0.4} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <PolarRadiusAxis
            tick={false}
            axisLine={false}
            domain={[0, max]}
          />
          <Radar
            dataKey="value"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.25}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
