import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelWeight } from "@/models/FuelWeight";
import { fuelGuard } from "@/lib/fuel/server";
import { FuelWeightSchema } from "@/lib/validation";
import { withWeightTrend } from "@/lib/fuel/trend";
import { addDaysIso, todayIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * POST /api/fuel/weight — record (or correct) one day's bodyweight.
 *
 * One reading per day: weighing again replaces rather than appends, because
 * two readings on the same morning are the same measurement, not two data
 * points. Only the raw number is stored — the smoothed trend is computed on
 * read, so changing the smoothing constant can never corrupt the history.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const parsed = FuelWeightSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { localDate, weightKg, note } = parsed.data;

  if (localDate > addDaysIso(todayIso(), 1)) {
    return NextResponse.json({ error: "You can only log today or a past day." }, { status: 400 });
  }

  try {
    await connectDB();
    await FuelWeight.findOneAndUpdate(
      { userId: new Types.ObjectId(guard.userId), localDate },
      { $set: { weightKg, note: note ?? null } },
      { upsert: true },
    );
    return NextResponse.json({ ok: true, localDate, weightKg }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not save. Check the database connection." },
      { status: 503 },
    );
  }
}

/** GET /api/fuel/weight?days=180 — raw readings plus the EWMA trend. */
export async function GET(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 180) || 180, 7), 1000);

  try {
    await connectDB();
    const rows = await FuelWeight.find({
      userId: new Types.ObjectId(guard.userId),
      localDate: { $gte: addDaysIso(todayIso(), -days) },
    })
      .sort({ localDate: 1 })
      .lean();

    return NextResponse.json({
      readings: withWeightTrend(rows.map((r) => ({ date: r.localDate, weightKg: r.weightKg }))),
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
