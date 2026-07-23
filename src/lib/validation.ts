import { z } from "zod";
import { MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";

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

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LogSetInput = z.infer<typeof LogSetSchema>;
export type CustomExerciseInput = z.infer<typeof CustomExerciseSchema>;
export type OneRepMaxInput = z.infer<typeof OneRepMaxSchema>;
