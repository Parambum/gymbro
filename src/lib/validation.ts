import { z } from "zod";
import { MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";
import { ACTIVITY_TYPES, ACTIVITY_SOURCES } from "@/lib/activity-types";

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

export const LogSetSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be yyyy-mm-dd"),
  exercise: z.string().trim().min(1).max(80),
  muscleGroup: z.enum(muscleSlugs),
  weight: z.number().min(0).max(2000),
  reps: z.number().int().min(1).max(300),
  setType: z.enum(["WARMUP", "WORKING", "DROP", "FAILURE"]).default("WORKING"),
  /** superset label (e.g. "A"), linking this set to others in the same group */
  supersetGroup: z.string().trim().max(2).optional().nullable(),
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

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LogSetInput = z.infer<typeof LogSetSchema>;
export type CustomExerciseInput = z.infer<typeof CustomExerciseSchema>;
export type OneRepMaxInput = z.infer<typeof OneRepMaxSchema>;
