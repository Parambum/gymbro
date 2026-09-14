/**
 * Turning a food + a portion + a quantity into the numbers that get frozen
 * into a log row.
 *
 * Pure, and shared by both sides of the wire on purpose: the portion sheet
 * previews macros with these functions as the user drags the stepper, and the
 * API recomputes them with the same functions before writing. The client's
 * numbers are never trusted — but they are never *wrong* either, which is
 * what makes optimistic UI safe here.
 */

import { scalePer100g } from "./portions";
import { MEALS, ZERO_MACROS, addMacros, roundMacros, type MacroTotals, type Meal, type Per100g } from "./types";

/**
 * The composition fields this actually reads. Deliberately narrower than the
 * full `Per100g`: sugar and sodium are stored and shown, but they play no part
 * in a macro total, and demanding them here would force every caller to carry
 * fields it does not have.
 */
export type MacroSource = Pick<Per100g, "kcal" | "proteinG" | "carbsG" | "fatG"> & {
  fiberG?: number;
};

/** Macros for an actual gram weight of a food. */
export function entryMacrosFor(per100g: MacroSource, grams: number): MacroTotals {
  return roundMacros({
    kcal: scalePer100g(per100g.kcal, grams),
    proteinG: scalePer100g(per100g.proteinG, grams),
    carbsG: scalePer100g(per100g.carbsG, grams),
    fatG: scalePer100g(per100g.fatG, grams),
    fiberG: scalePer100g(per100g.fiberG ?? 0, grams),
  });
}

export interface LoggedEntry extends MacroTotals {
  meal: Meal;
}

/** Day total. Rounded once at the end, not per entry, so it can't drift. */
export function totalsFor(entries: readonly LoggedEntry[]): MacroTotals {
  return roundMacros(entries.reduce<MacroTotals>((sum, e) => addMacros(sum, e), ZERO_MACROS));
}

/**
 * Entries bucketed into the four meal cards, in meal order, each with its own
 * subtotal. Empty meals are kept — a missing Breakfast card would be a worse
 * empty state than an empty one with a "+" on it.
 */
export function groupByMeal<T extends LoggedEntry>(
  entries: readonly T[],
): Array<{ meal: Meal; entries: T[]; totals: MacroTotals }> {
  return MEALS.map((meal) => {
    const forMeal = entries.filter((e) => e.meal === meal);
    return { meal, entries: forMeal, totals: totalsFor(forMeal) };
  });
}

/**
 * A rolling logging streak from the set of days that have at least one entry.
 *
 * Mirrors the strength tracker's `streakFromDates`: a day not yet logged does
 * not break the streak — only a full day of silence does. Nothing downstream
 * of this is allowed to frame a broken streak as a failure (§5.6).
 */
export function loggingStreak(datesWithEntries: Iterable<string>, today: string): number {
  const set = new Set(datesWithEntries);
  if (set.size === 0) return 0;

  const dayBefore = (iso: string) =>
    new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  let cursor = set.has(today) ? today : dayBefore(today);
  if (!set.has(cursor)) return 0;

  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = dayBefore(cursor);
  }
  return streak;
}
