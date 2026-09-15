/**
 * The calorie engine.
 *
 * Mifflin-St Jeor → TDEE → goal adjustment → macro split, with the safety
 * rules of §5.6 applied as hard clamps rather than warnings. Every function
 * here is pure: no database, no clock, no randomness — which is why this is
 * the file with the test suite next to it.
 *
 * Two principles run through all of it:
 *
 *  1. **Clamp, then explain.** An aggressive rate or an unsafe target is never
 *     rejected with an error and never silently honoured. It is capped in the
 *     maths, and the reason is returned in `notes` as one plain sentence for
 *     the UI to show. The user always gets a working target.
 *  2. **No shame.** Nothing in this file produces a judgement, only numbers
 *     and neutral explanations. That constraint is a product requirement, not
 *     a style preference.
 */

import {
  ATWATER,
  FIBER_G_PER_1000_KCAL,
  KCAL_PER_KG_FAT,
  MAX_GAIN_RATE_FRACTION,
  MAX_LOSS_RATE_FRACTION,
  MIN_FAT_G_PER_KG,
  MIN_HEALTHY_BMI,
  MIN_KCAL,
  PROTEIN_G_PER_KG,
  TRAINING_DAY_WATER_BONUS_ML,
  WATER_ML_PER_KG,
  activityMultiplier,
  macroPreset,
  round,
  type ActivityLevel,
  type Goal,
  type MacroPreset,
  type Sex,
} from "./types";

export interface TargetInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** Always positive; `goal` carries the direction. Ignored when maintaining. */
  rateKgPerWeek: number;
  macroPreset: MacroPreset;
  /** Only read when macroPreset is "custom". */
  customProteinGPerKg?: number;
  /** Only read when macroPreset is "custom". A fraction, e.g. 0.25. */
  customFatPctKcal?: number;
  /** Adds the §5.4 training-day water bonus. */
  trainingDay?: boolean;
}

export interface TargetResult {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
  /** The rate actually used, after capping. */
  appliedRateKgPerWeek: number;
  /** True when sex was unspecified and the BMR is an average of both formulas. */
  isEstimate: boolean;
  /** One plain sentence per clamp applied. Shown under the target, never as an error. */
  notes: string[];
}

// ── 5.1 BMR ──────────────────────────────────────────────────────────

/**
 * Mifflin-St Jeor. The male and female constants differ by 166 kcal; when sex
 * is unspecified we take the midpoint rather than refuse to compute, and the
 * caller labels the result an estimate (§5.1).
 */
export function bmrMifflinStJeor(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  return base + (5 + -161) / 2; // -78
}

// ── 5.2 TDEE ─────────────────────────────────────────────────────────

export function tdeeFrom(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * activityMultiplier(activityLevel);
}

// ── 5.3 goal adjustment ──────────────────────────────────────────────

/**
 * The fastest weekly change we will aim for: 0.75 % of bodyweight when losing,
 * 0.35 % when gaining. Faster loss costs muscle; faster gain is mostly fat.
 */
export function maxRateKgPerWeek(goal: Goal, weightKg: number): number {
  if (goal === "lose") return weightKg * MAX_LOSS_RATE_FRACTION;
  if (goal === "gain") return weightKg * MAX_GAIN_RATE_FRACTION;
  return 0;
}

/** Daily calorie delta for a weekly rate of change. 1 kg of fat ≈ 7700 kcal. */
export function dailyDeltaForRate(rateKgPerWeek: number): number {
  return (rateKgPerWeek * KCAL_PER_KG_FAT) / 7;
}

// ── the whole calculation ────────────────────────────────────────────

export function computeTargets(input: TargetInput): TargetResult {
  const notes: string[] = [];
  const {
    sex,
    ageYears,
    heightCm,
    weightKg,
    activityLevel,
    goal,
    macroPreset: presetSlug,
    trainingDay = false,
  } = input;

  const bmr = bmrMifflinStJeor(sex, weightKg, heightCm, ageYears);
  const tdee = tdeeFrom(bmr, activityLevel);

  // ── rate, capped ───────────────────────────────────────────────────
  const requested = goal === "maintain" ? 0 : Math.max(0, input.rateKgPerWeek);
  const cap = maxRateKgPerWeek(goal, weightKg);
  let appliedRate = Math.min(requested, cap);
  if (goal === "maintain") appliedRate = 0;

  if (requested > cap + 1e-9) {
    notes.push(
      goal === "lose"
        ? `Set to ${round(cap, 2)} kg/week — that's 0.75% of your bodyweight, the fastest you can drop without losing muscle along with it.`
        : `Set to ${round(cap, 2)} kg/week — gain faster than 0.35% of your bodyweight and most of the extra is fat, not muscle.`,
    );
  }

  // ── target calories ────────────────────────────────────────────────
  const delta = dailyDeltaForRate(appliedRate);
  let kcal = goal === "lose" ? tdee - delta : goal === "gain" ? tdee + delta : tdee;

  // §5.6 floors: never under the absolute minimum, never under BMR.
  const floor = Math.max(MIN_KCAL[sex], bmr);
  if (kcal < floor) {
    const reason =
      bmr >= MIN_KCAL[sex]
        ? "that's what your body burns at rest"
        : "that's the lowest we'll ever set a target";
    notes.push(
      `Held at ${Math.round(floor)} kcal — ${reason}. Your loss will be a bit slower than asked, which is the trade worth making.`,
    );
    kcal = floor;
  }

  // ── macros (§5.4) ──────────────────────────────────────────────────
  const preset = macroPreset(presetSlug);
  const proteinPerKg =
    presetSlug === "custom" && input.customProteinGPerKg != null
      ? clamp(input.customProteinGPerKg, PROTEIN_G_PER_KG.min, PROTEIN_G_PER_KG.max)
      : preset.proteinGPerKg;
  const fatPct =
    presetSlug === "custom" && input.customFatPctKcal != null
      ? clamp(input.customFatPctKcal, 0.15, 0.5)
      : preset.fatPctKcal;

  let proteinG = proteinPerKg * weightKg;
  const fatFloorG = MIN_FAT_G_PER_KG * weightKg;
  let fatG = Math.max((fatPct * kcal) / ATWATER.fat, fatFloorG);
  let carbsG = (kcal - proteinG * ATWATER.protein - fatG * ATWATER.fat) / ATWATER.carbs;

  if (carbsG < 0) {
    // Protein and fat alone overshoot the target. Give fat back first — it has
    // a hard physiological floor, protein has a useful range.
    fatG = fatFloorG;
    carbsG = (kcal - proteinG * ATWATER.protein - fatG * ATWATER.fat) / ATWATER.carbs;

    if (carbsG < 0) {
      const affordableProtein = (kcal - fatG * ATWATER.fat) / ATWATER.protein;
      proteinG = Math.max(PROTEIN_G_PER_KG.min * weightKg, Math.min(proteinG, affordableProtein));
      carbsG = Math.max(0, (kcal - proteinG * ATWATER.protein - fatG * ATWATER.fat) / ATWATER.carbs);
      notes.push(
        "At this calorie level protein and fat use the whole budget, so carbs land near zero. Worth easing the deficit.",
      );
    } else {
      notes.push("Fat is at its minimum here so carbs have room — that's intentional, not a rounding error.");
    }
  }

  const fiberG = (kcal / 1000) * FIBER_G_PER_1000_KCAL;
  const waterMl = WATER_ML_PER_KG * weightKg + (trainingDay ? TRAINING_DAY_WATER_BONUS_ML : 0);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    fiberG: Math.round(fiberG),
    waterMl: Math.round(waterMl / 50) * 50, // nearest 50 ml — nobody drinks 2413 ml
    appliedRateKgPerWeek: round(appliedRate, 3),
    isEstimate: sex === "unspecified",
    notes,
  };
}

// ── BMI & goal-weight guidance (§5.6) ────────────────────────────────

export function bmiOf(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) return 0;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

/**
 * A note if a goal weight sits below the healthy BMI band — shown plainly,
 * never blocking, and never something the app suggests on its own.
 */
export function goalWeightNote(targetWeightKg: number, heightCm: number): string | null {
  const bmi = bmiOf(targetWeightKg, heightCm);
  if (bmi >= MIN_HEALTHY_BMI || bmi <= 0) return null;
  return `A goal of ${round(targetWeightKg, 1)} kg puts you at BMI ${bmi}, under the healthy range of ${MIN_HEALTHY_BMI}. Worth talking to a doctor or dietitian before aiming there.`;
}

// ── projections ──────────────────────────────────────────────────────

/**
 * Days to reach a goal weight at the applied rate, or null when the goal is
 * already met, the rate is zero, or the rate points the wrong way.
 */
export function daysToGoal(
  currentKg: number,
  targetKg: number,
  goal: Goal,
  rateKgPerWeek: number,
): number | null {
  if (rateKgPerWeek <= 0 || goal === "maintain") return null;
  const gap = goal === "lose" ? currentKg - targetKg : targetKg - currentKg;
  if (gap <= 0) return null;
  return Math.ceil((gap / rateKgPerWeek) * 7);
}

// ── small helpers ────────────────────────────────────────────────────

/** Whole years old on `onIso`, from a yyyy-mm-dd birth date. */
export function ageOn(birthDateIso: string, onIso: string): number {
  const [by, bm, bd] = birthDateIso.split("-").map(Number);
  const [ny, nm, nd] = onIso.split("-").map(Number);
  let age = ny - by;
  if (nm < bm || (nm === bm && nd < bd)) age -= 1;
  return Math.max(0, age);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
