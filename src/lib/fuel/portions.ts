/**
 * Portion resolution.
 *
 * The *table* of household portions — katori, roti, scoop, glass — is seed
 * data and lives with the seeder (`scripts/fuel/portion-sets.mjs`), next to
 * the food manifest it is attached to. By the time the app runs, every food's
 * portions are rows in `fuelportions`, read from the database like anything
 * else. What the app needs at runtime is only the arithmetic, and that is
 * here: one pure function, safe to import on the client so the portion sheet
 * can preview macros live without a round trip.
 */

import type { PortionUnit } from "./types";

export interface PortionTemplate {
  label: string;
  grams: number;
  unit: PortionUnit;
}

/**
 * Grams actually eaten. `quantity` is what the stepper shows (2 rotis, 1.5
 * katoris); `portionGrams` is what one of them weighs.
 *
 * Returns 0 rather than NaN for nonsense input — a half-typed "1." in a number
 * field must render a blank preview, never "NaN kcal".
 */
export function resolveGrams(quantity: number, portionGrams: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(portionGrams)) return 0;
  if (quantity <= 0 || portionGrams <= 0) return 0;
  return Math.round(quantity * portionGrams * 100) / 100;
}

/**
 * Scale a per-100g figure to an actual gram weight. Every macro number the
 * user ever sees passes through here.
 */
export function scalePer100g(per100gValue: number, grams: number): number {
  if (!Number.isFinite(per100gValue) || !Number.isFinite(grams)) return 0;
  return (per100gValue * grams) / 100;
}
