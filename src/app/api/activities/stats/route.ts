import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Activity } from "@/models/Activity";
import { currentUserId } from "@/lib/auth-helpers";
import { streakFromDates, todayIso, weekStartIso, isValidIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * GET /api/activities/stats?today=yyyy-mm-dd — the cardio deck.
 *
 * Scalar fields only (route and splits are excluded), so this stays cheap
 * even once the athlete has years of efforts. Aggregation happens in JS
 * because the working set is small and the intent stays readable.
 */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todayParam = new URL(req.url).searchParams.get("today");
  const today = todayParam && isValidIso(todayParam) ? todayParam : todayIso();

  try {
    await connectDB();
    const docs = await Activity.find({ userId: new Types.ObjectId(userId) })
      .select("type name date startedAt distanceM movingTimeS elevationGainM avgPaceSPerKm source")
      .sort({ startedAt: -1 })
      .lean();

    if (docs.length === 0) {
      return NextResponse.json({
        hasData: false,
        totals: { activities: 0, distanceM: 0, movingTimeS: 0, elevationGainM: 0 },
        streakDays: 0,
        weeklyDistance: [],
        byType: [],
        personalBests: [],
        recent: [],
      });
    }

    const totals = docs.reduce(
      (acc, d) => ({
        activities: acc.activities + 1,
        distanceM: acc.distanceM + d.distanceM,
        movingTimeS: acc.movingTimeS + d.movingTimeS,
        elevationGainM: acc.elevationGainM + (d.elevationGainM ?? 0),
      }),
      { activities: 0, distanceM: 0, movingTimeS: 0, elevationGainM: 0 },
    );

    // ── weekly distance, last 12 weeks (oldest → newest for the chart) ──
    const byWeek = new Map<string, number>();
    for (const d of docs) byWeek.set(weekStartIso(d.date), (byWeek.get(weekStartIso(d.date)) ?? 0) + d.distanceM);
    const weeklyDistance = [...byWeek.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([week, distanceM]) => ({ week, distanceKm: Number((distanceM / 1000).toFixed(2)) }));

    // ── split by discipline ──
    const typeMap = new Map<string, { count: number; distanceM: number }>();
    for (const d of docs) {
      const cur = typeMap.get(d.type) ?? { count: 0, distanceM: 0 };
      typeMap.set(d.type, { count: cur.count + 1, distanceM: cur.distanceM + d.distanceM });
    }
    const byType = [...typeMap.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.distanceM - a.distanceM);

    // ── personal bests ──
    // Deliberately phrased as what the data actually supports: "best average
    // pace over efforts of at least 5 km", not a rolling best-5K, which would
    // need every full track loaded.
    const personalBests: Array<{ label: string; value: number; unit: string; activityId: string; name: string; date: string }> = [];

    const longest = docs.reduce((a, b) => (b.distanceM > a.distanceM ? b : a));
    personalBests.push({
      label: "Longest effort",
      value: longest.distanceM,
      unit: "distance",
      activityId: String(longest._id),
      name: longest.name,
      date: longest.date,
    });

    const runs5k = docs.filter((d) => d.type === "RUN" && d.distanceM >= 5000 && d.avgPaceSPerKm > 0);
    if (runs5k.length > 0) {
      const fastest = runs5k.reduce((a, b) => (b.avgPaceSPerKm < a.avgPaceSPerKm ? b : a));
      personalBests.push({
        label: "Best pace · 5 km+",
        value: fastest.avgPaceSPerKm,
        unit: "pace",
        activityId: String(fastest._id),
        name: fastest.name,
        date: fastest.date,
      });
    }

    const climbed = docs.filter((d) => (d.elevationGainM ?? 0) > 0);
    if (climbed.length > 0) {
      const steepest = climbed.reduce((a, b) => ((b.elevationGainM ?? 0) > (a.elevationGainM ?? 0) ? b : a));
      personalBests.push({
        label: "Most climbing",
        value: steepest.elevationGainM ?? 0,
        unit: "elevation",
        activityId: String(steepest._id),
        name: steepest.name,
        date: steepest.date,
      });
    }

    const longestTime = docs.reduce((a, b) => (b.movingTimeS > a.movingTimeS ? b : a));
    personalBests.push({
      label: "Longest time",
      value: longestTime.movingTimeS,
      unit: "duration",
      activityId: String(longestTime._id),
      name: longestTime.name,
      date: longestTime.date,
    });

    return NextResponse.json({
      hasData: true,
      totals,
      streakDays: streakFromDates(docs.map((d) => d.date), today),
      weeklyDistance,
      byType,
      personalBests,
      recent: docs.slice(0, 5).map((d) => ({
        id: String(d._id),
        type: d.type,
        name: d.name,
        date: d.date,
        distanceM: d.distanceM,
        movingTimeS: d.movingTimeS,
        avgPaceSPerKm: d.avgPaceSPerKm,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
