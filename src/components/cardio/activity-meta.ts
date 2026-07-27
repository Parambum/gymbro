import { Bike, Footprints, Mountain, PersonStanding, Waves } from "lucide-react";
import type { ActivityType } from "@/lib/activity-types";

/**
 * Per-discipline presentation. Kept in one place so the feed, the log modal
 * and the detail header can't drift apart on icon or colour.
 *
 * `accent` values are UI glow/border accents (the `hot.*`/`neon.*` families),
 * never chart series — chart marks come from chart-palette.ts.
 */
export const ACTIVITY_META: Record<
  ActivityType,
  { label: string; icon: typeof Footprints; accent: string; paceMode: "pace" | "speed" }
> = {
  RUN: { label: "Run", icon: Footprints, accent: "#22ff88", paceMode: "pace" },
  RIDE: { label: "Ride", icon: Bike, accent: "#06b6d4", paceMode: "speed" },
  WALK: { label: "Walk", icon: PersonStanding, accent: "#a78bfa", paceMode: "pace" },
  HIKE: { label: "Hike", icon: Mountain, accent: "#fbbf24", paceMode: "pace" },
  SWIM: { label: "Swim", icon: Waves, accent: "#38bdf8", paceMode: "pace" },
};

export const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "manual",
  GPX: "gpx",
  LIVE: "gps",
  STRAVA: "strava",
};
