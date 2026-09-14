import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelLog } from "@/models/FuelLog";
import { FuelWater } from "@/models/FuelWater";
import { fuelGuard, loadProfileBundle } from "@/lib/fuel/server";
import { groupByMeal, loggingStreak, totalsFor } from "@/lib/fuel/log";
import { remainingFor } from "@/lib/fuel/targets";
import { TRAINING_DAY_WATER_BONUS_ML, type Meal } from "@/lib/fuel/types";
import { isValidIso, todayIso, addDaysIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * GET /api/fuel/day?date=yyyy-mm-dd
 *
 * Everything the Today screen draws, in one round trip — the §9 budget is
 * "interactive in 1.5 s on 4G", and four sequential fetches cannot make that.
 *
 * `date` is always supplied by the client, because only the client knows which
 * day it is where the user is standing. The server never derives "today" from
 * its own clock for anyone but itself.
 */
export async function GET(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const date = new URL(req.url).searchParams.get("date") ?? todayIso();
  if (!isValidIso(date)) {
    return NextResponse.json({ error: "date must be yyyy-mm-dd" }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    const [bundle, rawEntries, water, streakDates] = await Promise.all([
      loadProfileBundle(guard.userId, date),
      FuelLog.find({ userId: uid, localDate: date }).sort({ loggedAt: 1 }).lean(),
      FuelWater.findOne({ userId: uid, localDate: date }).lean(),
      FuelLog.distinct("localDate", {
        userId: uid,
        localDate: { $gte: addDaysIso(date, -400), $lte: date },
      }),
    ]);

    if (!bundle.profile) {
      return NextResponse.json({ onboarded: false, date });
    }

    const entries = rawEntries.map((e) => ({
      id: String(e._id),
      meal: e.meal as Meal,
      foodId: e.foodId ? String(e.foodId) : null,
      foodName: e.foodName,
      portionLabel: e.portionLabel ?? null,
      quantity: e.quantity,
      unit: e.unit ?? "g",
      gramsResolved: e.gramsResolved,
      kcal: e.kcal,
      proteinG: e.proteinG,
      carbsG: e.carbsG,
      fatG: e.fatG,
      fiberG: e.fiberG ?? 0,
      entryMethod: e.entryMethod,
      confidence: e.confidence ?? null,
      assumptions: e.assumptions ?? null,
      wasEdited: Boolean(e.wasEdited),
    }));

    const consumed = totalsFor(entries);
    const meals = groupByMeal(entries);

    // §5.4 — the training bonus is applied on read, not baked into the stored
    // target, because whether today turned into a training day can change
    // hours after the target was written.
    const waterTargetMl = bundle.target
      ? bundle.target.waterMl + (bundle.trainedOnDate ? TRAINING_DAY_WATER_BONUS_ML : 0)
      : null;

    return NextResponse.json({
      onboarded: true,
      date,
      eyesOffMode: Boolean(bundle.profile.eyesOffMode),
      target: bundle.target,
      consumed,
      remaining: bundle.target ? remainingFor(bundle.target, consumed) : null,
      meals: meals.map((m) => ({
        meal: m.meal,
        totals: m.totals,
        entries: m.entries,
      })),
      water: { ml: water?.ml ?? 0, targetMl: waterTargetMl },
      trainedOnDate: bundle.trainedOnDate,
      streak: loggingStreak(streakDates as string[], todayIso()),
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
