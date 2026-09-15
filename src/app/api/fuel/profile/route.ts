import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelProfile } from "@/models/FuelProfile";
import { FuelWeight } from "@/models/FuelWeight";
import { fuelGuard, loadProfileBundle, recomputeTarget } from "@/lib/fuel/server";
import { FuelProfileSchema, FuelSettingsSchema } from "@/lib/validation";
import { goalWeightNote } from "@/lib/fuel/engine";
import { isValidIso, todayIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * GET /api/fuel/profile?date=yyyy-mm-dd
 *
 * The onboarding gate and the profile screen both read this. `onboarded:false`
 * is a normal answer, not an error — a signed-in user without a Fuel profile
 * is exactly what a new user looks like.
 */
export async function GET(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const date = new URL(req.url).searchParams.get("date") ?? todayIso();
  if (!isValidIso(date)) {
    return NextResponse.json({ error: "date must be yyyy-mm-dd" }, { status: 400 });
  }

  try {
    const bundle = await loadProfileBundle(guard.userId, date);
    if (!bundle.profile) return NextResponse.json({ onboarded: false });

    const p = bundle.profile;
    return NextResponse.json({
      onboarded: true,
      profile: {
        sex: p.sex,
        birthDate: p.birthDate,
        heightCm: p.heightCm,
        activityLevel: p.activityLevel,
        goal: p.goal,
        rateKgPerWeek: p.rateKgPerWeek,
        targetWeightKg: p.targetWeightKg,
        dietPref: p.dietPref,
        macroPreset: p.macroPreset,
        units: p.units,
        tz: p.tz,
        eyesOffMode: p.eyesOffMode,
        exerciseCaloriesEnabled: p.exerciseCaloriesEnabled,
        calorieCyclingEnabled: p.calorieCyclingEnabled,
      },
      weightKg: bundle.weightKg,
      target: bundle.target,
      trainedOnDate: bundle.trainedOnDate,
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/**
 * POST /api/fuel/profile — finish (or redo) onboarding.
 *
 * Writes three things in one go: the profile, the first bodyweight reading,
 * and the computed target. Bodyweight deliberately lands in FuelWeight rather
 * than on the profile so there is one source of truth for "what do they
 * weigh" and the trend chart starts from day one.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const parsed = FuelProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // You can onboard today or backdate, but not from the future.
  if (body.localDate > todayIso() && body.localDate > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "That date hasn't happened yet." }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    const profile = await FuelProfile.findOneAndUpdate(
      { userId: uid },
      {
        $set: {
          sex: body.sex,
          birthDate: body.birthDate,
          heightCm: body.heightCm,
          activityLevel: body.activityLevel,
          goal: body.goal,
          rateKgPerWeek: body.goal === "maintain" ? 0 : body.rateKgPerWeek,
          targetWeightKg: body.targetWeightKg ?? null,
          dietPref: body.dietPref,
          macroPreset: body.macroPreset,
          units: body.units,
          tz: body.tz,
        },
        $setOnInsert: { userId: uid, onboardedAt: new Date() },
      },
      { upsert: true, new: true },
    );

    await FuelWeight.findOneAndUpdate(
      { userId: uid, localDate: body.localDate },
      { $set: { weightKg: body.weightKg } },
      { upsert: true },
    );

    const result = await recomputeTarget(guard.userId, profile, body.weightKg, body.localDate);

    // §5.6 — an under-BMI goal weight is reported plainly and never blocked.
    const note = body.targetWeightKg ? goalWeightNote(body.targetWeightKg, body.heightCm) : null;

    return NextResponse.json(
      {
        ok: true,
        target: {
          kcal: result.kcal,
          proteinG: result.proteinG,
          carbsG: result.carbsG,
          fatG: result.fatG,
          fiberG: result.fiberG,
          waterMl: result.waterMl,
          effectiveFrom: body.localDate,
        },
        bmr: result.bmr,
        tdee: result.tdee,
        appliedRateKgPerWeek: result.appliedRateKgPerWeek,
        isEstimate: result.isEstimate,
        notes: note ? [...result.notes, note] : result.notes,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not save. Check the database connection." },
      { status: 503 },
    );
  }
}

/** PATCH /api/fuel/profile — the settings toggles, which never touch targets. */
export async function PATCH(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const parsed = FuelSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    await connectDB();
    const updated = await FuelProfile.findOneAndUpdate(
      { userId: new Types.ObjectId(guard.userId) },
      { $set: parsed.data },
      { new: true },
    );
    if (!updated) return NextResponse.json({ error: "Set up Fuel first" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      settings: {
        eyesOffMode: updated.eyesOffMode,
        exerciseCaloriesEnabled: updated.exerciseCaloriesEnabled,
        calorieCyclingEnabled: updated.calorieCyclingEnabled,
        dietPref: updated.dietPref,
        units: updated.units,
        tz: updated.tz,
      },
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
