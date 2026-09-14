import { z } from "zod";
import { MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";
import { ACTIVITY_TYPES, ACTIVITY_SOURCES } from "@/lib/activity-types";
import {
  ACTIVITY_SLUGS,
  DIET_PREFS,
  ENTRY_METHODS,
  GOALS,
  MACRO_PRESET_SLUGS,
  MEALS,
  SEXES,
  UNIT_SYSTEMS,
} from "@/lib/fuel/types";

const muscleSlugs = MUSCLE_GROUPS.map((g) => g.slug) as [string, ...string[]];

export const RegisterSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const CustomExerciseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  muscleGroup: z.enum(muscleSlugs),
});

export const LogSetSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be yyyy-mm-dd"),
    exercise: z.string().trim().min(1).max(80),
    muscleGroup: z.enum(muscleSlugs),
    /** how the set is measured: weight×reps, reps-only (bodyweight), or a hold */
    mode: z.enum(["weight-reps", "reps", "time"]).default("weight-reps"),
    weight: z.number().min(0).max(2000).default(0),
    reps: z.number().int().min(0).max(1000).default(0),
    durationSec: z.number().int().min(1).max(86_400).optional().nullable(),
    setType: z.enum(["WARMUP", "WORKING", "DROP", "FAILURE"]).default("WORKING"),
    /** superset label (e.g. "A"), linking this set to others in the same group */
    supersetGroup: z.string().trim().max(2).optional().nullable(),
  })
  .refine((v) => (v.mode === "time" ? (v.durationSec ?? 0) >= 1 : v.reps >= 1), {
    message: "Enter reps — or a hold time for timed exercises",
  });

export const OneRepMaxSchema = z.object({
  exercise: z.string().trim().min(1).max(80),
  oneRepMax: z.number().min(1).max(2000),
});

// ── cardio ──────────────────────────────────────────────────────────

/** A single GPS sample as posted from the client (GPX import or live track). */
const TrackPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ele: z.number().min(-500).max(9000).optional(),
  t: z.number().min(0).max(604_800).optional(),
});

/**
 * Creating an activity. Distance/time are always required — a route is not,
 * because a treadmill run is still a run. When `track` is present the server
 * recomputes distance, elevation and splits from it and ignores the client's
 * numbers, so a hand-edited payload can't invent a podium time.
 */
export const CreateActivitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  name: z.string().trim().min(1, "Give this effort a name").max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be yyyy-mm-dd"),
  startedAt: z.string().datetime().optional(),
  distanceM: z.number().min(1, "Distance is required").max(1_000_000),
  movingTimeS: z.number().int().min(1, "Duration is required").max(604_800),
  elapsedTimeS: z.number().int().min(0).max(604_800).optional(),
  elevationGainM: z.number().min(0).max(30_000).optional(),
  avgHeartRate: z.number().min(20).max(260).optional().nullable(),
  notes: z.string().trim().max(2000).optional(),
  source: z.enum(ACTIVITY_SOURCES).default("MANUAL"),
  /** full GPS track; server derives the stored route + splits from it */
  track: z.array(TrackPointSchema).max(200_000).optional(),
});

export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type TrackPointInput = z.infer<typeof TrackPointSchema>;

// ── fuel (nutrition module) ─────────────────────────────────────────

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be yyyy-mm-dd");

/**
 * Server-side truth for the onboarding answers (§9: client validates for UX,
 * server validates for correctness). Ranges reject the physically impossible —
 * a 0 kg bodyweight, a 300 cm height — with messages a person can read.
 *
 * `localDate` is the client's own calendar day, used for the first weight
 * reading and the target's effective date. It is never derived from a UTC
 * timestamp on the server, for the same reason /api/workouts doesn't.
 */
export const FuelProfileSchema = z.object({
  sex: z.enum(SEXES),
  birthDate: IsoDate,
  heightCm: z.number().min(80, "Height looks too low").max(250, "Height looks too high"),
  weightKg: z.number().min(20, "Weight looks too low").max(400, "Weight looks too high"),
  activityLevel: z.enum(ACTIVITY_SLUGS),
  goal: z.enum(GOALS),
  rateKgPerWeek: z.number().min(0).max(2).default(0),
  targetWeightKg: z.number().min(20).max(400).nullable().optional(),
  dietPref: z.enum(DIET_PREFS).default("veg"),
  macroPreset: z.enum(MACRO_PRESET_SLUGS).default("balanced"),
  units: z.enum(UNIT_SYSTEMS).default("metric"),
  tz: z.string().trim().min(1).max(64).default("Asia/Kolkata"),
  localDate: IsoDate,
})
  .refine((v) => ageBetween(v.birthDate, v.localDate, 13, 100), {
    message: "Enter a date of birth between 13 and 100 years ago",
    path: ["birthDate"],
  })
  // A goal weight that points the wrong way makes every projection nonsense.
  .refine((v) => v.goal !== "lose" || v.targetWeightKg == null || v.targetWeightKg < v.weightKg, {
    message: "A goal weight for losing should be below your current weight",
    path: ["targetWeightKg"],
  })
  .refine((v) => v.goal !== "gain" || v.targetWeightKg == null || v.targetWeightKg > v.weightKg, {
    message: "A goal weight for gaining should be above your current weight",
    path: ["targetWeightKg"],
  });

function ageBetween(birthDate: string, onDate: string, min: number, max: number): boolean {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ny, nm, nd] = onDate.split("-").map(Number);
  if (!by || !bm || !bd) return false;
  let age = ny - by;
  if (nm < bm || (nm === bm && nd < bd)) age -= 1;
  return age >= min && age <= max;
}

/**
 * A manual target override. The engine's numbers are a starting point, not a
 * verdict — but the §5.6 floors still apply, and the route re-checks them
 * rather than trusting these bounds alone.
 */
export const FuelTargetOverrideSchema = z.object({
  kcal: z.number().min(800).max(10_000),
  proteinG: z.number().min(0).max(600),
  carbsG: z.number().min(0).max(1500),
  fatG: z.number().min(0).max(600),
  fiberG: z.number().min(0).max(200).optional(),
  waterMl: z.number().min(0).max(10_000).optional(),
  localDate: IsoDate,
});

export const FuelSettingsSchema = z.object({
  eyesOffMode: z.boolean().optional(),
  exerciseCaloriesEnabled: z.boolean().optional(),
  calorieCyclingEnabled: z.boolean().optional(),
  dietPref: z.enum(DIET_PREFS).optional(),
  units: z.enum(UNIT_SYSTEMS).optional(),
  tz: z.string().trim().min(1).max(64).optional(),
});

/**
 * Logging a food from the database. The client sends *what* was eaten, never
 * *how many calories it was* — the server resolves grams from the portion and
 * recomputes every macro from the food's stored composition. A hand-edited
 * payload cannot invent a 10-calorie samosa.
 */
export const FuelLogFoodSchema = z.object({
  localDate: IsoDate,
  meal: z.enum(MEALS),
  foodId: z.string().regex(/^[a-f0-9]{24}$/i, "foodId must be an id"),
  portionId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i)
    .nullable()
    .optional(),
  quantity: z.number().positive("Enter how much you had").max(100, "That's a lot — split it up"),
  entryMethod: z.enum(ENTRY_METHODS).default("search"),
  /** Client-minted idempotency key; a repeat of the same key is a no-op. */
  clientId: z.string().trim().min(8).max(64).optional(),
});

/**
 * Quick-add: raw numbers with no food behind them, for when the user can't be
 * bothered to search. These macros *are* taken at face value — there is no
 * food to derive them from — so the bounds are the only guard, and the row is
 * marked `entryMethod: "quick"` so it is always distinguishable later.
 */
export const FuelQuickAddSchema = z.object({
  localDate: IsoDate,
  meal: z.enum(MEALS),
  foodName: z.string().trim().min(1, "Give it a name").max(160),
  kcal: z.number().min(0).max(20_000, "That can't be one entry"),
  proteinG: z.number().min(0).max(2000).default(0),
  carbsG: z.number().min(0).max(2000).default(0),
  fatG: z.number().min(0).max(2000).default(0),
  fiberG: z.number().min(0).max(500).default(0),
  clientId: z.string().trim().min(8).max(64).optional(),
});

export const FuelWeightSchema = z.object({
  localDate: IsoDate,
  weightKg: z.number().min(20, "Weight looks too low").max(400, "Weight looks too high"),
  note: z.string().trim().max(200).optional().nullable(),
});

export const FuelWaterSchema = z.object({
  localDate: IsoDate,
  /** Positive to drink, negative to undo a mis-tap. Absolute daily cap applies. */
  deltaMl: z.number().int().min(-5000).max(5000),
});

export type FuelLogFoodInput = z.infer<typeof FuelLogFoodSchema>;
export type FuelQuickAddInput = z.infer<typeof FuelQuickAddSchema>;
export type FuelWeightInput = z.infer<typeof FuelWeightSchema>;
export type FuelWaterInput = z.infer<typeof FuelWaterSchema>;

export type FuelProfileInput = z.infer<typeof FuelProfileSchema>;
export type FuelTargetOverrideInput = z.infer<typeof FuelTargetOverrideSchema>;
export type FuelSettingsInput = z.infer<typeof FuelSettingsSchema>;

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LogSetInput = z.infer<typeof LogSetSchema>;
export type CustomExerciseInput = z.infer<typeof CustomExerciseSchema>;
export type OneRepMaxInput = z.infer<typeof OneRepMaxSchema>;
