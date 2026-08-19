import { connectDB } from "@/lib/db/mongoose";
import { Workout } from "@/models/Workout";
import { OneRepMax } from "@/models/OneRepMax";
import { MUSCLE_GROUPS, groupBySlug } from "@/lib/data/exercise-catalog";
import { addDaysIso, streakFromDates, todayIso } from "@/lib/date-utils";
import { roundE1RM } from "@/lib/math/e1rm";
import mongoose from "mongoose";

/**
 * The `training_log` tool body: the signed-in lifter's REAL history, flattened
 * into a compact text brief the model can reason over.
 *
 * Text, not JSON, on purpose — the coach must never echo raw JSON at the user,
 * and a labelled brief is far cheaper in tokens than nested objects. Every
 * number here comes out of Mongo; nothing is estimated. An empty log returns
 * an explicit "no sessions" line so the model says so rather than inventing.
 */

export const DEFAULT_WINDOW_DAYS = 45;

/**
 * Deterministic "Tue, Jul 21" for the model-facing brief.
 *
 * briefDate() is the UI's locale-aware formatter, which is right for a screen
 * and wrong for a prompt: the same log would read differently depending on the
 * server's locale, and the Python twin has to emit the same string.
 */
function briefDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface FlatSet {
  date: string;
  exercise: string;
  muscleGroup: string;
  mode: string;
  weight: number;
  reps: number;
  durationSec: number | null;
  setType: string;
  e1rm: number;
}

export async function trainingLogBrief(
  userId: string,
  days: number = DEFAULT_WINDOW_DAYS,
): Promise<string> {
  const window = Math.min(Math.max(Math.trunc(days) || DEFAULT_WINDOW_DAYS, 7), 365);
  const today = todayIso();
  const since = addDaysIso(today, -window);

  await connectDB();
  const [workouts, maxes] = await Promise.all([
    Workout.find({ userId: new mongoose.Types.ObjectId(userId), date: { $gte: since } })
      .sort({ date: 1 })
      .lean(),
    OneRepMax.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({ oneRepMax: -1 }).lean(),
  ]);

  const sets: FlatSet[] = [];
  for (const w of workouts) {
    for (const s of w.sets ?? []) {
      sets.push({
        date: w.date,
        exercise: s.exercise,
        muscleGroup: s.muscleGroup,
        mode: s.mode ?? "weight-reps",
        weight: s.weight ?? 0,
        reps: s.reps ?? 0,
        durationSec: s.durationSec ?? null,
        setType: s.setType ?? "WORKING",
        e1rm: s.e1rm ?? 0,
      });
    }
  }

  if (sets.length === 0) {
    return [
      `TRAINING LOG (last ${window} days, as of ${today})`,
      "No sessions logged in this window. The user has no training history to analyse.",
      maxes.length > 0
        ? `Recorded 1RMs on file: ${maxes.map((m) => `${m.exercise} ${m.oneRepMax}kg`).join(", ")}`
        : "No recorded 1RMs on file either.",
    ].join("\n");
  }

  const working = sets.filter((s) => s.setType !== "WARMUP");
  const dates = [...new Set(sets.map((s) => s.date))].sort();
  const tonnage = working.reduce((sum, s) => sum + s.weight * s.reps, 0);

  const lines: string[] = [];
  lines.push(`TRAINING LOG (last ${window} days, as of ${today})`);
  lines.push(
    `Sessions: ${dates.length} · working sets: ${working.length} · tonnage: ${Math.round(tonnage)}kg`,
  );
  lines.push(
    `First session in window: ${briefDate(dates[0])} · most recent: ${briefDate(dates[dates.length - 1])} · current streak: ${streakFromDates(dates)} day(s)`,
  );

  // ── muscle coverage: what they hammer vs what they skip ──────────────
  const byMuscle = new Map<string, { sets: number; last: string }>();
  for (const s of working) {
    const prev = byMuscle.get(s.muscleGroup);
    if (!prev) byMuscle.set(s.muscleGroup, { sets: 1, last: s.date });
    else {
      prev.sets += 1;
      if (s.date > prev.last) prev.last = s.date;
    }
  }
  const coverage = [...byMuscle.entries()].sort((a, b) => b[1].sets - a[1].sets);
  lines.push("");
  lines.push("MUSCLE COVERAGE (working sets · last trained)");
  for (const [slug, stat] of coverage) {
    lines.push(`- ${groupBySlug(slug)?.name ?? slug}: ${stat.sets} sets · ${briefDate(stat.last)}`);
  }
  const untouched = MUSCLE_GROUPS.map((g) => g.slug).filter((slug) => !byMuscle.has(slug));
  if (untouched.length > 0) {
    lines.push(
      `- NOT TRAINED at all in this window: ${untouched.map((s) => groupBySlug(s)?.name ?? s).join(", ")}`,
    );
  }

  // ── per-exercise progression, best e1RM per day, first vs latest ─────
  const byExercise = new Map<string, Map<string, FlatSet>>();
  for (const s of working) {
    if (s.mode !== "weight-reps" || s.e1rm <= 0) continue;
    const days = byExercise.get(s.exercise) ?? new Map<string, FlatSet>();
    const best = days.get(s.date);
    if (!best || s.e1rm > best.e1rm) days.set(s.date, s);
    byExercise.set(s.exercise, days);
  }

  const progression = [...byExercise.entries()]
    .map(([exercise, days]) => {
      const points = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
      const first = points[0];
      const last = points[points.length - 1];
      const deltaPct = first.e1rm > 0 ? ((last.e1rm - first.e1rm) / first.e1rm) * 100 : 0;
      return { exercise, points, first, last, deltaPct };
    })
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 8);

  if (progression.length > 0) {
    lines.push("");
    lines.push("MAIN LIFTS (sessions · latest best set · e1RM trend across the window)");
    for (const p of progression) {
      const trend =
        p.points.length < 2
          ? "single session — no trend yet"
          : `${p.deltaPct >= 0 ? "+" : ""}${p.deltaPct.toFixed(1)}% e1RM (${roundE1RM(p.first.e1rm)}kg → ${roundE1RM(p.last.e1rm)}kg)`;
      lines.push(
        `- ${p.exercise}: ${p.points.length} session(s) · last ${p.last.weight}kg × ${p.last.reps} on ${briefDate(p.last.date)} · ${trend}`,
      );
    }
  }

  // ── bodyweight / timed work, which carries no e1RM ───────────────────
  const nonLoaded = working.filter((s) => s.mode !== "weight-reps");
  if (nonLoaded.length > 0) {
    const grouped = new Map<string, { sets: number; best: number; mode: string }>();
    for (const s of nonLoaded) {
      const metric = s.mode === "time" ? (s.durationSec ?? 0) : s.reps;
      const prev = grouped.get(s.exercise);
      if (!prev) grouped.set(s.exercise, { sets: 1, best: metric, mode: s.mode });
      else {
        prev.sets += 1;
        prev.best = Math.max(prev.best, metric);
      }
    }
    lines.push("");
    lines.push("BODYWEIGHT / TIMED WORK");
    for (const [exercise, stat] of [...grouped.entries()].slice(0, 6)) {
      const best = stat.mode === "time" ? `${stat.best}s hold` : `${stat.best} reps`;
      lines.push(`- ${exercise}: ${stat.sets} sets · best ${best}`);
    }
  }

  if (maxes.length > 0) {
    lines.push("");
    lines.push("RECORDED 1RMs (tested or manually entered, not estimates)");
    for (const m of maxes.slice(0, 8)) {
      lines.push(`- ${m.exercise}: ${m.oneRepMax}kg (${m.source})`);
    }
  }

  return lines.join("\n");
}
