/**
 * Estimated One-Rep Max (e1RM) engine — the Smart Progression core.
 *
 * Absolute weight is a lying metric: 30 kg × 10 in week 1 vs 30 kg × 14 in
 * week 3 is real progress that a weight-only chart renders as a flat line.
 * Normalizing every set to its Epley e1RM turns volume overload into an
 * upward vector.
 *
 *   e1RM = w · (1 + r / 30)
 */

export interface SetInput {
  weightKg: number;
  reps: number;
}

export interface E1rmPoint {
  /** ISO date (yyyy-mm-dd) of the training day */
  date: string;
  /** best e1RM achieved that day, kg */
  e1rm: number;
  /** the set that produced it */
  weightKg: number;
  reps: number;
}

export type ProgressDriver =
  | "load increase"
  | "volume overload"
  | "load + volume"
  | "deload";

/** Epley formula. A true single is its own max — no inflation at r = 1. */
export function epleyE1RM(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || weightKg < 0) {
    throw new RangeError(`weightKg must be a non-negative number, got ${weightKg}`);
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new RangeError(`reps must be a positive integer, got ${reps}`);
  }
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Round to sensible display precision (0.5 kg for e1RM readouts). */
export function roundE1RM(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Collapse raw sets (many per day) into one best-e1RM point per day —
 * the series the area chart plots. Input order does not matter.
 */
export function dailyBestE1RM(
  sets: Array<SetInput & { date: string }>,
): E1rmPoint[] {
  const byDay = new Map<string, E1rmPoint>();
  for (const s of sets) {
    const e1rm = epleyE1RM(s.weightKg, s.reps);
    const prev = byDay.get(s.date);
    if (!prev || e1rm > prev.e1rm) {
      byDay.set(s.date, { date: s.date, e1rm, weightKg: s.weightKg, reps: s.reps });
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface ProgressReport {
  /** signed % change in e1RM, e.g. +11.3 */
  deltaPct: number;
  /** what mechanically drove the change */
  driver: ProgressDriver;
  /** tooltip-ready sentence, e.g. "Progress: +11% e1RM via volume overload" */
  label: string;
}

/**
 * Explain the mechanics between two points: did the lifter add load,
 * add reps at the same load (volume overload), or both?
 */
export function progressBetween(prev: E1rmPoint, curr: E1rmPoint): ProgressReport {
  const deltaPct = prev.e1rm === 0 ? 0 : ((curr.e1rm - prev.e1rm) / prev.e1rm) * 100;

  let driver: ProgressDriver;
  if (deltaPct < 0) driver = "deload";
  else if (curr.weightKg > prev.weightKg && curr.reps > prev.reps) driver = "load + volume";
  else if (curr.weightKg > prev.weightKg) driver = "load increase";
  else driver = "volume overload";

  const sign = deltaPct >= 0 ? "+" : "";
  const label =
    driver === "deload"
      ? `Deload: ${sign}${deltaPct.toFixed(1)}% e1RM`
      : `Progress: ${sign}${deltaPct.toFixed(1)}% e1RM via ${driver}`;

  return { deltaPct, driver, label };
}

/** Tonnage for a session slice: Σ (weight × reps), warmups excluded upstream. */
export function totalVolumeKg(sets: SetInput[]): number {
  return sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
}
