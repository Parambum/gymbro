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
import { STRENGTH_SERIES, GRID, AXIS_INK } from "@/lib/chart-palette";

export interface VolumePoint {
  week: string; // ISO date of week start
  volumeKg: number;
}

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Weekly training tonnage — rounded data-ends, baseline-anchored bars. */
export function VolumeChart({
  series,
  height = 200,
}: {
  series: VolumePoint[];
  height?: number;
}) {
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
          tickFormatter={(v: number) => `${Math.round(v / 1000)}t`}
          tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ fill: "rgba(139,92,246,0.06)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-edge bg-void/95 px-3 py-2 font-mono text-xs">
                <div className="text-zinc-500">Week of {weekLabel(payload[0].payload.week)}</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">
                  {Number(payload[0].value).toLocaleString()} kg
                </div>
              </div>
            ) : null
          }
        />
        <Bar dataKey="volumeKg" fill={STRENGTH_SERIES.volume} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
