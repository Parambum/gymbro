"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CARDIO_SERIES, GRID, AXIS_INK } from "@/lib/chart-palette";

export interface EffortPoint {
  date: string;
  effort: number;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Relative Effort over time — the cardio load curve. */
export function EffortChart({
  series,
  height = 200,
}: {
  series: EffortPoint[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="effortFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CARDIO_SERIES.effort} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CARDIO_SERIES.effort} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          cursor={{ stroke: AXIS_INK, strokeWidth: 1, strokeDasharray: "3 3" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-edge bg-void/95 px-3 py-2 font-mono text-xs shadow-neon-crimson">
                <div className="text-zinc-500">{shortDate(payload[0].payload.date)}</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">
                  {payload[0].value} <span className="text-[10px] text-zinc-500">relative effort</span>
                </div>
              </div>
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="effort"
          stroke={CARDIO_SERIES.effort}
          strokeWidth={2}
          fill="url(#effortFill)"
          dot={false}
          activeDot={{ r: 4, fill: CARDIO_SERIES.effort, stroke: "#0a0a14", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
