"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartSeries, useChartPalette } from "@/lib/chart-palette";

export interface WeightPoint {
  date: string;
  weightKg: number;
  trendKg: number;
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Raw readings as dots, the exponentially-weighted trend as the line (§5.5).
 *
 * Both are drawn because both are true: the scatter shows how noisy daily
 * weight really is, and the line shows what is actually happening underneath.
 * Showing only the smoothed line would be a nicer chart and a less honest one.
 */
export function WeightChart({
  series,
  goalKg,
  height = 230,
}: {
  series: WeightPoint[];
  goalKg?: number | null;
  height?: number;
}) {
  const values = series.flatMap((p) => [p.weightKg, p.trendKg]);
  if (goalKg) values.push(goalKg);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);

  const palette = useChartPalette();
  const hues = chartSeries(palette);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={series} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
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
          domain={[min, max]}
          tickFormatter={(v: number) => `${v}`}
          tick={{ fill: palette.axis, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={38}
        />
        {goalKg != null && (
          <ReferenceLine
            y={goalKg}
            stroke={palette.axis}
            strokeDasharray="4 4"
            label={{
              value: `goal ${goalKg}`,
              fill: palette.axis,
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              position: "insideTopRight",
            }}
          />
        )}
        <Tooltip
          cursor={{ stroke: palette.grid }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-edge bg-void/95 px-3 py-2 font-mono text-xs">
                <div className="text-zinc-500">{dayLabel(payload[0].payload.date)}</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">
                  {payload[0].payload.weightKg} kg
                </div>
                <div className="text-zinc-400">trend {payload[0].payload.trendKg} kg</div>
              </div>
            ) : null
          }
        />
        <Scatter dataKey="weightKg" fill={hues.fuel.weight} shape="circle" />
        <Line
          type="monotone"
          dataKey="trendKg"
          stroke={palette.trend}
          strokeWidth={2}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
