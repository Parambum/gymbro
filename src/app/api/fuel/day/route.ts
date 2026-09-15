import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelLog } from "@/models/FuelLog";
import { FuelWater } from "@/models/FuelWater";
import { Workout } from "@/models/Workout";
import { Activity } from "@/models/Activity";
import { fuelGuard, loadProfileBundle } from "@/lib/fuel/server";
import { groupByMeal, loggingStreak, totalsFor } from "@/lib/fuel/log";
import { remainingFor } from "@/lib/fuel/targets";
import { cycleTarget, exerciseKcal } from "@/lib/fuel/bridge";
import { TRAINING_DAY_WATER_BONUS_ML, type Meal } from "@/lib/fuel/types";
import { isValidIso, todayIso, addDaysIso } from "@/lib/date-utils";
import { groupBySlug } from "@/lib/data/exercise-catalog";

export const runtime = "nodejs";

/**
 * GET /api/fuel/day?date=yyyy-mm-dd
 *
 * Everything the Today screen draws, in one round trip — the §9 budget is
 * "interactive in 1.5 s on 4G", and four sequential fetches cannot make that.
 *
 * This is also where the training bridge lands (§8): the day knows whether it
 * was a training day, and — behind their toggles — cycles the target toward
 * training days and adds cardio back. It returns the day's workout alongside
 * the food so one date shows both (§8.5).
 *
 * `date` is always supplied by the client, because only the client knows which
 * day it is where the user is standing.
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
    const weekAgo = addDaysIso(date, -6);

    const [bundle, rawEntries, water, streakDates, workout, activities, trainingDates] =
      await Promise.all([
        loadProfileBundle(guard.userId, date),
        FuelLog.find({ userId: uid, localDate: date }).sort({ loggedAt: 1 }).lean(),
        FuelWater.findOne({ userId: uid, localDate: date }).lean(),
        FuelLog.distinct("localDate", {
          userId: uid,
          localDate: { $gte: addDaysIso(date, -400), $lte: date },
        }),
        Workout.findOne({ userId: uid, date }).lean(),
        Activity.find({ userId: uid, date }).select({ type: 1, distanceM: 1, name: 1 }).lean(),
        // How many of the last 7 days had a session — the denominator cycling needs.
        Workout.distinct("date", { userId: uid, date: { $gte: weekAgo, $lte: date } }),
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

    // ── §8: adjust the day's target for training ────────────────────
    const bridgeNotes: string[] = [];
    let target = bundle.target;

    if (target && bundle.profile.calorieCyclingEnabled) {
      const cycled = cycleTarget(target, bundle.trainedOnDate, (trainingDates as string[]).length);
      if (cycled.note) bridgeNotes.push(cycled.note);
      target = { ...target, ...cycled };
    }

    let exerciseAddedKcal = 0;
    if (target && bundle.profile.exerciseCaloriesEnabled && bundle.weightKg) {
      exerciseAddedKcal = exerciseKcal(
        activities.map((a) => ({ type: String(a.type), distanceM: Number(a.distanceM) })),
        bundle.weightKg,
      );
      if (exerciseAddedKcal > 0) {
        target = { ...target, kcal: target.kcal + exerciseAddedKcal };
        bridgeNotes.push(
          `+${exerciseAddedKcal} kcal added back from today's cardio. This is a rough estimate from distance and bodyweight, and it's the commonest way to eat more than you meant to.`,
        );
      }
    }

    // §5.4 — the training water bonus is applied on read, not baked into the
    // stored target, because a day can become a training day hours later.
    const waterTargetMl = target
      ? target.waterMl + (bundle.trainedOnDate ? TRAINING_DAY_WATER_BONUS_ML : 0)
      : null;

    // ── §8.5 the same date, showing both halves ─────────────────────
    const workoutSummary = workout
      ? {
          setCount: workout.sets?.length ?? 0,
          muscles: [
            ...new Set((workout.sets ?? []).map((s) => groupBySlug(s.muscleGroup)?.name ?? s.muscleGroup)),
          ],
          tonnageKg: Math.round(
            (workout.sets ?? [])
              .filter((s) => s.setType !== "WARMUP")
              .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0),
          ),
        }
      : null;

    return NextResponse.json({
      onboarded: true,
      date,
      eyesOffMode: Boolean(bundle.profile.eyesOffMode),
      target,
      consumed,
      remaining: target ? remainingFor(target, consumed) : null,
      meals: meals.map((m) => ({ meal: m.meal, totals: m.totals, entries: m.entries })),
      water: { ml: water?.ml ?? 0, targetMl: waterTargetMl },
      trainedOnDate: bundle.trainedOnDate,
      workout: workoutSummary,
      cardio: activities.map((a) => ({
        name: String(a.name),
        type: String(a.type),
        distanceKm: Math.round((Number(a.distanceM) / 1000) * 10) / 10,
      })),
      bridgeNotes,
      streak: loggingStreak(streakDates as string[], todayIso()),
    });
  } catch (err) {
    console.error("[fuel/day] failed:", err);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
