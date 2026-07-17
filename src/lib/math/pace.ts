/**
 * Pace / speed / splits math — the Strava DNA.
 * Canonical storage units: meters and seconds. Everything else is formatting.
 */

export interface Split {
  /** 1-based split index */
  index: number;
  /** split distance in meters (last one may be partial) */
  distanceM: number;
  durationSec: number;
  /** seconds per km for this split */
  paceSecPerKm: number;
}

export function paceSecPerKm(distanceM: number, durationSec: number): number {
  if (distanceM <= 0) return 0;
  return durationSec / (distanceM / 1000);
}

export function speedKmh(distanceM: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return (distanceM / 1000) / (durationSec / 3600);
}

/** "5:24" — minutes:seconds per km. */
export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "–:––";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "1:02:45" or "42:10" — hours only when needed. */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Parse "HH:MM:SS", "MM:SS" or "SS" into seconds. Returns NaN on garbage. */
export function parseDuration(input: string): number {
  const parts = input.trim().split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return Number.NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return Number.NaN;
}

/**
 * Strava-style km splits from a total. Without per-km telemetry the pace is
 * uniform; when real split durations exist, use `splitsFromDurations`.
 */
export function evenSplits(distanceM: number, durationSec: number): Split[] {
  if (distanceM <= 0 || durationSec <= 0) return [];
  const pace = paceSecPerKm(distanceM, durationSec);
  const fullKm = Math.floor(distanceM / 1000);
  const remainderM = distanceM - fullKm * 1000;

  const splits: Split[] = [];
  for (let i = 1; i <= fullKm; i++) {
    splits.push({ index: i, distanceM: 1000, durationSec: pace, paceSecPerKm: pace });
  }
  if (remainderM > 1) {
    splits.push({
      index: fullKm + 1,
      distanceM: remainderM,
      durationSec: pace * (remainderM / 1000),
      paceSecPerKm: pace,
    });
  }
  return splits;
}

/** Build splits from recorded per-km durations (seconds each). */
export function splitsFromDurations(
  durationsSec: number[],
  lastSplitDistanceM = 1000,
): Split[] {
  return durationsSec.map((sec, i) => {
    const isLast = i === durationsSec.length - 1;
    const dist = isLast ? lastSplitDistanceM : 1000;
    return {
      index: i + 1,
      distanceM: dist,
      durationSec: sec,
      paceSecPerKm: paceSecPerKm(dist, sec),
    };
  });
}

/** Fastest split — the one the UI crowns. */
export function bestSplit(splits: Split[]): Split | undefined {
  return splits.reduce<Split | undefined>(
    (best, s) => (!best || s.paceSecPerKm < best.paceSecPerKm ? s : best),
    undefined,
  );
}

export const KM_PER_MILE = 1.609344;
export const kgToLb = (kg: number) => kg * 2.2046226218;
export const lbToKg = (lb: number) => lb / 2.2046226218;
export const kmToMi = (km: number) => km / KM_PER_MILE;
