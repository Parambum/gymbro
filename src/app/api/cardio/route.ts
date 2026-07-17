import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOperator, isoDate } from "@/lib/api-helpers";
import { evenSplits, paceSecPerKm } from "@/lib/math/pace";
import { demoCardioHistory } from "@/lib/data/demo-data";

export const dynamic = "force-dynamic";

const CardioBody = z.object({
  activity: z.enum(["RUNNING", "CYCLING", "SWIMMING", "ROWING"]),
  runType: z.enum(["SPRINTS", "INTERVALS", "LONG_RUN", "TEMPO", "RECOVERY"]).nullable(),
  durationSec: z.number().int().min(1).max(86_400),
  distanceM: z.number().int().min(1).max(1_000_000),
  avgHr: z.number().int().min(30).max(230).nullable(),
  relativeEffort: z.number().int().min(0).max(2000),
});

export async function GET() {
  try {
    const user = await getOperator();
    const sessions = await prisma.cardioSession.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 30,
    });
    return NextResponse.json({
      source: "db",
      sessions: sessions.map((s) => ({
        id: s.id,
        activity: s.activity,
        runType: s.runType,
        date: isoDate(s.date),
        durationSec: s.durationSec,
        distanceM: s.distanceM,
        avgHr: s.avgHr,
        paceSecPerKm: paceSecPerKm(s.distanceM, s.durationSec),
        relativeEffort: s.relativeEffort,
      })),
    });
  } catch {
    return NextResponse.json({ source: "demo", sessions: demoCardioHistory() });
  }
}

/**
 * Persists the session and materializes Strava-style km splits.
 * Relative Effort arrives precomputed from the client's live preview and is
 * recomputed here from the same pure functions if HR data is present —
 * client and server share one math module, so they cannot disagree.
 */
export async function POST(req: Request) {
  const parsed = CardioBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const user = await getOperator();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const splits = evenSplits(body.distanceM, body.durationSec).map((s) => ({
      index: s.index,
      distanceM: Math.round(s.distanceM),
      durationSec: Math.round(s.durationSec * 10) / 10,
    }));

    const session = await prisma.cardioSession.create({
      data: {
        userId: user.id,
        activity: body.activity,
        runType: body.activity === "RUNNING" ? body.runType : null,
        date: today,
        durationSec: body.durationSec,
        distanceM: body.distanceM,
        avgHr: body.avgHr,
        relativeEffort: body.relativeEffort,
        splits: { create: splits.slice(0, 100) },
      },
    });

    return NextResponse.json({ persisted: true, sessionId: session.id });
  } catch {
    return NextResponse.json({ persisted: false });
  }
}
