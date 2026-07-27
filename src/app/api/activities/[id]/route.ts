import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Activity } from "@/models/Activity";
import { currentUserId } from "@/lib/auth-helpers";

export const runtime = "nodejs";

/** GET /api/activities/:id — one effort, including its route and splits. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await connectDB();
    const doc = await Activity.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    }).lean();

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      activity: {
        id: String(doc._id),
        type: doc.type,
        name: doc.name,
        date: doc.date,
        startedAt: doc.startedAt,
        distanceM: doc.distanceM,
        movingTimeS: doc.movingTimeS,
        elapsedTimeS: doc.elapsedTimeS,
        elevationGainM: doc.elevationGainM,
        avgPaceSPerKm: doc.avgPaceSPerKm,
        avgHeartRate: doc.avgHeartRate ?? null,
        route: doc.route ?? [],
        splits: doc.splits ?? [],
        source: doc.source,
        notes: doc.notes ?? "",
      },
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
