/**
 * Adaptive TDEE — learning your actual metabolism from your own data.
 *
 * Every calorie app starts you on Mifflin-St Jeor: a population average
 * derived from height, weight, age and a lifestyle multiplier you guessed at.
 * It is a reasonable day-one estimate and a liability by week four, because
 * nothing ever tells it that it was wrong.
 *
 * Energy balance does tell us. Over any window:
 *
 *     energy in − energy out = change in body energy stores
 *     TDEE = mean daily intake − (daily change in stores)
 *
 * with ~7700 kcal per kg of body mass. So a person eating 2,000 kcal and
 * losing 0.1 kg/day is burning about 2,770 — regardless of what any formula
 * predicted, and regardless of whether they hit their target. That last part
 * matters: this reads *intake*, not obedience. A week of overshooting the
 * target doesn't corrupt the estimate; it's just more data.
 *
 * What it cannot survive is unlogged food. Intake has to be roughly complete
 * for the arithmetic to mean anything, which is why `confidence` is derived
 * from how consistently the window was logged and reported honestly rather
 * than hidden.
 *
 * Pure, so it is tested without a database.
 */

import { daysBetween, leastSquares } from "@/lib/math/regression";
import { KCAL_PER_KG_FAT, round } from "./types";
import type { TrendPoint } from "./trend";

export interface IntakeDay {
  /** yyyy-mm-dd */
  date: string;
  kcal: number;
}

export type Confidence = "none" | "low" | "medium" | "high";

export interface AdaptiveEstimate {
  /** Best estimate of daily burn, or null when the data can't support one. */
  tdee: number | null;
  confidence: Confidence;
  /** Days in the window that actually had food logged. */
  loggedDays: number;
  /** Calendar span the window covers. */
  spanDays: number;
  /** Mean daily intake across the logged days. */
  avgIntakeKcal: number | null;
  /** Measured change in the weight trend, kg per week. */
  weeklyChangeKg: number | null;
  /** What the formula predicted, for comparison. */
  formulaTdee: number | null;
  /** How far the measurement moved the estimate off the formula. */
  deltaVsFormula: number | null;
  /** One plain sentence for the UI. Never a scold. */
  note: string | null;
}

/** Below this many logged days in the window, say nothing. */
const MIN_LOGGED_DAYS = 10;
/** And the window has to span at least this long, or the trend is noise. */
const MIN_SPAN_DAYS = 14;
/** A plausible human range; anything outside it means the data is wrong. */
const MIN_PLAUSIBLE_TDEE = 800;
const MAX_PLAUSIBLE_TDEE = 8000;

/**
 * Estimate daily burn from intake and the weight trend.
 *
 * `formulaTdee` is not just for display: while the data is thin the answer is
 * a weighted blend of measurement and formula, so the number the user sees
 * moves toward the truth gradually instead of lurching on day ten. Once the
 * window is properly logged the formula's weight falls to nothing.
 */
export function estimateAdaptiveTdee(
  intake: readonly IntakeDay[],
  trend: readonly TrendPoint[],
  formulaTdee: number | null,
  windowDays = 28,
): AdaptiveEstimate {
  const empty: AdaptiveEstimate = {
    tdee: null,
    confidence: "none",
    loggedDays: 0,
    spanDays: 0,
    avgIntakeKcal: null,
    weeklyChangeKg: null,
    formulaTdee,
    deltaVsFormula: null,
    note: null,
  };

  const logged = intake.filter((d) => d.kcal > 0).sort((a, b) => a.date.localeCompare(b.date));

  // Day one. Say what's needed rather than returning a silent null — "—" with
  // no explanation reads as broken, not as "not yet".
  if (logged.length === 0 || trend.length < 2) {
    return {
      ...empty,
      loggedDays: logged.length,
      note:
        trend.length < 2
          ? "Weigh in a few more times and this starts reading your real burn instead of a formula."
          : `${MIN_LOGGED_DAYS - logged.length} more logged days and this starts reading your real burn instead of a formula.`,
    };
  }

  const last = logged[logged.length - 1].date;
  const window = logged.filter((d) => daysBetween(d.date, last) <= windowDays);
  const spanDays = window.length > 0 ? daysBetween(window[0].date, last) + 1 : 0;

  const avgIntakeKcal =
    window.length > 0 ? Math.round(window.reduce((s, d) => s + d.kcal, 0) / window.length) : null;

  // Weight trend across the same window, from the smoothed series.
  const trendWindow = trend.filter((p) => daysBetween(p.date, last) <= windowDays);
  if (window.length < MIN_LOGGED_DAYS || spanDays < MIN_SPAN_DAYS || trendWindow.length < 2) {
    return {
      ...empty,
      loggedDays: window.length,
      spanDays,
      avgIntakeKcal,
      note: notEnoughYet(window.length, spanDays),
    };
  }

  const origin = trendWindow[0].date;
  const model = leastSquares(
    trendWindow.map((p) => ({ x: daysBetween(origin, p.date), y: p.trendKg })),
  );
  const kgPerDay = model.slope;
  const weeklyChangeKg = round(kgPerDay * 7, 2);

  // The whole thing, in one line.
  const measured = avgIntakeKcal! - kgPerDay * KCAL_PER_KG_FAT;

  if (!Number.isFinite(measured) || measured < MIN_PLAUSIBLE_TDEE || measured > MAX_PLAUSIBLE_TDEE) {
    return {
      ...empty,
      loggedDays: window.length,
      spanDays,
      avgIntakeKcal,
      weeklyChangeKg,
      note: "The numbers don't add up yet — usually that means some days went unlogged. Keep going and this settles.",
    };
  }

  const confidence = confidenceFor(window.length, spanDays);

  // Blend toward the formula while the evidence is thin. At "high" the
  // formula contributes nothing.
  const measuredWeight = confidence === "high" ? 1 : confidence === "medium" ? 0.75 : 0.5;
  const tdee =
    formulaTdee != null
      ? Math.round(measured * measuredWeight + formulaTdee * (1 - measuredWeight))
      : Math.round(measured);

  const deltaVsFormula = formulaTdee != null ? Math.round(tdee - formulaTdee) : null;

  return {
    tdee,
    confidence,
    loggedDays: window.length,
    spanDays,
    avgIntakeKcal,
    weeklyChangeKg,
    formulaTdee,
    deltaVsFormula,
    note: describe(deltaVsFormula, confidence),
  };
}

function confidenceFor(loggedDays: number, spanDays: number): Confidence {
  const coverage = spanDays > 0 ? loggedDays / spanDays : 0;
  if (loggedDays >= 21 && coverage >= 0.8) return "high";
  if (loggedDays >= 14 && coverage >= 0.65) return "medium";
  return "low";
}

function notEnoughYet(loggedDays: number, spanDays: number): string {
  const needDays = Math.max(0, MIN_LOGGED_DAYS - loggedDays);
  const needSpan = Math.max(0, MIN_SPAN_DAYS - spanDays);
  if (needDays > 0) {
    return `${needDays} more logged ${needDays === 1 ? "day" : "days"} and this starts reading your real burn instead of a formula.`;
  }
  if (needSpan > 0) {
    return `Give it about ${needSpan} more ${needSpan === 1 ? "day" : "days"} — a shorter window is mostly water weight.`;
  }
  return "Still gathering data.";
}

/**
 * The finding, stated as a fact. There is no version of this that implies the
 * user did something wrong: a metabolism that differs from the formula is
 * information, not a failure.
 */
function describe(delta: number | null, confidence: Confidence): string {
  if (delta == null) return "Worked out from what you ate and what the scale did.";

  const hedge = confidence === "high" ? "" : " Still firming up, so it may drift a little.";

  if (Math.abs(delta) < 75) {
    return `Your measured burn is within ${Math.abs(delta)} kcal of the formula estimate — unusually close.${hedge}`;
  }
  if (delta > 0) {
    return `You burn about ${delta} kcal a day more than the formula assumed. That gap is why a "correct" deficit can feel like nothing is happening.${hedge}`;
  }
  return `You burn about ${Math.abs(delta)} kcal a day less than the formula assumed — common, and worth knowing before blaming the plan.${hedge}`;
}

/**
 * Should the stored target be refreshed?
 *
 * Weekly, like MacroFactor, and only on a confident estimate that has actually
 * moved. Re-writing the target every day would make the number feel unstable
 * and invalidate the cached history for no benefit; chasing a ±20 kcal drift
 * would be noise dressed up as precision.
 */
export function shouldRefreshTarget(
  estimate: AdaptiveEstimate,
  currentTargetTdee: number | null,
  daysSinceLastRefresh: number,
): boolean {
  if (estimate.tdee == null) return false;
  if (estimate.confidence === "low" || estimate.confidence === "none") return false;
  if (daysSinceLastRefresh < 7) return false;
  if (currentTargetTdee == null) return true;
  return Math.abs(estimate.tdee - currentTargetTdee) >= 50;
}
