import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelLog } from "@/models/FuelLog";
import { FuelWeight } from "@/models/FuelWeight";
import { FuelTarget } from "@/models/FuelTarget";
import { FuelProfile } from "@/models/FuelProfile";
import { Workout } from "@/models/Workout";
import { fuelGuard } from "@/lib/fuel/server";
import { targetForDate } from "@/lib/fuel/targets";
import { trendDirection, weeklyChangeKg, withWeightTrend } from "@/lib/fuel/trend";
import { loggingStreak } from "@/lib/fuel/log";
import { proteinVerdict } from "@/lib/fuel/bridge";
import { estimateAdaptiveTdee } from "@/lib/fuel/adaptive";
import { ageOn, bmrMifflinStJeor, tdeeFrom } from "@/lib/fuel/engine";
import { round } from "@/lib/fuel/types";
import { addDaysIso, isValidIso, todayIso, weekStartIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * GET /api/fuel/progress?days=30&today=yyyy-mm-dd
 *
 * The Progress screen in one call: weight with its trend, per-day calorie
 * adherence against whatever target was in force *that* day, macro averages,
 * and the streak.
 *
 * Adherence is the reason targets are append-only. Comparing January's intake
 * to today's target would manufacture a story about discipline that never
 * happened; every day here is judged against the number the user was actually
 * given at the time.
 */
export async function GET(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 7), 365);
  const today = url.searchParams.get("today") ?? todayIso();
  if (!isValidIso(today)) {
    return NextResponse.json({ error: "today must be yyyy-mm-dd" }, { status: 400 });
  }
  const since = addDaysIso(today, -(days - 1));

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    const [profile, weights, targets, daily, streakDates] = await Promise.all([
      FuelProfile.findOne({ userId: uid }).lean(),
      FuelWeight.find({ userId: uid, localDate: { $gte: addDaysIso(today, -365) } })
        .sort({ localDate: 1 })
        .lean(),
      FuelTarget.find({ userId: uid }).sort({ effectiveFrom: 1 }).lean(),
      FuelLog.aggregate<{
        _id: string;
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
      }>([
        { $match: { userId: uid, localDate: { $gte: since, $lte: today } } },
        {
          $group: {
            _id: "$localDate",
            kcal: { $sum: "$kcal" },
            proteinG: { $sum: "$proteinG" },
            carbsG: { $sum: "$carbsG" },
            fatG: { $sum: "$fatG" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      FuelLog.distinct("localDate", { userId: uid, localDate: { $lte: today } }),
    ]);

    const byDate = new Map(daily.map((d) => [d._id, d]));
    const datedTargets = targets.map((t) => ({
      effectiveFrom: t.effectiveFrom,
      kcal: t.kcal,
      proteinG: t.proteinG,
      carbsG: t.carbsG,
      fatG: t.fatG,
      fiberG: t.fiberG,
      waterMl: t.waterMl,
    }));

    // One row per calendar day in the window, logged or not — a gap in the
    // chart is information, and filtering it out would hide it.
    const adherence = [];
    for (let i = 0; i < days; i++) {
      const date = addDaysIso(since, i);
      const logged = byDate.get(date);
      const target = targetForDate(datedTargets, date);
      adherence.push({
        date,
        kcal: logged ? Math.round(logged.kcal) : null,
        proteinG: logged ? round(logged.proteinG, 1) : null,
        carbsG: logged ? round(logged.carbsG, 1) : null,
        fatG: logged ? round(logged.fatG, 1) : null,
        targetKcal: target?.kcal ?? null,
        targetProteinG: target?.proteinG ?? null,
      });
    }

    const loggedDays = adherence.filter((d) => d.kcal != null);
    const withTarget = loggedDays.filter((d) => d.targetKcal != null);
    // "On target" is a ±10 % band. A single number pretending to be exact
    // adherence would be false precision.
    const onTarget = withTarget.filter(
      (d) => Math.abs(d.kcal! - d.targetKcal!) <= d.targetKcal! * 0.1,
    ).length;

    const avg = (pick: (d: (typeof loggedDays)[number]) => number | null) =>
      loggedDays.length === 0
        ? null
        : round(loggedDays.reduce((s, d) => s + (pick(d) ?? 0), 0) / loggedDays.length, 1);

    const trend = withWeightTrend(weights.map((w) => ({ date: w.localDate, weightKg: w.weightKg })));
    const weekly = weeklyChangeKg(trend);

    // ── §8.3 protein vs progress ─────────────────────────────────────
    // Group intake and tonnage into the same Monday-anchored weeks so the two
    // series are actually comparable before anything is claimed about them.
    const workouts = await Workout.find({
      userId: uid,
      date: { $gte: since, $lte: today },
    })
      .select({ date: 1, sets: 1 })
      .lean();

    const weekBuckets = new Map<
      string,
      { proteinSum: number; kcalSum: number; days: number; tonnageKg: number }
    >();
    const bucket = (iso: string) => {
      const key = weekStartIso(iso);
      const b = weekBuckets.get(key) ?? { proteinSum: 0, kcalSum: 0, days: 0, tonnageKg: 0 };
      weekBuckets.set(key, b);
      return b;
    };

    for (const d of loggedDays) {
      const b = bucket(d.date);
      b.proteinSum += d.proteinG ?? 0;
      b.kcalSum += d.kcal ?? 0;
      b.days += 1;
    }
    for (const w of workouts) {
      const b = bucket(w.date);
      b.tonnageKg += (w.sets ?? [])
        .filter((s) => s.setType !== "WARMUP")
        .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
    }

    const weeks = [...weekBuckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, b]) => ({
        weekStart,
        avgProteinG: b.days > 0 ? round(b.proteinSum / b.days, 1) : null,
        avgKcal: b.days > 0 ? Math.round(b.kcalSum / b.days) : null,
        tonnageKg: Math.round(b.tonnageKg),
        daysLogged: b.days,
      }));

    const latestWeightKg = trend.at(-1)?.trendKg ?? null;
    const verdict = proteinVerdict(weeks, latestWeightKg);

    // ── adaptive TDEE ────────────────────────────────────────────────
    // Reads a longer window than the chart does: the estimate wants as much
    // intake history as exists, not just what the user is currently looking at.
    const intakeHistory = await FuelLog.aggregate<{ _id: string; kcal: number }>([
      { $match: { userId: uid, localDate: { $gte: addDaysIso(today, -120), $lte: today } } },
      { $group: { _id: "$localDate", kcal: { $sum: "$kcal" } } },
      { $sort: { _id: 1 } },
    ]);

    const formulaTdee =
      profile && latestWeightKg
        ? Math.round(
            tdeeFrom(
              bmrMifflinStJeor(
                profile.sex,
                latestWeightKg,
                profile.heightCm,
                ageOn(profile.birthDate, today),
              ),
              profile.activityLevel,
            ),
          )
        : null;

    const adaptive = estimateAdaptiveTdee(
      intakeHistory.map((d) => ({ date: d._id, kcal: d.kcal })),
      trend,
      formulaTdee,
    );

    return NextResponse.json({
      days,
      since,
      today,
      goal: profile?.goal ?? null,
      targetWeightKg: profile?.targetWeightKg ?? null,
      goalRateKgPerWeek: profile?.rateKgPerWeek ?? null,
      eyesOffMode: Boolean(profile?.eyesOffMode),
      weight: {
        readings: trend,
        weeklyChangeKg: weekly,
        direction: trendDirection(weekly),
      },
      adherence,
      weeks,
      /** §8.3 — null message means the data didn't support saying anything. */
      proteinVsProgress: verdict,
      /** Measured metabolism. `tdee: null` means not enough data yet. */
      adaptive,
      summary: {
        loggedDays: loggedDays.length,
        windowDays: days,
        onTargetDays: onTarget,
        comparableDays: withTarget.length,
        avgKcal: avg((d) => d.kcal),
        avgProteinG: avg((d) => d.proteinG),
        avgCarbsG: avg((d) => d.carbsG),
        avgFatG: avg((d) => d.fatG),
        streak: loggingStreak(streakDates as string[], today),
      },
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
