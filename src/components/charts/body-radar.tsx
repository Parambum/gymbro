"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { RADAR, GRID, AXIS_INK } from "@/lib/chart-palette";

export interface RadarDatum {
  slug: string;
  muscle: string;
  value: number;
}

const SHORT: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Delts",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  "hams-glutes": "Hams",
  calves: "Calves",
  abs: "Abs",
};

/**
 * Overall body progression — best e1RM per muscle group on one axis each.
 * A single series (current best), so no legend is needed; the title names it.
 */
export function BodyRadar({ data, height = 320 }: { data: RadarDatum[]; height?: number }) {
  const shaped = data.map((d) => ({ ...d, label: SHORT[d.slug] ?? d.muscle }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={shaped} outerRadius="72%">
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis
          dataKey="label"
          tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: "var(--font-mono)" }}
        />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <Radar
          dataKey="value"
          stroke={RADAR}
          strokeWidth={2}
          fill={RADAR}
          fillOpacity={0.22}
          isAnimationActive
        />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-edge bg-void/95 px-3 py-2 font-mono text-xs shadow-neon-purple">
                <div className="text-zinc-300">{payload[0].payload.muscle}</div>
                <div className="mt-0.5 font-bold text-neon-purple">
                  {Number(payload[0].value).toFixed(0)} kg{" "}
                  <span className="text-[10px] font-normal text-zinc-500">best e1RM</span>
                </div>
              </div>
            ) : null
          }
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
