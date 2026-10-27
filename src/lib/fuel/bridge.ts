/**
 * The training ↔ nutrition bridge (§8) — GymBro's actual edge.
 *
 * A calorie tracker doesn't know what you squatted yesterday. This one does,
 * and these are the pure functions that make use of it: calorie cycling
 * around training days, an honest estimate of cardio burn, and the
 * correlation between what you ate and what you lifted.
 *
 * Everything here is pure and tested. Nothing here decides anything on the
 * user's behalf — §8.4 is explicit that suggestions are never auto-applied.
 */

import { ATWATER, round, type MacroTotals } from "./types";

// ── §8.1 calorie cycling ─────────────────────────────────────────────

export interface CycledTarget {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** True when this day got the training-day allocation. */
  isTrainingDay: boolean;
  /** One plain sentence for the UI, or null when cycling didn't apply. */
  note: string | null;
}

/** Training days get 10% more carbs; rest days fund it. */
const TRAINING_CARB_BOOST = 0.1;

/**
 * Redistribute a weekly calorie budget toward training days.
 *
 * The weekly total is held constant — this moves calories, it does not create
 * them. Carbs do the moving because they are what fuels the session; protein
 * and fat stay flat, since neither has a reason to swing with training.
 *
 * Degenerate weeks return the base target unchanged rather than dividing by
 * zero: if every day is a training day there are no rest days to take from,
 * and if none are, there is nothing to fund.
 */
export function cycleTarget(
  base: { kcal: number; proteinG: number; carbsG: number; fatG: number },
  isTrainingDay: boolean,
  trainingDaysPerWeek: number,
): CycledTarget {
  const training = Math.round(trainingDaysPerWeek);
  const rest = 7 - training;

  if (training <= 0 || rest <= 0) {
    return { ...base, isTrainingDay, note: null };
  }

  const extraCarbsG = base.carbsG * TRAINING_CARB_BOOST;
  const extraKcal = extraCarbsG * ATWATER.carbs;

  if (isTrainingDay) {
    return {
      kcal: Math.round(base.kcal + extraKcal),
      proteinG: base.proteinG,
      carbsG: Math.round(base.carbsG + extraCarbsG),
      fatG: base.fatG,
      isTrainingDay: true,
      note: `Training day — ${Math.round(extraCarbsG)} g extra carbs, taken from your rest days. Same total across the week.`,
    };
  }

  // Rest days share the cost of every training day's boost.
  const givenBackKcal = (extraKcal * training) / rest;
  const givenBackCarbsG = givenBackKcal / ATWATER.carbs;

  return {
    kcal: Math.round(base.kcal - givenBackKcal),
    proteinG: base.proteinG,
    carbsG: Math.max(0, Math.round(base.carbsG - givenBackCarbsG)),
    fatG: base.fatG,
    isTrainingDay: false,
    note: `Rest day — ${Math.round(givenBackCarbsG)} g fewer carbs, which is what funds your training days.`,
  };
}

// ── §8.2 exercise calories ───────────────────────────────────────────

/**
 * Rough energy cost of moving a body a given distance, in kcal per kg per km.
 *
 * These are **rules of thumb, not measurements**, and the UI says so wherever
 * the number appears. They are distance-based because distance and bodyweight
 * are the two things this app actually records — a heart-rate-derived figure
 * would be better and we do not have the data for one.
 *
 * Lifting is deliberately absent: the strength tracker records sets, not
 * session duration, so any figure for it would be invented rather than
 * estimated. The activity multiplier in the calorie engine already accounts
 * for training, which is the whole argument for leaving this off by default.
 */
export const KCAL_PER_KG_PER_KM: Record<string, number> = {
  RUN: 1.0,
  HIKE: 0.75,
  WALK: 0.5,
  RIDE: 0.28,
  SWIM: 3.0, // per km swum, which is far shorter than a run
};

export interface BurnableActivity {
  type: string;
  distanceM: number;
}

/**
 * Estimated kcal burned by the day's cardio, above resting metabolism.
 *
 * Returns 0 for anything unrecognised rather than guessing a coefficient —
 * a new activity type should read as "not counted", never as a number nobody
 * can justify.
 */
export function exerciseKcal(activities: readonly BurnableActivity[], weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;

  const total = activities.reduce((sum, a) => {
    const perKgKm = KCAL_PER_KG_PER_KM[a.type];
    if (!perKgKm || !Number.isFinite(a.distanceM) || a.distanceM <= 0) return sum;
    return sum + perKgKm * weightKg * (a.distanceM / 1000);
  }, 0);

  return Math.round(total);
}

// ── the day's target, with both of the above applied ────────────────

/**
 * The target a given day is actually judged against: the stored target, then
 * calorie cycling and cardio added back — each only behind its own toggle.
 *
 * The Today screen and the coach both read the day through this, so "how many
 * calories have I got left?" in the chat and the ring on the screen cannot
 * disagree.
 */
export function targetForDay<T extends { kcal: number; proteinG: number; carbsG: number; fatG: number }>(
  base: T,
  day: {
    calorieCycling: boolean;
    exerciseCalories: boolean;
    isTrainingDay: boolean;
    /** Sessions in the 7 days ending on this one — what cycling divides by. */
    trainingDaysLast7: number;
    activities: readonly BurnableActivity[];
    weightKg: number | null;
  },
): { target: T & Partial<CycledTarget>; notes: string[]; exerciseAddedKcal: number } {
  const notes: string[] = [];
  let target: T & Partial<CycledTarget> = base;

  if (day.calorieCycling) {
    const cycled = cycleTarget(target, day.isTrainingDay, day.trainingDaysLast7);
    if (cycled.note) notes.push(cycled.note);
    target = { ...target, ...cycled };
  }

  let exerciseAddedKcal = 0;
  if (day.exerciseCalories && day.weightKg) {
    exerciseAddedKcal = exerciseKcal(day.activities, day.weightKg);
    if (exerciseAddedKcal > 0) {
      target = { ...target, kcal: target.kcal + exerciseAddedKcal };
      notes.push(
        `+${exerciseAddedKcal} kcal added back from today's cardio. This is a rough estimate from distance and bodyweight, and it's the commonest way to eat more than you meant to.`,
      );
    }
  }

  return { target, notes, exerciseAddedKcal };
}

// ── §8.3 protein vs progress ─────────────────────────────────────────

export interface WeekSlice {
  /** Monday of the week, yyyy-mm-dd. */
  weekStart: string;
  avgProteinG: number | null;
  avgKcal: number | null;
  /** Working-set tonnage lifted that week, kg. */
  tonnageKg: number;
  daysLogged: number;
}

export interface ProteinVerdict {
  latestProteinPerKg: number | null;
  tonnageChangePct: number | null;
  /** A plain-language observation, or null when there isn't enough to say. */
  message: string | null;
}

/**
 * Correlate protein intake with training volume across weeks (§8.3).
 *
 * The bar for saying anything is deliberately high — two weeks of data and a
 * real tonnage move — because "your bench stalled because of protein" is a
 * strong claim and the data usually cannot support it. When the evidence is
 * thin this returns null and the UI stays quiet, which is the correct
 * behaviour far more often than a confident sentence would be.
 */
export function proteinVerdict(
  weeks: readonly WeekSlice[],
  bodyweightKg: number | null,
  proteinTargetPerKg = 1.8,
): ProteinVerdict {
  const usable = weeks.filter((w) => w.daysLogged >= 3 && w.avgProteinG != null);
  if (usable.length < 2 || !bodyweightKg || bodyweightKg <= 0) {
    return { latestProteinPerKg: null, tonnageChangePct: null, message: null };
  }

  const latest = usable[usable.length - 1];
  const previous = usable[usable.length - 2];

  const perKg = round(latest.avgProteinG! / bodyweightKg, 2);
  const tonnageChangePct =
    previous.tonnageKg > 0
      ? round(((latest.tonnageKg - previous.tonnageKg) / previous.tonnageKg) * 100, 1)
      : null;

  // Only speak up when protein is genuinely short AND volume isn't moving.
  const proteinShort = perKg < proteinTargetPerKg - 0.25;
  const volumeStalled = tonnageChangePct != null && tonnageChangePct <= 1;

  let message: string | null = null;
  if (proteinShort && volumeStalled && latest.tonnageKg > 0) {
    message = `Protein averaged ${perKg} g/kg last week and your volume didn't move. ${Math.round(
      proteinTargetPerKg * bodyweightKg,
    )} g a day is the target — worth closing that gap before changing the programme.`;
  } else if (proteinShort) {
    message = `Protein averaged ${perKg} g/kg last week, under the ${proteinTargetPerKg} g/kg you're aiming for.`;
  } else if (tonnageChangePct != null && tonnageChangePct > 5) {
    message = `Volume up ${tonnageChangePct}% on last week, with protein at ${perKg} g/kg. That's working.`;
  }

  return { latestProteinPerKg: perKg, tonnageChangePct, message };
}
