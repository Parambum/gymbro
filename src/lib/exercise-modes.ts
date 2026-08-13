/**
 * How an exercise is logged. Not everything is weight × reps:
 *  - bodyweight movements (push-ups, pull-ups, dips) are reps only — their
 *    loaded cousins ("Weighted Pull-up" …) stay weight × reps;
 *  - planks and isometric holds / carries are a duration, not reps at all.
 */
export type LoggingMode = "weight-reps" | "reps" | "time";

/** Bodyweight, reps only — no external load. */
const REPS_ONLY = new Set<string>([
  "Push-ups",
  "Diamond Push-up",
  "Pull-up",
  "Chin-up",
  "Chin-up (Bicep Focus)",
  "Dips (Chest Focus)",
  "Dips (Triceps Focus)",
  "Bench Dip",
  "Inverted Row",
]);

/** Held/carried for time — no reps, no weight field. */
const TIME_HOLD = new Set<string>([
  "Plank",
  "Side Plank",
  "L-Sit Hold",
  "Isometric Calf Hold",
  "Farmer's Carry",
  "Farmer's Walk on Toes",
]);

export function loggingMode(exercise: string): LoggingMode {
  if (TIME_HOLD.has(exercise)) return "time";
  if (REPS_ONLY.has(exercise)) return "reps";
  return "weight-reps";
}

/** Human hold duration: "45s", "1:30". */
export function formatHold(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

/** One-line summary of a set for lists/history, mode-aware. */
export function describeSet(s: {
  mode?: LoggingMode | null;
  weight: number;
  reps: number;
  durationSec?: number | null;
}): string {
  const mode = s.mode ?? "weight-reps";
  if (mode === "time") return `${formatHold(s.durationSec ?? 0)} hold`;
  if (mode === "reps") return `${s.reps} reps`;
  return `${s.weight} kg × ${s.reps}`;
}
