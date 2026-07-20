import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Workout, type SetEntry } from "@/models/Workout";
import { currentUserId } from "@/lib/auth-helpers";
import { MUSCLE_GROUPS, groupBySlug } from "@/lib/data/exercise-catalog";
import { streakFromDates, weekStartIso, isValidIso, todayIso } from "@/lib/date-utils";

export const runtime = "nodejs";

const isWorking = (s: Pick<SetEntry, "setType">) => s.setType !== "WARMUP";
const volumeOf = (s: Pick<SetEntry, "weight" | "reps">) => s.weight * s.reps;

/**
 * GET /api/analytics/overview — everything the dashboard + body radar need,
 * in one query. Returns a true blank slate (hasData:false, zeros, empties)
 * for a new account so the UI shows empty states instead of fake numbers.
 */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todayParam = new URL(req.url).searchParams.get("today");
  const today = todayParam && isValidIso(todayParam) ? todayParam : todayIso();

  try {
    await connectDB();
    const workouts = await Workout.find({ userId: new Types.ObjectId(userId) })
      .sort({ date: 1 })
      .lean<Array<{ date: string; sets: SetEntry[] }>>();

    const datesWithSets: string[] = [];
    let totalSets = 0;
    let totalVolumeKg = 0;
    const perMuscleBest = new Map<string, number>();
    const perExerciseBest = new Map<string, { e1rm: number; date: string }>();
    const weeklyVolume = new Map<string, number>();

    for (const w of workouts) {
      if (!w.sets.length) continue;
      datesWithSets.push(w.date);
      const week = weekStartIso(w.date);

      for (const s of w.sets) {
        totalSets += 1;
        if (!isWorking(s)) continue;
        const vol = volumeOf(s);
        totalVolumeKg += vol;
        weeklyVolume.set(week, (weeklyVolume.get(week) ?? 0) + vol);
        perMuscleBest.set(s.muscleGroup, Math.max(perMuscleBest.get(s.muscleGroup) ?? 0, s.e1rm));
        const pr = perExerciseBest.get(s.exercise);
        if (!pr || s.e1rm > pr.e1rm) perExerciseBest.set(s.exercise, { e1rm: s.e1rm, date: w.date });
      }
    }

    const hasData = datesWithSets.length > 0;

    // last workout summary
    let lastWorkout: {
      date: string;
      muscles: string[];
      topSet: string;
      setCount: number;
      volumeKg: number;
    } | null = null;
    const last = [...workouts].reverse().find((w) => w.sets.length > 0);
    if (last) {
      const working = last.sets.filter(isWorking);
      const top = (working.length ? working : last.sets).reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
      const muscleNames = [...new Set(last.sets.map((s) => s.muscleGroup))].map(
        (slug) => groupBySlug(slug)?.name ?? slug,
      );
      lastWorkout = {
        date: last.date,
        muscles: muscleNames,
        topSet: `${top.exercise} — ${top.weight} kg × ${top.reps}`,
        setCount: last.sets.length,
        volumeKg: Math.round(working.reduce((sum, s) => sum + volumeOf(s), 0)),
      };
    }

    const radar = MUSCLE_GROUPS.map((g) => ({
      slug: g.slug,
      muscle: g.name,
      value: Math.round(perMuscleBest.get(g.slug) ?? 0),
    }));

    const recentPRs = [...perExerciseBest.entries()]
      .map(([exercise, v]) => ({ exercise, e1rm: v.e1rm, date: v.date }))
      .sort((a, b) => b.e1rm - a.e1rm)
      .slice(0, 5);

    const weekly = [...weeklyVolume.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([week, volumeKg]) => ({ week, volumeKg: Math.round(volumeKg) }));

    return NextResponse.json({
      hasData,
      streakDays: streakFromDates(datesWithSets, today),
      workoutCount: datesWithSets.length,
      totalSets,
      totalVolumeKg: Math.round(totalVolumeKg),
      lastWorkout,
      recentPRs,
      radar,
      weeklyVolume: weekly,
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
