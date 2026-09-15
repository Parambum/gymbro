import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelWater } from "@/models/FuelWater";
import { fuelGuard } from "@/lib/fuel/server";
import { FuelWaterSchema } from "@/lib/validation";
import { addDaysIso, todayIso } from "@/lib/date-utils";

export const runtime = "nodejs";

const DAILY_CAP_ML = 20_000;

/**
 * POST /api/fuel/water — nudge the day's total by a delta.
 *
 * A delta rather than an absolute, because two taps should mean two glasses.
 * This is the one place in Fuel where a double-tap *should* count twice, which
 * is exactly why it does not carry the idempotency key food logging does.
 *
 * The total is clamped into [0, cap] server-side so an undo can never drive it
 * negative and a stuck key can never store something absurd.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const parsed = FuelWaterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { localDate, deltaMl } = parsed.data;

  if (localDate > addDaysIso(todayIso(), 1)) {
    return NextResponse.json({ error: "You can only log today or a past day." }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    const existing = await FuelWater.findOne({ userId: uid, localDate }).lean();
    const next = Math.max(0, Math.min(DAILY_CAP_ML, (existing?.ml ?? 0) + deltaMl));

    await FuelWater.findOneAndUpdate(
      { userId: uid, localDate },
      { $set: { ml: next } },
      { upsert: true },
    );

    return NextResponse.json({ ok: true, ml: next });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
