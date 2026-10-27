import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelLog } from "@/models/FuelLog";
import { Workout } from "@/models/Workout";
import { Activity } from "@/models/Activity";
import { loadProfileBundle } from "@/lib/fuel/server";
import { totalsFor } from "@/lib/fuel/log";
import { targetForDay } from "@/lib/fuel/bridge";
import type { Meal } from "@/lib/fuel/types";
import { addDaysIso } from "@/lib/date-utils";
import type { DayIntake } from "./nutrition";

/**
 * The database half of "how many calories have I got left?": the day's Fuel
 * log and the target in force, adjusted for training exactly as the Today
 * screen adjusts it (targetForDay), so the chat and the ring always agree.
 */
export async function loadDayIntake(userId: string, date: string): Promise<DayIntake> {
  await connectDB();
  const uid = new Types.ObjectId(userId);
  const [bundle, entries, trainingDates, activities] = await Promise.all([
    loadProfileBundle(userId, date),
    FuelLog.find({ userId: uid, localDate: date }).select({ meal: 1, kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 1 }).lean(),
    Workout.distinct("date", { userId: uid, date: { $gte: addDaysIso(date, -6), $lte: date } }),
    Activity.find({ userId: uid, date }).select({ type: 1, distanceM: 1 }).lean(),
  ]);

  const consumed = totalsFor(
    entries.map((e) => ({ meal: e.meal as Meal, kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG, fiberG: e.fiberG ?? 0 })),
  );

  const profile = bundle.profile;
  const day =
    bundle.target && profile
      ? targetForDay(bundle.target, {
          calorieCycling: Boolean(profile.calorieCyclingEnabled),
          exerciseCalories: Boolean(profile.exerciseCaloriesEnabled),
          isTrainingDay: bundle.trainedOnDate,
          trainingDaysLast7: (trainingDates as string[]).length,
          activities: activities.map((a) => ({ type: String(a.type), distanceM: Number(a.distanceM) })),
          weightKg: bundle.weightKg,
        })
      : null;

  return {
    onboarded: Boolean(profile),
    eyesOff: Boolean(profile?.eyesOffMode),
    date,
    consumed,
    target: day ? { ...day.target, effectiveFrom: bundle.target!.effectiveFrom } : null,
    notes: day?.notes ?? [],
    items: entries.length,
    meals: [...new Set(entries.map((e) => e.meal as Meal))],
    about: {
      goal: (profile?.goal as "lose" | "maintain" | "gain" | undefined) ?? null,
      dietPref: profile?.dietPref ?? null,
      weightKg: bundle.weightKg,
      birthDate: profile?.birthDate ?? null,
    },
  };
}
