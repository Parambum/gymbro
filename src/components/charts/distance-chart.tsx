"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CARDIO_SERIES, GRID, AXIS_INK } from "@/lib/chart-palette";

export interface DistancePoint {
  week: string; // ISO date of week start
  distanceKm: number;
}

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Weekly cardio volume in kilometres — mirrors the strength VolumeChart. */
export function DistanceChart({ series, height = 200 }: { series: DistancePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -10 }} barCategoryGap="28%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={weekLabel}
          tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis
          // values are already kilometres — a "k" suffix would read as
          // thousands and make a 20 km week look like 20,000
          tickFormatter={(v: number) => `${v}`}
          tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ fill: "rgba(56,189,248,0.06)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-edge bg-void/95 px-3 py-2 font-mono text-xs">
                <div className="text-zinc-500">Week of {weekLabel(payload[0].payload.week)}</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">{payload[0].value} km</div>
              </div>
            ) : null
          }
        />
        <Bar dataKey="distanceKm" fill={CARDIO_SERIES.distance} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
