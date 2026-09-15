"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartSeries, useChartPalette } from "@/lib/chart-palette";

export interface AdherencePoint {
  date: string;
  kcal: number | null;
  targetKcal: number | null;
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Calories per day against the target that was in force on that day.
 *
 * A day over target renders amber rather than red, and the reference line
 * carries the actual meaning — the bar crossing it is the signal, so the chart
 * never relies on colour alone (§9). Unlogged days are simply absent bars,
 * which is information rather than a gap to be filled in.
 */
export function AdherenceChart({
  series,
  height = 200,
}: {
  series: AdherencePoint[];
  height?: number;
}) {
  // A single reference line only makes sense when the target held steady; if
  // it changed inside the window, the per-bar colouring still tells the truth.
  const targets = [...new Set(series.map((p) => p.targetKcal).filter((t): t is number => t != null))];
  const singleTarget = targets.length === 1 ? targets[0] : null;

  const palette = useChartPalette();
  const hues = chartSeries(palette);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="18%">
        <CartesianGrid stroke={palette.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={dayLabel}
          tick={{ fill: palette.axis, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: palette.grid }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={{ fill: palette.axis, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={42}
        />
        {singleTarget != null && (
          <ReferenceLine
            y={singleTarget}
            stroke={palette.axis}
            strokeDasharray="4 4"
            label={{
              value: `target ${singleTarget}`,
              fill: palette.axis,
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              position: "insideTopRight",
            }}
          />
        )}
        <Tooltip
          cursor={{ fill: "rgba(158,158,180,0.06)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as AdherencePoint;
            if (p.kcal == null) return null;
            const delta = p.targetKcal != null ? p.kcal - p.targetKcal : null;
            return (
              <div className="rounded-lg border border-edge bg-void/95 px-3 py-2 font-mono text-xs">
                <div className="text-zinc-500">{dayLabel(p.date)}</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">{p.kcal} kcal</div>
                {delta != null && (
                  <div className="text-zinc-400">
                    {delta === 0 ? "on target" : `${Math.abs(delta)} ${delta > 0 ? "over" : "under"}`}
                  </div>
                )}
              </div>
            );
          }}
        />
        <Bar dataKey="kcal" radius={[3, 3, 0, 0]} maxBarSize={22}>
          {series.map((p) => (
            <Cell
              key={p.date}
              fill={
                p.targetKcal != null && p.kcal != null && p.kcal > p.targetKcal
                  ? hues.fuel.overTarget
                  : hues.fuel.calories
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
