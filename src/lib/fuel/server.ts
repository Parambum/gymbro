import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { currentUserId } from "@/lib/auth-helpers";
import { FuelProfile, type FuelProfileDoc } from "@/models/FuelProfile";
import { FuelTarget } from "@/models/FuelTarget";
import { FuelWeight } from "@/models/FuelWeight";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { Workout } from "@/models/Workout";
import { isFuelEnabled } from "./flag";
import { ageOn, computeTargets, type TargetResult } from "./engine";
import type { FoodSource, MacroPreset, Per100g, PortionUnit, VegFlag } from "./types";

/**
 * Server-side plumbing shared by every /api/fuel route.
 *
 * Two things are enforced here rather than in each route, because forgetting
 * either one is a security bug: the feature flag, and the identity. The user
 * id is always resolved from the session — it is never accepted from the
 * client — matching how the strength routes do it.
 */

type Guard = { userId: string; error: null } | { userId: null; error: NextResponse };

/**
 * 404 when the module is flagged off (not 403 — a dark feature should look
 * absent, not forbidden), 401 when signed out.
 */
export async function fuelGuard(): Promise<Guard> {
  if (!isFuelEnabled()) {
    return { userId: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const userId = await currentUserId();
  if (!userId) {
    return { userId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId, error: null };
}

export interface NewFood {
  name: string;
  brand?: string | null;
  source: FoodSource;
  sourceRef?: string | null;
  per100g: Per100g;
  vegFlag?: VegFlag;
  aliases?: string[];
  barcode?: string | null;
  /** Only true for published composition data. Never for user or AI input. */
  isVerified: boolean;
  /** null = global (seeded); otherwise the food belongs to one user. */
  ownerUserId: Types.ObjectId | null;
  /** Household servings. A "100 g" row is appended automatically. */
  portions?: Array<{ label: string; grams: number; unit?: PortionUnit }>;
}

/**
 * Create a food and its portions together.
 *
 * Shared by the three P1 paths that mint foods — a barcode scan, a custom
 * food, and the companion food behind a recipe — because each of them needs
 * exactly the same invariants: a searchText that the ranker can work with, at
 * least one portion so the picker is never empty, and a gram fallback so a
 * kitchen scale is always an option.
 */
export async function createFood(food: NewFood): Promise<Types.ObjectId> {
  const aliases = food.aliases ?? [];
  const created = await FuelFood.create({
    name: food.name,
    brand: food.brand ?? null,
    source: food.source,
    sourceRef: food.sourceRef ?? null,
    isVerified: food.isVerified,
    per100g: food.per100g,
    vegFlag: food.vegFlag ?? "unknown",
    ownerUserId: food.ownerUserId,
    aliases,
    searchText: [food.name, food.brand ?? "", ...aliases].join(" ").toLowerCase().trim(),
    barcode: food.barcode ?? null,
    popularity: 0,
  });

  const rows = [...(food.portions ?? []), { label: "100 g", grams: 100, unit: "g" as PortionUnit }];
  await FuelPortion.insertMany(
    rows.map((p, i) => ({
      foodId: created._id,
      label: p.label,
      grams: p.grams,
      unit: p.unit ?? "household",
      isDefault: i === 0,
      sortOrder: i,
    })),
  );

  return created._id;
}

export interface ProfileBundle {
  profile: FuelProfileDoc | null;
  /** Latest recorded bodyweight — the engine's input, from FuelWeight. */
  weightKg: number | null;
  /** The target in force on the requested date, or null before onboarding. */
  target: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    waterMl: number;
    effectiveFrom: string;
    source: string;
    isEstimate: boolean;
    notes: string[];
  } | null;
  /** Did the user train on this date? Drives the §5.4 water bonus. */
  trainedOnDate: boolean;
}

/**
 * Everything the Fuel screens need about *who this user is* on a given day,
 * in one round trip. `localDate` is always supplied by the client — the
 * server never guesses which day it is for someone else's timezone.
 */
export async function loadProfileBundle(userId: string, localDate: string): Promise<ProfileBundle> {
  await connectDB();
  const uid = new Types.ObjectId(userId);

  const [profile, latestWeight, target, workout] = await Promise.all([
    FuelProfile.findOne({ userId: uid }),
    FuelWeight.findOne({ userId: uid, localDate: { $lte: localDate } }).sort({ localDate: -1 }).lean(),
    FuelTarget.findOne({ userId: uid, effectiveFrom: { $lte: localDate } })
      .sort({ effectiveFrom: -1 })
      .lean(),
    Workout.findOne({ userId: uid, date: localDate }).select({ _id: 1 }).lean(),
  ]);

  return {
    profile,
    weightKg: latestWeight?.weightKg ?? null,
    target: target
      ? {
          kcal: target.kcal,
          proteinG: target.proteinG,
          carbsG: target.carbsG,
          fatG: target.fatG,
          fiberG: target.fiberG,
          waterMl: target.waterMl,
          effectiveFrom: target.effectiveFrom,
          source: target.source ?? "auto",
          isEstimate: Boolean(target.isEstimate),
          notes: target.notes ?? [],
        }
      : null,
    trainedOnDate: Boolean(workout),
  };
}

/**
 * Run the engine for this profile and store the result as a NEW target row
 * effective from `localDate`.
 *
 * Re-running on the same day replaces that day's row rather than stacking
 * another one — otherwise nudging a slider five times would litter the
 * history with five identical entries. Any *earlier* target is untouched, so
 * past days keep being judged against what was actually in force.
 *
 * The stored water figure is the rest-day number; the §5.4 training bonus is
 * added on read, because whether today is a training day can change after the
 * target was written.
 */
export async function recomputeTarget(
  userId: string,
  profile: FuelProfileDoc,
  weightKg: number,
  localDate: string,
): Promise<TargetResult> {
  const result = computeTargets({
    sex: profile.sex,
    ageYears: ageOn(profile.birthDate, localDate),
    heightCm: profile.heightCm,
    weightKg,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    rateKgPerWeek: profile.rateKgPerWeek ?? 0,
    macroPreset: (profile.macroPreset ?? "balanced") as MacroPreset,
    trainingDay: false,
  });

  await FuelTarget.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), effectiveFrom: localDate },
    {
      $set: {
        kcal: result.kcal,
        proteinG: result.proteinG,
        carbsG: result.carbsG,
        fatG: result.fatG,
        fiberG: result.fiberG,
        waterMl: result.waterMl,
        source: "auto",
        isEstimate: result.isEstimate,
        notes: result.notes,
        basis: { weightKg, bmr: result.bmr, tdee: result.tdee },
      },
    },
    { upsert: true, new: true },
  );

  return result;
}
