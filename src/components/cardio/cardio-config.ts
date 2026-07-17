export type ActivityId = "RUNNING" | "CYCLING" | "SWIMMING" | "ROWING";
export type RunTypeId = "SPRINTS" | "INTERVALS" | "LONG_RUN" | "TEMPO" | "RECOVERY";

export interface ActivityDef {
  id: ActivityId;
  label: string;
  glyph: string;
  /** UI accent (glow) — crimson/blue is the cardio color language */
  accent: string;
  /** how this activity expresses speed */
  paceMode: "per-km" | "kmh" | "per-100m";
}

export const ACTIVITIES: ActivityDef[] = [
  { id: "RUNNING", label: "Running", glyph: "▶▶", accent: "#ff2d55", paceMode: "per-km" },
  { id: "CYCLING", label: "Cycling", glyph: "◎◎", accent: "#06b6d4", paceMode: "kmh" },
  { id: "ROWING", label: "Rowing", glyph: "≡≡", accent: "#ff2d55", paceMode: "per-km" },
  { id: "SWIMMING", label: "Swimming", glyph: "≈≈", accent: "#06b6d4", paceMode: "per-100m" },
];

export const RUN_TYPES: Array<{ id: RunTypeId; label: string }> = [
  { id: "SPRINTS", label: "Sprints" },
  { id: "INTERVALS", label: "Intervals" },
  { id: "LONG_RUN", label: "Long Run" },
  { id: "TEMPO", label: "Tempo" },
  { id: "RECOVERY", label: "Recovery" },
];

export function activityById(id: ActivityId): ActivityDef {
  return ACTIVITIES.find((a) => a.id === id) ?? ACTIVITIES[0];
}
