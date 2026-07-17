/**
 * Deterministic demo fixtures. Every API route falls back to these when
 * DATABASE_URL is absent or unreachable, so the app renders a full
 * experience on first `npm run dev` — zero setup friction.
 *
 * The strength series intentionally demonstrates the core thesis:
 * flat weight + rising reps (volume overload) = rising e1RM vector.
 */

import { epleyE1RM, roundE1RM, type E1rmPoint } from "@/lib/math/e1rm";
import {
  relativeEffortFromAvgHr,
  effortBand,
  type EffortBand,
} from "@/lib/math/relative-effort";
import { paceSecPerKm } from "@/lib/math/pace";

/** mulberry32 — tiny seeded PRNG so fixtures never flicker between renders. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Per-exercise progression profile keyed by exercise slug prefix. */
const PROFILES: Record<string, { startKg: number; stepKg: number }> = {
  "flat-barbell-bench-press": { startKg: 60, stepKg: 2.5 },
  "barbell-back-squat": { startKg: 80, stepKg: 5 },
  "conventional-deadlift": { startKg: 100, stepKg: 5 },
  "standing-overhead-barbell-press": { startKg: 40, stepKg: 2.5 },
  default: { startKg: 30, stepKg: 2.5 },
};

/**
 * 10 weeks, 2 sessions/week. Weight holds for 3 sessions while reps climb
 * 8 → 10 → 12 (volume overload), then load steps up and reps reset.
 */
export function demoE1rmSeries(exercise: string): E1rmPoint[] {
  const profile = PROFILES[exercise] ?? PROFILES.default;
  const rand = rng(exercise.split("").reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const points: E1rmPoint[] = [];

  for (let session = 0; session < 20; session++) {
    const block = Math.floor(session / 3);
    const stage = session % 3;
    const weightKg = profile.startKg + block * profile.stepKg;
    const reps = 8 + stage * 2 + (rand() > 0.8 ? 1 : 0);
    const daysAgo = (20 - session) * 3 + Math.floor(rand() * 2);
    points.push({
      date: isoDaysAgo(daysAgo),
      weightKg,
      reps,
      e1rm: roundE1RM(epleyE1RM(weightKg, reps)),
    });
  }
  return points;
}

export interface DemoCardioSession {
  id: string;
  activity: "RUNNING" | "CYCLING" | "SWIMMING" | "ROWING";
  runType: "SPRINTS" | "INTERVALS" | "LONG_RUN" | "TEMPO" | "RECOVERY" | null;
  date: string;
  durationSec: number;
  distanceM: number;
  avgHr: number;
  paceSecPerKm: number;
  relativeEffort: number;
  band: EffortBand;
}

export function demoCardioHistory(): DemoCardioSession[] {
  const rand = rng(1337);
  const templates: Array<
    Pick<DemoCardioSession, "activity" | "runType"> & {
      km: [number, number];
      paceSec: [number, number];
      hr: [number, number];
    }
  > = [
    { activity: "RUNNING", runType: "TEMPO", km: [6, 9], paceSec: [290, 320], hr: [162, 174] },
    { activity: "RUNNING", runType: "LONG_RUN", km: [12, 18], paceSec: [340, 375], hr: [148, 158] },
    { activity: "RUNNING", runType: "INTERVALS", km: [5, 7], paceSec: [255, 285], hr: [172, 184] },
    { activity: "RUNNING", runType: "RECOVERY", km: [4, 6], paceSec: [390, 420], hr: [128, 140] },
    { activity: "CYCLING", runType: null, km: [25, 45], paceSec: [95, 115], hr: [138, 155] },
    { activity: "ROWING", runType: null, km: [5, 8], paceSec: [230, 260], hr: [150, 165] },
    { activity: "SWIMMING", runType: null, km: [1.5, 2.5], paceSec: [1500, 1750], hr: [135, 150] },
  ];

  const sessions: DemoCardioSession[] = [];
  for (let i = 0; i < 14; i++) {
    const t = templates[Math.floor(rand() * templates.length)];
    const km = t.km[0] + rand() * (t.km[1] - t.km[0]);
    const pace = t.paceSec[0] + rand() * (t.paceSec[1] - t.paceSec[0]);
    const distanceM = Math.round(km * 1000);
    const durationSec = Math.round(km * pace);
    const avgHr = Math.round(t.hr[0] + rand() * (t.hr[1] - t.hr[0]));
    const relativeEffort = relativeEffortFromAvgHr(durationSec, avgHr);
    sessions.push({
      id: `demo-cardio-${i}`,
      activity: t.activity,
      runType: t.runType,
      date: isoDaysAgo(i * 2 + Math.floor(rand() * 2)),
      durationSec,
      distanceM,
      avgHr,
      paceSecPerKm: paceSecPerKm(distanceM, durationSec),
      relativeEffort,
      band: effortBand(relativeEffort),
    });
  }
  return sessions;
}

export interface DemoDashboard {
  streakDays: number;
  lastWorkout: {
    date: string;
    focus: string;
    topSet: string;
    totalVolumeKg: number;
    setCount: number;
  };
  recentPRs: Array<{ exercise: string; e1rm: number; achievedAt: string }>;
  weeklyVolume: Array<{ week: string; volumeKg: number }>;
  weeklyEffort: Array<{ week: string; effort: number }>;
}

export function demoDashboard(): DemoDashboard {
  const rand = rng(42);
  return {
    streakDays: 17,
    lastWorkout: {
      date: isoDaysAgo(1),
      focus: "Chest / Triceps",
      topSet: "Flat Barbell Bench Press — 75 kg × 9",
      totalVolumeKg: 8420,
      setCount: 22,
    },
    recentPRs: [
      { exercise: "Flat Barbell Bench Press", e1rm: 97.5, achievedAt: isoDaysAgo(1) },
      { exercise: "Barbell Back Squat", e1rm: 142.5, achievedAt: isoDaysAgo(4) },
      { exercise: "Conventional Deadlift", e1rm: 172.5, achievedAt: isoDaysAgo(9) },
    ],
    weeklyVolume: Array.from({ length: 8 }, (_, i) => ({
      week: isoDaysAgo((7 - i) * 7),
      volumeKg: Math.round(14000 + i * 900 + rand() * 2200),
    })),
    weeklyEffort: Array.from({ length: 8 }, (_, i) => ({
      week: isoDaysAgo((7 - i) * 7),
      effort: Math.round(180 + i * 22 + rand() * 60),
    })),
  };
}
