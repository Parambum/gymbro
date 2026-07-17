import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOperator, isoDate } from "@/lib/api-helpers";
import { demoE1rmSeries } from "@/lib/data/demo-data";
import type { E1rmPoint } from "@/lib/math/e1rm";

export const dynamic = "force-dynamic";

/**
 * Daily-best e1RM series for one exercise. The heavy lifting happened at
 * write time (e1rm is denormalized on every set), so this is a single
 * indexed range scan + an in-memory fold to per-day maxima.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const exercise = url.searchParams.get("exercise") ?? "";
  const days = Math.min(365, Number(url.searchParams.get("days")) || 120);
  if (!exercise) {
    return NextResponse.json({ error: "exercise query param required" }, { status: 400 });
  }

  try {
    const user = await getOperator();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sets = await prisma.workoutSet.findMany({
      where: {
        exercise: { slug: exercise },
        workout: { userId: user.id },
        tag: { not: "WARMUP" },
        performedAt: { gte: since },
      },
      orderBy: { performedAt: "asc" },
      select: { weightKg: true, reps: true, e1rm: true, performedAt: true },
    });

    if (sets.length === 0) {
      // no history for this lift yet — hand back the demo curve so the
      // chart teaches the metric instead of rendering a void
      return NextResponse.json({ source: "demo", series: demoE1rmSeries(exercise) });
    }

    const byDay = new Map<string, E1rmPoint>();
    for (const s of sets) {
      const date = isoDate(s.performedAt);
      const e1rm = Number(s.e1rm);
      const prev = byDay.get(date);
      if (!prev || e1rm > prev.e1rm) {
        byDay.set(date, { date, e1rm, weightKg: Number(s.weightKg), reps: s.reps });
      }
    }

    return NextResponse.json({
      source: "db",
      series: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch {
    return NextResponse.json({ source: "demo", series: demoE1rmSeries(exercise) });
  }
}
