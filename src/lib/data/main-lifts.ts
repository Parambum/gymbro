import type { MuscleGroupSlug } from "@/lib/data/exercise-catalog";

/**
 * The compound "main lifts" GymBro tracks a *recorded* 1-rep max for — an
 * actual tested single, not an Epley estimate. Exercise names must match
 * the base catalog exactly (sets store the exercise by name).
 */
export interface MainLift {
  exercise: string;
  muscleGroup: MuscleGroupSlug;
  short: string;
  order: number;
}

export const MAIN_LIFTS: MainLift[] = [
  { exercise: "Flat Dumbbell Bench Press", muscleGroup: "chest", short: "DB Bench Press", order: 1 },
  { exercise: "Flat Barbell Bench Press", muscleGroup: "chest", short: "Barbell Bench", order: 2 },
  { exercise: "Barbell Back Squat", muscleGroup: "quads", short: "Squat", order: 3 },
  { exercise: "Barbell Bent-Over Row", muscleGroup: "back", short: "Barbell Row", order: 4 },
  { exercise: "Conventional Deadlift", muscleGroup: "back", short: "Deadlift", order: 5 },
];

const BY_NAME = new Map(MAIN_LIFTS.map((l) => [l.exercise, l]));

export const isMainLift = (exercise: string): boolean => BY_NAME.has(exercise);
export const mainLift = (exercise: string): MainLift | undefined => BY_NAME.get(exercise);

/** Main lifts whose muscle group is in the given set of slugs (dashboard filter). */
export function mainLiftsForMuscles(slugs: Iterable<string>): MainLift[] {
  const set = new Set(slugs);
  return MAIN_LIFTS.filter((l) => set.has(l.muscleGroup)).sort((a, b) => a.order - b.order);
}

export const MAIN_LIFT_NAMES = MAIN_LIFTS.map((l) => l.exercise);
