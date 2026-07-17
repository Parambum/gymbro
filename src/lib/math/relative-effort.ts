/**
 * Relative Effort — Strava-style training impulse from duration + heart rate.
 *
 * Two estimators, best available wins:
 *   1. Zone-weighted (preferred): minutes in each HR zone × zone weight.
 *   2. Banister TRIMP from average HR when only an avg BPM was captured:
 *        TRIMP = minutes · HRr · 0.64 · e^(1.92 · HRr)
 *      where HRr = (avgHr − restHr) / (maxHr − restHr), clamped to [0, 1].
 *
 * Both are scaled so an easy 30-min jog lands ~25–35 and a brutal
 * interval hour lands 150+ — comparable across activities.
 */

export interface HrProfile {
  restHr: number;
  maxHr: number;
}

export const DEFAULT_HR_PROFILE: HrProfile = { restHr: 60, maxHr: 190 };

/** Zone weights indexed Z1..Z5 (recovery → redline). */
const ZONE_WEIGHTS = [1, 2, 4, 7, 10] as const;

/** Scale factor aligning TRIMP with the zone estimator's range. */
const TRIMP_SCALE = 1.35;

export interface HrZone {
  zone: 1 | 2 | 3 | 4 | 5;
  /** inclusive lower bound, BPM */
  fromBpm: number;
  /** exclusive upper bound, BPM (Infinity for Z5) */
  toBpm: number;
  label: string;
}

/** Karvonen zone boundaries at 50/60/70/80/90% of heart-rate reserve. */
export function hrZones(profile: HrProfile = DEFAULT_HR_PROFILE): HrZone[] {
  const { restHr, maxHr } = profile;
  const reserve = maxHr - restHr;
  const at = (pct: number) => Math.round(restHr + reserve * pct);
  const labels = ["Recovery", "Endurance", "Tempo", "Threshold", "Redline"];
  const bounds = [0.5, 0.6, 0.7, 0.8, 0.9, Number.POSITIVE_INFINITY];
  return labels.map((label, i) => ({
    zone: (i + 1) as HrZone["zone"],
    fromBpm: at(bounds[i]),
    toBpm: bounds[i + 1] === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : at(bounds[i + 1]),
    label,
  }));
}

export function zoneForBpm(bpm: number, profile: HrProfile = DEFAULT_HR_PROFILE): HrZone {
  const zones = hrZones(profile);
  for (let i = zones.length - 1; i >= 0; i--) {
    if (bpm >= zones[i].fromBpm) return zones[i];
  }
  return zones[0];
}

/** Preferred estimator: seconds spent in each of Z1..Z5. */
export function relativeEffortFromZones(timeInZoneSec: readonly number[]): number {
  if (timeInZoneSec.length !== 5) {
    throw new RangeError(`expected 5 zone buckets, got ${timeInZoneSec.length}`);
  }
  const score = timeInZoneSec.reduce(
    (sum, sec, i) => sum + (sec / 60) * ZONE_WEIGHTS[i],
    0,
  );
  return Math.round(score / 2.4);
}

/** Fallback estimator from a single average heart rate. */
export function relativeEffortFromAvgHr(
  durationSec: number,
  avgHr: number,
  profile: HrProfile = DEFAULT_HR_PROFILE,
): number {
  if (durationSec <= 0) return 0;
  const reserve = profile.maxHr - profile.restHr;
  const hrr = Math.min(1, Math.max(0, (avgHr - profile.restHr) / reserve));
  const trimp = (durationSec / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
  return Math.round(trimp * TRIMP_SCALE);
}

/** No HR data at all: duration-only floor so the log is never scoreless. */
export function relativeEffortFromDuration(durationSec: number): number {
  return Math.round((durationSec / 60) * 0.9);
}

export type EffortBand = "easy" | "moderate" | "hard" | "epic";

/** Bucket a score for UI glow intensity. */
export function effortBand(score: number): EffortBand {
  if (score < 40) return "easy";
  if (score < 90) return "moderate";
  if (score < 150) return "hard";
  return "epic";
}
