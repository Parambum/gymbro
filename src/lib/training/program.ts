/**
 * Programme generation.
 *
 * Builds a week of training from four inputs: the goal, how experienced the
 * lifter is, what equipment they can reach, and how many days they'll
 * actually show up. Everything else — split, exercise selection, set and rep
 * schemes, rest — falls out of those.
 *
 * Pure, and built on the exercise catalog the strength tracker already ships,
 * so a generated session logs through exactly the same click-to-log flow as
 * anything the user writes themselves. No parallel exercise list, no special
 * case in the logger.
 *
 * The catalog stores exercises as names with no equipment metadata, so
 * equipment is inferred from the name. That is a heuristic and it is written
 * down as one — `classifyEquipment` is the single place to fix a miss.
 */

import { MUSCLE_GROUPS, type MuscleGroupSlug } from "@/lib/data/exercise-catalog";
import {
  experienceDef,
  goalDef,
  type Equipment,
  type Experience,
  type FitnessGoal,
  type TrainingEmphasis,
} from "@/lib/fuel/goals";

// ── equipment inference ──────────────────────────────────────────────

/**
 * What you need to perform a movement, guessed from its name.
 *
 * Ordering matters: "Smith Machine Flat Bench" contains both "smith" and
 * "bench", and the barbell/machine check has to win. Anything unrecognised
 * is treated as gym equipment rather than bodyweight — the conservative
 * direction, since offering a bodyweight-only user a lift they cannot do is
 * worse than omitting one they could.
 */
export function classifyEquipment(exercise: string): Equipment {
  const n = exercise.toLowerCase();

  const bodyweight = [
    "push-up",
    "pull-up",
    "chin-up",
    "dips",
    "plank",
    "crunch",
    "sit-up",
    "leg raise",
    "mountain climber",
    "burpee",
    "bodyweight",
    "air squat",
    "lunge (bodyweight)",
    "glute bridge",
    "hollow",
    "superman",
    "calf raise (bodyweight)",
    "nordic",
    "pistol",
  ];
  const needsGym = [
    "barbell",
    "machine",
    "cable",
    "smith",
    "lat pulldown",
    "pulldown",
    "leg press",
    "pec deck",
    "hack squat",
    "t-bar",
    "landmine",
    "ez bar",
    "ez-bar",
    "preacher",
    "seated row",
    "chest press",
    "leg extension",
    "leg curl",
    "hip thrust",
    "crossover",
  ];

  if (needsGym.some((k) => n.includes(k))) return "full-gym";
  if (n.includes("dumbbell") || n.includes("kettlebell")) return "dumbbells";
  if (bodyweight.some((k) => n.includes(k))) return "bodyweight";
  return "full-gym";
}

/** Can this movement be done with what the user has? */
export function availableWith(exercise: string, have: Equipment): boolean {
  const needs = classifyEquipment(exercise);
  if (have === "full-gym") return true;
  if (have === "dumbbells") return needs === "dumbbells" || needs === "bodyweight";
  return needs === "bodyweight";
}

// ── splits ───────────────────────────────────────────────────────────

export interface SessionTemplate {
  name: string;
  /** Muscle groups this session covers, in the order they should be trained. */
  muscles: MuscleGroupSlug[];
}

/**
 * Which split for how many days.
 *
 * Fewer days means each session has to cover more of the body, or muscles go
 * a week between stimuli. More days lets each session narrow and go harder.
 * Compound-first ordering within a session is deliberate: the heaviest work
 * happens while you're fresh.
 */
export function splitFor(daysPerWeek: number): SessionTemplate[] {
  const days = Math.min(Math.max(Math.round(daysPerWeek), 2), 6);

  if (days <= 2) {
    return [
      { name: "Full body A", muscles: ["quads", "chest", "back", "shoulders", "abs"] },
      { name: "Full body B", muscles: ["hams-glutes", "back", "chest", "biceps", "triceps"] },
    ];
  }
  if (days === 3) {
    return [
      { name: "Full body A", muscles: ["quads", "chest", "back", "shoulders"] },
      { name: "Full body B", muscles: ["hams-glutes", "back", "chest", "abs"] },
      { name: "Full body C", muscles: ["quads", "shoulders", "biceps", "triceps"] },
    ];
  }
  if (days === 4) {
    return [
      { name: "Upper A", muscles: ["chest", "back", "shoulders", "triceps", "biceps"] },
      { name: "Lower A", muscles: ["quads", "hams-glutes", "calves", "abs"] },
      { name: "Upper B", muscles: ["back", "chest", "shoulders", "biceps", "triceps"] },
      { name: "Lower B", muscles: ["hams-glutes", "quads", "calves", "abs"] },
    ];
  }
  if (days === 5) {
    return [
      { name: "Push", muscles: ["chest", "shoulders", "triceps"] },
      { name: "Pull", muscles: ["back", "traps", "biceps"] },
      { name: "Legs", muscles: ["quads", "hams-glutes", "calves"] },
      { name: "Upper", muscles: ["chest", "back", "shoulders", "biceps", "triceps"] },
      { name: "Lower + core", muscles: ["hams-glutes", "quads", "calves", "abs"] },
    ];
  }
  return [
    { name: "Push A", muscles: ["chest", "shoulders", "triceps"] },
    { name: "Pull A", muscles: ["back", "traps", "biceps"] },
    { name: "Legs A", muscles: ["quads", "hams-glutes", "calves"] },
    { name: "Push B", muscles: ["shoulders", "chest", "triceps"] },
    { name: "Pull B", muscles: ["back", "biceps", "forearms"] },
    { name: "Legs B", muscles: ["hams-glutes", "quads", "abs"] },
  ];
}

// ── set and rep schemes ──────────────────────────────────────────────

export interface Scheme {
  repsLow: number;
  repsHigh: number;
  restSeconds: number;
  /** Reps in reserve to leave on a working set. */
  rir: number;
}

export function schemeFor(emphasis: TrainingEmphasis, isCompound: boolean): Scheme {
  if (emphasis === "strength") {
    return isCompound
      ? { repsLow: 3, repsHigh: 6, restSeconds: 210, rir: 2 }
      : { repsLow: 6, repsHigh: 10, restSeconds: 120, rir: 2 };
  }
  if (emphasis === "conditioning") {
    return { repsLow: 12, repsHigh: 20, restSeconds: 60, rir: 1 };
  }
  if (emphasis === "hypertrophy") {
    return isCompound
      ? { repsLow: 6, repsHigh: 10, restSeconds: 150, rir: 2 }
      : { repsLow: 10, repsHigh: 15, restSeconds: 90, rir: 1 };
  }
  return isCompound
    ? { repsLow: 5, repsHigh: 8, restSeconds: 180, rir: 2 }
    : { repsLow: 8, repsHigh: 12, restSeconds: 90, rir: 2 };
}

/** Multi-joint movements, which lead a session and take the longest rests. */
const COMPOUND_HINTS = [
  "squat",
  "deadlift",
  "bench",
  "press",
  "row",
  "pull-up",
  "chin-up",
  "pulldown",
  "dip",
  "lunge",
  "hip thrust",
  "clean",
  "thruster",
  "leg press",
];

export function isCompound(exercise: string): boolean {
  const n = exercise.toLowerCase();
  if (n.includes("fly") || n.includes("raise") || n.includes("curl") || n.includes("extension")) {
    return false;
  }
  return COMPOUND_HINTS.some((k) => n.includes(k));
}

// ── the generated programme ──────────────────────────────────────────

export interface PlannedExercise {
  exercise: string;
  muscleGroup: MuscleGroupSlug;
  sets: number;
  repsLow: number;
  repsHigh: number;
  restSeconds: number;
  rir: number;
  compound: boolean;
}

export interface PlannedSession {
  name: string;
  exercises: PlannedExercise[];
  estimatedMinutes: number;
}

export interface Programme {
  goal: FitnessGoal;
  experience: Experience;
  equipment: Equipment;
  daysPerWeek: number;
  emphasis: TrainingEmphasis;
  sessions: PlannedSession[];
  /** Total working sets per muscle across the week, for an honest volume check. */
  weeklySetsByMuscle: Record<string, number>;
  notes: string[];
}

/**
 * Deterministic pick so the same inputs always produce the same programme.
 *
 * A user who regenerates their plan expecting to change one answer should not
 * get a completely different week back; randomness here would read as the app
 * being unserious.
 */
function pickExercises(
  muscle: MuscleGroupSlug,
  equipment: Equipment,
  count: number,
  offset: number,
): string[] {
  const group = MUSCLE_GROUPS.find((g) => g.slug === muscle);
  if (!group) return [];

  const usable = group.exercises.filter((e) => availableWith(e, equipment));
  if (usable.length === 0) return [];

  // Compounds first — heaviest work while fresh.
  const ordered = [...usable].sort((a, b) => Number(isCompound(b)) - Number(isCompound(a)));

  const picked: string[] = [];
  for (let i = 0; i < Math.min(count, ordered.length); i++) {
    picked.push(ordered[(offset + i) % ordered.length]);
  }
  return picked;
}

export function generateProgramme(input: {
  goal: FitnessGoal;
  experience: Experience;
  equipment: Equipment;
  daysPerWeek: number;
  sessionMinutes?: number;
}): Programme {
  const goal = goalDef(input.goal);
  const level = experienceDef(input.experience);
  const split = splitFor(input.daysPerWeek);
  const notes: string[] = [];

  // Time is a real constraint: roughly 4 minutes per working set once you
  // count rest. Trim the session rather than pretend it fits.
  const minutes = input.sessionMinutes ?? 60;
  const setBudget = Math.max(9, Math.floor(minutes / 4));

  const sessions: PlannedSession[] = split.map((template, dayIndex) => {
    const exercises: PlannedExercise[] = [];
    let setsUsed = 0;

    // One exercise per muscle first, then second movements for the muscles
    // this session leads with, until the session is full.
    const rounds = Math.ceil(level.exercisesPerSession / Math.max(template.muscles.length, 1));

    for (let round = 0; round < rounds; round++) {
      for (const [muscleIndex, muscle] of template.muscles.entries()) {
        if (exercises.length >= level.exercisesPerSession) break;
        if (setsUsed + level.setsPerExercise > setBudget) break;

        // Offset by day and round so the week isn't the same five movements.
        const [name] = pickExercises(muscle, input.equipment, 1, dayIndex + round * 3 + muscleIndex);
        if (!name || exercises.some((e) => e.exercise === name)) continue;

        const compound = isCompound(name);
        const scheme = schemeFor(goal.emphasis, compound);
        exercises.push({
          exercise: name,
          muscleGroup: muscle,
          sets: level.setsPerExercise,
          ...scheme,
          compound,
        });
        setsUsed += level.setsPerExercise;
      }
    }

    return {
      name: template.name,
      exercises,
      estimatedMinutes: Math.round(setsUsed * 4),
    };
  });

  // ── weekly volume, reported honestly ────────────────────────────────
  const weeklySetsByMuscle: Record<string, number> = {};
  for (const session of sessions) {
    for (const ex of session.exercises) {
      weeklySetsByMuscle[ex.muscleGroup] = (weeklySetsByMuscle[ex.muscleGroup] ?? 0) + ex.sets;
    }
  }

  const trained = Object.keys(weeklySetsByMuscle);
  const thin = trained.filter((m) => weeklySetsByMuscle[m] < goal.weeklySetsPerMuscle * 0.6);
  if (thin.length > 0 && input.daysPerWeek <= 3) {
    notes.push(
      `On ${input.daysPerWeek} days a week, some muscles get fewer sets than ideal for this goal. That's the trade for a schedule you'll actually keep — add a day when you can.`,
    );
  }

  if (input.equipment === "bodyweight") {
    notes.push(
      "Bodyweight only, so load goes up through reps, tempo and harder variations rather than plates. Progress still comes from doing more than last time.",
    );
  }

  if (goal.emphasis === "strength") {
    notes.push(
      "Strength block: heavier, fewer reps, longer rests. Sessions take longer than they look — the rest is the work.",
    );
  }

  return {
    goal: input.goal,
    experience: input.experience,
    equipment: input.equipment,
    daysPerWeek: split.length,
    emphasis: goal.emphasis,
    sessions,
    weeklySetsByMuscle,
    notes,
  };
}

// ── progressive overload ─────────────────────────────────────────────

export interface ProgressionAdvice {
  action: "add-load" | "add-reps" | "hold" | "deload";
  /** Suggested next working weight, when load should go up. */
  nextWeightKg: number | null;
  message: string;
}

/**
 * What to do next on a lift, from what was actually logged (§8-style: the
 * programme reads your history rather than a fixed percentage chart).
 *
 * The rule is double progression — work up the rep range at a given load,
 * and only add weight once the top of the range is reached across all sets.
 * It is the most reliable scheme for everyone below advanced, and it fails
 * safe: a bad session holds rather than pushes.
 */
export function nextProgression(
  planned: PlannedExercise,
  lastSession: { weightKg: number; reps: number[] } | null,
  experience: Experience,
): ProgressionAdvice {
  const level = experienceDef(experience);

  if (!lastSession || lastSession.reps.length === 0) {
    return {
      action: "add-reps",
      nextWeightKg: null,
      message: `Start at a weight you could do ${planned.repsHigh + 2} times, and stop at ${planned.repsHigh}.`,
    };
  }

  const allAtTop = lastSession.reps.every((r) => r >= planned.repsHigh);
  const anyBelowBottom = lastSession.reps.some((r) => r < planned.repsLow);

  if (allAtTop) {
    const step = Math.max(2.5, Math.round(lastSession.weightKg * level.progressionStep * 2) / 2);
    return {
      action: "add-load",
      nextWeightKg: Math.round((lastSession.weightKg + step) * 2) / 2,
      message: `You hit ${planned.repsHigh} on every set. Add ${step} kg and drop back to ${planned.repsLow}.`,
    };
  }

  if (anyBelowBottom) {
    // Two-plus sessions under the floor is a signal, not a bad day — but one
    // is. Hold rather than deload on a single miss.
    return {
      action: "hold",
      nextWeightKg: lastSession.weightKg,
      message: `Same weight again. Get all sets to ${planned.repsLow} before adding anything.`,
    };
  }

  return {
    action: "add-reps",
    nextWeightKg: lastSession.weightKg,
    message: `Same weight, one more rep than last time — ${planned.repsHigh} across the board unlocks the next jump.`,
  };
}
