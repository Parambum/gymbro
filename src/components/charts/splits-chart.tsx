"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartSeries, useChartPalette } from "@/lib/chart-palette";
import { formatDuration, formatPace } from "@/lib/math/geo";

export interface SplitPoint {
  km: number;
  timeS: number;
  paceSPerKm: number;
  elevGainM: number;
}

/**
 * Per-kilometre splits.
 *
 * The y-axis is inverted so faster kilometres draw *taller* — a runner reads
 * "big bar = strong km" instantly, whereas a raw seconds axis puts your best
 * effort at the bottom of the chart. The fastest split is highlighted.
 */
export function SplitsChart({ splits, height = 200 }: { splits: SplitPoint[]; height?: number }) {
  if (splits.length === 0) return null;

  const fastest = Math.min(...splits.map((s) => s.paceSPerKm));
  const slowest = Math.max(...splits.map((s) => s.paceSPerKm));
  // pad the domain so the quickest km doesn't touch the ceiling
  const domainLow = Math.max(0, fastest - (slowest - fastest) * 0.35 - 10);

  const palette = useChartPalette();
  const hues = chartSeries(palette);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={splits} margin={{ top: 6, right: 8, bottom: 0, left: -4 }} barCategoryGap="22%">
        <CartesianGrid stroke={palette.grid} vertical={false} />
        <XAxis
          dataKey="km"
          tickFormatter={(v: number) => `${v}`}
          tick={{ fill: palette.axis, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: palette.grid }}
          tickLine={false}
        />
        <YAxis
          reversed
          domain={[domainLow, slowest + 5]}
          tickFormatter={(v: number) => formatPace(v).replace(" /km", "")}
          tick={{ fill: palette.axis, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={46}
        />
        <Tooltip
          cursor={{ fill: "rgba(5,150,105,0.07)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const s = payload[0].payload as SplitPoint;
            return (
              <div className="rounded-lg border border-edge bg-void/95 px-3 py-2 font-mono text-xs">
                <div className="text-zinc-500">Kilometre {s.km}</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">{formatPace(s.paceSPerKm)}</div>
                <div className="mt-0.5 text-zinc-400">{formatDuration(s.timeS)} split</div>
                {s.elevGainM > 0 && <div className="text-zinc-500">+{s.elevGainM} m climb</div>}
              </div>
            );
          }}
        />
        <Bar dataKey="paceSPerKm" radius={[4, 4, 0, 0]} maxBarSize={30}>
          {splits.map((s, i) => (
            <Cell
              key={i}
              fill={s.paceSPerKm === fastest ? hues.cardio.elevation : hues.cardio.pace}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
