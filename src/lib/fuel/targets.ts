/**
 * Resolving "what was the target on this day".
 *
 * FuelTarget is append-only: recalculating inserts a new row rather than
 * editing the old one. That makes history honest — a day in January is still
 * judged against January's target — but it means every read has to pick the
 * right row, and that choice lives here so it can be tested without a database.
 */

import type { MacroTotals } from "./types";

export interface DatedTarget {
  effectiveFrom: string; // yyyy-mm-dd
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
}

/**
 * The target in force on `iso`: the newest row that had already taken effect.
 *
 * Returns null when the user had no target yet on that date — a day logged
 * before onboarding finished shows totals with nothing to compare against,
 * which is correct and must not fall back to today's numbers.
 */
export function targetForDate<T extends DatedTarget>(targets: T[], iso: string): T | null {
  let best: T | null = null;
  for (const t of targets) {
    if (t.effectiveFrom > iso) continue;
    if (!best || t.effectiveFrom > best.effectiveFrom) best = t;
  }
  return best;
}

export interface Remaining {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  /** true once consumed exceeds the target — a neutral fact, not a failure. */
  overKcal: boolean;
}

/**
 * What's left of the day. Deliberately allowed to go negative: the UI shows
 * "220 over" in a neutral colour rather than clamping to zero and pretending.
 */
export function remainingFor(target: DatedTarget, consumed: MacroTotals): Remaining {
  return {
    kcal: Math.round(target.kcal - consumed.kcal),
    proteinG: Math.round(target.proteinG - consumed.proteinG),
    carbsG: Math.round(target.carbsG - consumed.carbsG),
    fatG: Math.round(target.fatG - consumed.fatG),
    fiberG: Math.round(target.fiberG - consumed.fiberG),
    overKcal: consumed.kcal > target.kcal,
  };
}

/**
 * Progress as a 0..1+ fraction for rings and bars. Uncapped on purpose — the
 * ring renders past 100 % rather than silently maxing out.
 */
export function progressFraction(consumed: number, target: number): number {
  if (!Number.isFinite(consumed) || !Number.isFinite(target) || target <= 0) return 0;
  return consumed / target;
}
