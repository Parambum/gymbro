/**
 * Weight trend (§5.5).
 *
 * Daily bodyweight is noise on top of signal — salt, water, sleep, what time
 * you weighed. Two raw readings a week apart can differ by a kilo in either
 * direction and say nothing about whether the plan is working. So: store raw,
 * display an exponentially-weighted moving average, and compute "actual weekly
 * change" from the smoothed series.
 *
 * α = 0.1 gives roughly a 19-day centre of mass: responsive enough to notice a
 * real change inside a fortnight, slow enough to ignore a heavy dinner.
 */

import { daysBetween, leastSquares } from "@/lib/math/regression";
import { round } from "./types";

export const DEFAULT_ALPHA = 0.1;

export interface WeightPoint {
  /** yyyy-mm-dd */
  date: string;
  weightKg: number;
}

export interface TrendPoint extends WeightPoint {
  /** The EWMA value on this date. */
  trendKg: number;
}

/**
 * Attach the smoothed value to each reading, oldest first.
 *
 * Gaps are deliberately *not* interpolated: if someone skips a week, the next
 * reading still gets weight α, the same as any other. Inventing readings for
 * missing days would smooth over exactly the discontinuity the user wants to
 * see.
 */
export function withWeightTrend(points: WeightPoint[], alpha = DEFAULT_ALPHA): TrendPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  const out: TrendPoint[] = [];
  let ewma = sorted[0].weightKg; // seed on the first real reading, not on zero
  for (const p of sorted) {
    ewma = alpha * p.weightKg + (1 - alpha) * ewma;
    out.push({ ...p, trendKg: round(ewma, 2) });
  }
  return out;
}

/**
 * Actual change in kg/week, measured on the trend line over the most recent
 * `windowDays`. Returns null until there is enough spread to fit a line —
 * showing a confident "+1.4 kg/week" off two readings two days apart would be
 * worse than showing nothing.
 */
export function weeklyChangeKg(
  trend: TrendPoint[],
  windowDays = 28,
): number | null {
  if (trend.length < 2) return null;

  const last = trend[trend.length - 1].date;
  const window = trend.filter((p) => daysBetween(p.date, last) <= windowDays);
  if (window.length < 2) return null;

  const span = daysBetween(window[0].date, window[window.length - 1].date);
  if (span < 7) return null; // less than a week of spread says nothing yet

  const origin = window[0].date;
  const model = leastSquares(
    window.map((p) => ({ x: daysBetween(origin, p.date), y: p.trendKg })),
  );
  return round(model.slope * 7, 2);
}

/** The most recent smoothed weight — what the calorie engine should run on. */
export function latestTrendKg(trend: TrendPoint[]): number | null {
  return trend.length > 0 ? trend[trend.length - 1].trendKg : null;
}

/**
 * Is the scale doing what the goal says it should? (§8.4)
 *
 * Returns a neutral verdict, never a judgement: "flat" when the measured
 * change is inside the noise band, otherwise the direction. The caller decides
 * whether that disagrees with the user's goal.
 */
export type TrendDirection = "rising" | "falling" | "flat";

export function trendDirection(weeklyChange: number | null, noiseBandKg = 0.1): TrendDirection {
  if (weeklyChange == null || Math.abs(weeklyChange) < noiseBandKg) return "flat";
  return weeklyChange > 0 ? "rising" : "falling";
}
