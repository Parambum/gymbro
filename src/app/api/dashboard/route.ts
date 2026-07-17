import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOperator, isoDate, weekStartIso } from "@/lib/api-helpers";
import { demoDashboard, type DemoDashboard } from "@/lib/data/demo-data";

export const dynamic = "force-dynamic";

/** Bento-grid aggregates: streak, last session, PR vault, weekly loads. */
export async function GET() {
  try {
    const user = await getOperator();
    const since = new Date();
    since.setDate(since.getDate() - 63);

    const [workouts, cardio, prs] = await Promise.all([
      prisma.workout.findMany({
        where: { userId: user.id, date: { gte: since } },
        orderBy: { date: "desc" },
        include: {
          sets: { include: { exercise: { include: { muscleGroup: true } } } },
        },
      }),
      prisma.cardioSession.findMany({
        where: { userId: user.id, date: { gte: since } },
        orderBy: { date: "desc" },
      }),
      prisma.personalRecord.findMany({
        where: { userId: user.id },
        orderBy: { achievedAt: "desc" },
        take: 3,
        include: { exercise: true },
      }),
    ]);

    const lastWithSets = workouts.find((w) => w.sets.length > 0);
    if (!lastWithSets && cardio.length === 0) {
      // fresh install, nothing logged — show the demo deck
      return NextResponse.json(demoDashboard());
    }

    // streak: consecutive days (ending today or yesterday) with any training
    const trainedDays = new Set<string>([
      ...workouts.filter((w) => w.sets.length > 0).map((w) => isoDate(w.date)),
      ...cardio.map((c) => isoDate(c.date)),
    ]);
    let streakDays = 0;
    const cursor = new Date();
    if (!trainedDays.has(isoDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (trainedDays.has(isoDate(cursor))) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // last workout summary
    let lastWorkout: DemoDashboard["lastWorkout"] = {
      date: isoDate(new Date()),
      focus: "—",
      topSet: "No sets yet",
      totalVolumeKg: 0,
      setCount: 0,
    };
    if (lastWithSets) {
      const groupCounts = new Map<string, number>();
      for (const s of lastWithSets.sets) {
        const g = s.exercise.muscleGroup.name;
        groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
      }
      const focus = [...groupCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([g]) => g)
        .join(" / ");
      const top = lastWithSets.sets.reduce((a, b) => (Number(b.e1rm) > Number(a.e1rm) ? b : a));
      lastWorkout = {
        date: isoDate(lastWithSets.date),
        focus,
        topSet: `${top.exercise.name} — ${Number(top.weightKg)} kg × ${top.reps}`,
        totalVolumeKg: Math.round(
          lastWithSets.sets
            .filter((s) => s.tag !== "WARMUP")
            .reduce((sum, s) => sum + Number(s.weightKg) * s.reps, 0),
        ),
        setCount: lastWithSets.sets.length,
      };
    }

    // weekly aggregates (8 buckets)
    const volumeByWeek = new Map<string, number>();
    for (const w of workouts) {
      const wk = weekStartIso(w.date);
      const vol = w.sets
        .filter((s) => s.tag !== "WARMUP")
        .reduce((sum, s) => sum + Number(s.weightKg) * s.reps, 0);
      volumeByWeek.set(wk, (volumeByWeek.get(wk) ?? 0) + vol);
    }
    const effortByWeek = new Map<string, number>();
    for (const c of cardio) {
      const wk = weekStartIso(c.date);
      effortByWeek.set(wk, (effortByWeek.get(wk) ?? 0) + c.relativeEffort);
    }
    const toSeries = (m: Map<string, number>, key: "volumeKg" | "effort") =>
      [...m.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-8)
        .map(([week, v]) => ({ week, [key]: Math.round(v) }));

    const payload: DemoDashboard = {
      streakDays,
      lastWorkout,
      recentPRs: prs.map((pr) => ({
        exercise: pr.exercise.name,
        e1rm: Number(pr.e1rm),
        achievedAt: isoDate(pr.achievedAt),
      })),
      weeklyVolume: toSeries(volumeByWeek, "volumeKg") as DemoDashboard["weeklyVolume"],
      weeklyEffort: toSeries(effortByWeek, "effort") as DemoDashboard["weeklyEffort"],
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(demoDashboard());
  }
}
