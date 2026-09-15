/**
 * GymBro Fuel — shared vocabulary.
 *
 * Single source of truth for every enum the Fuel module uses: the Mongoose
 * schemas, the Zod validators, and the UI all derive from the constants here,
 * the same way the strength module derives its muscle groups from
 * `lib/data/exercise-catalog.ts`. Adding a value in one place is enough.
 *
 * Nothing in this file touches the database or the network — it is safe to
 * import from a client component.
 */

// ── who the user is ──────────────────────────────────────────────────

/**
 * "unspecified" is a first-class answer, not a missing value. §5.1 of the
 * spec requires the engine to average the two Mifflin-St Jeor constants and
 * label the resulting target an estimate rather than refuse to compute.
 */
export const SEXES = ["male", "female", "unspecified"] as const;
export type Sex = (typeof SEXES)[number];

export interface ActivityLevelDef {
  slug: ActivityLevel;
  label: string;
  /** Mifflin-St Jeor TDEE multiplier */
  multiplier: number;
  blurb: string;
}

export const ACTIVITY_LEVELS = [
  { slug: "sedentary", label: "Sedentary", multiplier: 1.2, blurb: "Desk job, little movement" },
  { slug: "light", label: "Light", multiplier: 1.375, blurb: "1–3 sessions a week" },
  { slug: "moderate", label: "Moderate", multiplier: 1.55, blurb: "3–5 sessions a week" },
  { slug: "very-active", label: "Very active", multiplier: 1.725, blurb: "6–7 sessions a week" },
  { slug: "athlete", label: "Athlete", multiplier: 1.9, blurb: "Physical job + training" },
] as const satisfies readonly ActivityLevelDef[];

export type ActivityLevel = "sedentary" | "light" | "moderate" | "very-active" | "athlete";

export const ACTIVITY_SLUGS = ACTIVITY_LEVELS.map((a) => a.slug) as [ActivityLevel, ...ActivityLevel[]];

export function activityMultiplier(level: ActivityLevel): number {
  return ACTIVITY_LEVELS.find((a) => a.slug === level)?.multiplier ?? 1.2;
}

export const GOALS = ["lose", "maintain", "gain"] as const;
export type Goal = (typeof GOALS)[number];

export const DIET_PREFS = ["veg", "nonveg", "egg", "vegan", "jain"] as const;
export type DietPref = (typeof DIET_PREFS)[number];

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

// ── food & logging ───────────────────────────────────────────────────

export const MEALS = ["breakfast", "lunch", "snack", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};

/**
 * How an entry got into the log. Stored on every row so the weekly report can
 * say which paths people actually use, and so photo-drafted rows can be told
 * apart from typed ones when tuning vision accuracy.
 */
export const ENTRY_METHODS = [
  "search",
  "barcode",
  "photo",
  "text",
  "quick",
  "recipe",
  "favorite",
] as const;
export type EntryMethod = (typeof ENTRY_METHODS)[number];

/**
 * Where a food's nutrition numbers came from. This drives the "unverified"
 * badge in the UI: anything that isn't `ifct`, `usda` or `off` is a number a
 * human or a model supplied, and the UI must say so.
 */
export const FOOD_SOURCES = ["ifct", "usda", "off", "user", "ai", "recipe"] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

export const VEG_FLAGS = ["veg", "nonveg", "egg", "unknown"] as const;
export type VegFlag = (typeof VEG_FLAGS)[number];

/** How a portion's size is expressed. `household` covers katori, roti, cup… */
export const PORTION_UNITS = ["g", "ml", "household"] as const;
export type PortionUnit = (typeof PORTION_UNITS)[number];

/** Per-100g composition. Every field is grams except kcal and sodium. */
export interface Per100g {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
}

export interface MacroTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

// ── the maths constants ──────────────────────────────────────────────

/** Atwater factors — kcal per gram. Fiber is counted as carbohydrate (§5.4). */
export const ATWATER = { protein: 4, carbs: 4, fat: 9, alcohol: 7 } as const;

/** Energy in a kilogram of body fat. The basis of the goal adjustment (§5.3). */
export const KCAL_PER_KG_FAT = 7700;

/**
 * Rate caps, as a fraction of bodyweight per week (§5.3). Exceeding these is
 * clamped silently in the maths and explained in one line of UI copy — the
 * user is never scolded, and never allowed to run the aggressive number.
 */
export const MAX_LOSS_RATE_FRACTION = 0.0075; // 0.75 %/week
export const MAX_GAIN_RATE_FRACTION = 0.0035; // 0.35 %/week

/**
 * Absolute calorie floors (§5.6). A target is additionally never allowed below
 * the user's own BMR, which is usually the binding constraint for larger
 * lifters. "unspecified" takes the higher of the two floors — when we do not
 * know, we err upward.
 */
export const MIN_KCAL: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  unspecified: 1500,
};

/** Below this BMI a goal weight gets a plain-language note; never suggested. */
export const MIN_HEALTHY_BMI = 18.5;

export const PROTEIN_G_PER_KG = { min: 1.6, default: 1.8, max: 2.2 } as const;
/** Hard physiological floor on fat intake, in grams per kg bodyweight (§5.4). */
export const MIN_FAT_G_PER_KG = 0.6;
export const FIBER_G_PER_1000_KCAL = 14;
export const WATER_ML_PER_KG = 35;
export const TRAINING_DAY_WATER_BONUS_ML = 500;

/**
 * One glass — the increment the water row taps in. Lives here rather than in
 * the route because the Today screen draws the glasses and the API stores the
 * millilitres, and those two disagreeing would silently corrupt the count.
 */
export const GLASS_ML = 250;

/**
 * Macro splits the user can pick in onboarding, from the addendum spec.
 * `proteinGPerKg` is per kg of *bodyweight*; `fatPctKcal` is a share of the
 * daily target. Carbs are always the remainder, so the three always close.
 */
export interface MacroPresetDef {
  slug: MacroPreset;
  label: string;
  blurb: string;
  proteinGPerKg: number;
  fatPctKcal: number;
}

export const MACRO_PRESETS = [
  {
    slug: "balanced",
    label: "Balanced",
    blurb: "1.8 g/kg protein, 25% fat — the default for lifters",
    proteinGPerKg: 1.8,
    fatPctKcal: 0.25,
  },
  {
    slug: "high-protein",
    label: "High protein",
    blurb: "2.2 g/kg protein — hardest cut, most muscle kept",
    proteinGPerKg: 2.2,
    fatPctKcal: 0.25,
  },
  {
    slug: "low-carb",
    label: "Low carb",
    blurb: "2.0 g/kg protein, 40% fat, carbs take the hit",
    proteinGPerKg: 2.0,
    fatPctKcal: 0.4,
  },
] as const satisfies readonly MacroPresetDef[];

export type MacroPreset = "balanced" | "high-protein" | "low-carb" | "custom";

export const MACRO_PRESET_SLUGS = ["balanced", "high-protein", "low-carb", "custom"] as const;

export function macroPreset(slug: MacroPreset): MacroPresetDef {
  return MACRO_PRESETS.find((p) => p.slug === slug) ?? MACRO_PRESETS[0];
}

// ── rounding helpers used on both sides of the wire ───────────────────

/** Round to `dp` decimal places, avoiding 0.1+0.2 style drift in totals. */
export function round(value: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Macros are shown to one decimal; calories always whole. */
export function roundMacros(m: MacroTotals): MacroTotals {
  return {
    kcal: Math.round(m.kcal),
    proteinG: round(m.proteinG, 1),
    carbsG: round(m.carbsG, 1),
    fatG: round(m.fatG, 1),
    fiberG: round(m.fiberG, 1),
  };
}

export const ZERO_MACROS: MacroTotals = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
};

export function addMacros(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
    fiberG: a.fiberG + b.fiberG,
  };
}
