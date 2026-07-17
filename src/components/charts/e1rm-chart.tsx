"use client";

import {
  Area,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STRENGTH_SERIES, TREND, GRID, AXIS_INK } from "@/lib/chart-palette";
import { progressBetween, type E1rmPoint } from "@/lib/math/e1rm";
import { withTrend } from "@/lib/math/regression";

interface ChartPoint extends E1rmPoint {
  trend: number;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The Smart Progression chart: e1RM area with a least-squares trendline
 * overlay. The tooltip explains the *mechanics* of each move — load
 * increase vs volume overload — so 30 kg × 14 reads as the progress it is.
 */
export function E1rmChart({
  series,
  height = 280,
}: {
  series: E1rmPoint[];
  height?: number;
}) {
  const data = withTrend(series);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center font-mono text-xs text-zinc-600"
        style={{ height }}
      >
        NO SETS LOGGED — THE VECTOR AWAITS
      </div>
    );
  }

  return (
    <div>
      {/* legend: two series → always present, text in ink, color as chip */}
      <div className="mb-2 flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: STRENGTH_SERIES.e1rm }} />
          e1RM (kg)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3" style={{ background: TREND }} />
          Trend
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="e1rmFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STRENGTH_SERIES.e1rm} stopOpacity={0.35} />
              <stop offset="100%" stopColor={STRENGTH_SERIES.e1rm} stopOpacity={0.02} />
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
            domain={["dataMin - 5", "dataMax + 5"]}
            tick={{ fill: AXIS_INK, fontSize: 10, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            width={54}
          />
          <Tooltip
            cursor={{ stroke: AXIS_INK, strokeWidth: 1, strokeDasharray: "3 3" }}
            content={<E1rmTooltip data={data} />}
          />
          <Area
            type="monotone"
            dataKey="e1rm"
            stroke={STRENGTH_SERIES.e1rm}
            strokeWidth={2}
            fill="url(#e1rmFill)"
            dot={false}
            activeDot={{ r: 4, fill: STRENGTH_SERIES.e1rm, stroke: "#0a0a14", strokeWidth: 2 }}
          />
          <Line
            type="linear"
            dataKey="trend"
            stroke={TREND}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function E1rmTooltip({
  active,
  payload,
  data,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  data: ChartPoint[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const idx = data.findIndex((d) => d.date === point.date);
  const prev = idx > 0 ? data[idx - 1] : null;
  const progress = prev ? progressBetween(prev, point) : null;

  return (
    <div className="rounded-lg border border-edge bg-void/95 px-3 py-2 font-mono text-xs shadow-neon-purple">
      <div className="text-zinc-500">{shortDate(point.date)}</div>
      <div className="mt-1 text-sm font-bold text-zinc-100">
        {point.e1rm.toFixed(1)} <span className="text-[10px] text-zinc-500">kg e1RM</span>
      </div>
      <div className="text-zinc-400">
        {point.weightKg} kg × {point.reps}
      </div>
      {progress && (
        <div
          className="mt-1.5 border-t border-edge pt-1.5"
          style={{ color: progress.deltaPct >= 0 ? "#4ade80" : "#fb7185" }}
        >
          {progress.label}
        </div>
      )}
    </div>
  );
}
