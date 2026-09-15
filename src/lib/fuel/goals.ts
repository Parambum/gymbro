/**
 * What people actually say they want.
 *
 * The calorie engine speaks in lose / maintain / gain, which is correct and
 * also not how anybody describes their goal. Nobody walks into a gym wanting
 * to "gain at 0.3 kg per week" — they want to get lean, or tone up, or put on
 * size. This is the translation layer between those two vocabularies.
 *
 * Deliberately a mapping rather than a rewrite: `engine.ts` is tested and
 * correct, and every goal here resolves to inputs it already understands. A
 * new goal is a row in this table, not a change to the maths.
 *
 * Rates are fractions of bodyweight per week, so they scale with the person
 * and stay inside the §5.3 caps (0.75 % loss, 0.35 % gain) by construction.
 */

import type { Goal, MacroPreset } from "./types";

export const FITNESS_GOALS = [
  "lose-fat",
  "get-lean",
  "tone-up",
  "build-muscle",
  "get-strong",
  "maintain",
] as const;

export type FitnessGoal = (typeof FITNESS_GOALS)[number];

/** How hard the programme leans, which the workout generator reads. */
export type TrainingEmphasis = "hypertrophy" | "strength" | "balanced" | "conditioning";

export interface FitnessGoalDef {
  slug: FitnessGoal;
  label: string;
  /** One line, in the user's words, not ours. */
  blurb: string;
  /** What the calorie engine should actually do. */
  engineGoal: Goal;
  /** Fraction of bodyweight per week. 0 for maintenance. */
  rateFraction: number;
  macroPreset: MacroPreset;
  emphasis: TrainingEmphasis;
  /** Sets per muscle per week the programme aims for. */
  weeklySetsPerMuscle: number;
  /** Shown on the plan so the goal's trade-off is never a surprise. */
  expectation: string;
}

export const GOAL_LIST: FitnessGoalDef[] = [
  {
    slug: "lose-fat",
    label: "Lose fat",
    blurb: "Drop weight without losing the muscle you have.",
    engineGoal: "lose",
    rateFraction: 0.0065,
    macroPreset: "high-protein",
    emphasis: "balanced",
    weeklySetsPerMuscle: 12,
    expectation:
      "Expect the scale to move within 2–3 weeks. Strength should hold roughly steady — if it drops fast, the deficit is too aggressive.",
  },
  {
    slug: "get-lean",
    label: "Get lean",
    blurb: "Visible definition. A slower cut that protects performance.",
    engineGoal: "lose",
    rateFraction: 0.004,
    macroPreset: "high-protein",
    emphasis: "hypertrophy",
    weeklySetsPerMuscle: 14,
    expectation:
      "Slower than a straight cut on purpose — roughly half the rate, in exchange for keeping your lifts and looking like you train.",
  },
  {
    slug: "tone-up",
    label: "Tone up",
    blurb: "Lose a bit of fat and build a bit of muscle at the same time.",
    engineGoal: "maintain",
    rateFraction: 0,
    macroPreset: "high-protein",
    emphasis: "hypertrophy",
    weeklySetsPerMuscle: 14,
    expectation:
      "The scale may barely move for weeks, and that is the plan working — you're trading fat for muscle. Judge this one on the mirror, the tape and your lifts, not bodyweight.",
  },
  {
    slug: "build-muscle",
    label: "Build muscle",
    blurb: "Put on size, with as little fat as you can get away with.",
    engineGoal: "gain",
    rateFraction: 0.0025,
    macroPreset: "balanced",
    emphasis: "hypertrophy",
    weeklySetsPerMuscle: 16,
    expectation:
      "Slow on purpose. Gaining faster than about 0.35 % of bodyweight a week is mostly fat, and you only have to diet it off again later.",
  },
  {
    slug: "get-strong",
    label: "Get stronger",
    blurb: "Move heavier weight. Size is a side effect.",
    engineGoal: "gain",
    rateFraction: 0.0015,
    macroPreset: "balanced",
    emphasis: "strength",
    weeklySetsPerMuscle: 12,
    expectation:
      "Progress is measured on the bar, not the scale. Expect fewer reps, heavier sets and longer rests than a muscle-building block.",
  },
  {
    slug: "maintain",
    label: "Maintain",
    blurb: "Hold where you are and keep training well.",
    engineGoal: "maintain",
    rateFraction: 0,
    macroPreset: "balanced",
    emphasis: "balanced",
    weeklySetsPerMuscle: 12,
    expectation:
      "Targets sit at your measured burn. Weight should stay inside a kilo or so either way — drift beyond that and the estimate will correct itself.",
  },
];

export function goalDef(slug: FitnessGoal): FitnessGoalDef {
  return GOAL_LIST.find((g) => g.slug === slug) ?? GOAL_LIST[GOAL_LIST.length - 1];
}

/**
 * Translate a stated goal into the calorie engine's inputs.
 *
 * The rate comes out in kg/week so the engine can apply its own safety caps
 * to it — this layer proposes, `engine.ts` still decides.
 */
export function engineInputsFor(slug: FitnessGoal, weightKg: number) {
  const def = goalDef(slug);
  return {
    goal: def.engineGoal,
    rateKgPerWeek: Math.round(def.rateFraction * weightKg * 100) / 100,
    macroPreset: def.macroPreset,
  };
}

// ── experience & equipment, which the programme generator needs ───────

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export interface ExperienceDef {
  slug: Experience;
  label: string;
  blurb: string;
  /** Exercises per session — beginners do fewer things, more often. */
  exercisesPerSession: number;
  /** Working sets per exercise. */
  setsPerExercise: number;
  /** How much to add when progression triggers, as a fraction of the load. */
  progressionStep: number;
}

export const EXPERIENCE_LIST: ExperienceDef[] = [
  {
    slug: "beginner",
    label: "New to this",
    blurb: "Under 6 months of consistent lifting, or starting again.",
    exercisesPerSession: 5,
    setsPerExercise: 3,
    // Beginners add load fast because they're still learning the movement.
    progressionStep: 0.05,
  },
  {
    slug: "intermediate",
    label: "Been training a while",
    blurb: "6 months to a couple of years. You know the lifts.",
    exercisesPerSession: 6,
    setsPerExercise: 3,
    progressionStep: 0.025,
  },
  {
    slug: "advanced",
    label: "Experienced",
    blurb: "Years in. You know your numbers and your weak points.",
    exercisesPerSession: 7,
    setsPerExercise: 4,
    progressionStep: 0.015,
  },
];

export function experienceDef(slug: Experience): ExperienceDef {
  return EXPERIENCE_LIST.find((e) => e.slug === slug) ?? EXPERIENCE_LIST[0];
}

export const EQUIPMENT_OPTIONS = ["full-gym", "dumbbells", "bodyweight"] as const;
export type Equipment = (typeof EQUIPMENT_OPTIONS)[number];

export const EQUIPMENT_LIST: Array<{ slug: Equipment; label: string; blurb: string }> = [
  { slug: "full-gym", label: "Full gym", blurb: "Barbells, machines, cables, the lot." },
  { slug: "dumbbells", label: "Dumbbells only", blurb: "Home setup with adjustable dumbbells." },
  { slug: "bodyweight", label: "Bodyweight", blurb: "No equipment. Bands or a bar if you have one." },
];
