import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelProfile } from "@/models/FuelProfile";
import { FuelWeight } from "@/models/FuelWeight";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { fuelGuard, loadProfileBundle, recomputeTarget } from "@/lib/fuel/server";
import { generateProgramme } from "@/lib/training/program";
import { generateMealPlan, inferRole, type PlannableFood } from "@/lib/fuel/meal-plan";
import { engineInputsFor, goalDef, EQUIPMENT_OPTIONS, EXPERIENCE_LEVELS, FITNESS_GOALS } from "@/lib/fuel/goals";
import { DIET_PREFS, SEXES, ACTIVITY_SLUGS } from "@/lib/fuel/types";
import { isValidIso, todayIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * The guided setup: answers in, a diet plan and a training programme out.
 *
 * This is one endpoint rather than three because it is one decision. Everything
 * downstream — calorie target, macro split, training emphasis, weekly volume —
 * derives from the same handful of answers, and splitting them across requests
 * would let a user end up with a target that disagrees with their programme.
 *
 * The programme is stored on the profile so it survives a reload; the meal plan
 * is regenerated on read instead. A stored meal plan would go stale the moment
 * the food database grew, and it is deterministic from the targets anyway.
 */

const StartSchema = z.object({
  sex: z.enum(SEXES),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heightCm: z.number().min(80).max(250),
  weightKg: z.number().min(20).max(400),
  activityLevel: z.enum(ACTIVITY_SLUGS),
  fitnessGoal: z.enum(FITNESS_GOALS),
  experience: z.enum(EXPERIENCE_LEVELS),
  equipment: z.enum(EQUIPMENT_OPTIONS),
  daysPerWeek: z.number().int().min(2).max(6),
  sessionMinutes: z.number().int().min(20).max(180).default(60),
  dietPref: z.enum(DIET_PREFS).default("veg"),
  targetWeightKg: z.number().min(20).max(400).nullable().optional(),
  tz: z.string().trim().min(1).max(64).default("Asia/Kolkata"),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const parsed = StartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const a = parsed.data;

  if (a.localDate > todayIso() && a.localDate > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "That date hasn't happened yet." }, { status: 400 });
  }

  // The stated goal decides what the engine is asked to do; the engine still
  // applies its own safety caps to the rate we propose.
  const engine = engineInputsFor(a.fitnessGoal, a.weightKg);
  const programme = generateProgramme({
    goal: a.fitnessGoal,
    experience: a.experience,
    equipment: a.equipment,
    daysPerWeek: a.daysPerWeek,
    sessionMinutes: a.sessionMinutes,
  });

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    const profile = await FuelProfile.findOneAndUpdate(
      { userId: uid },
      {
        $set: {
          sex: a.sex,
          birthDate: a.birthDate,
          heightCm: a.heightCm,
          activityLevel: a.activityLevel,
          goal: engine.goal,
          rateKgPerWeek: engine.rateKgPerWeek,
          macroPreset: engine.macroPreset,
          targetWeightKg: a.targetWeightKg ?? null,
          dietPref: a.dietPref,
          tz: a.tz,
          units: "metric",
          fitnessGoal: a.fitnessGoal,
          experience: a.experience,
          equipment: a.equipment,
          daysPerWeek: a.daysPerWeek,
          sessionMinutes: a.sessionMinutes,
          programme,
        },
        $setOnInsert: { userId: uid, onboardedAt: new Date() },
      },
      { upsert: true, new: true },
    );

    await FuelWeight.findOneAndUpdate(
      { userId: uid, localDate: a.localDate },
      { $set: { weightKg: a.weightKg } },
      { upsert: true },
    );

    const target = await recomputeTarget(guard.userId, profile, a.weightKg, a.localDate);
    const mealPlan = await buildMealPlan(uid, target, a.dietPref, a.localDate);

    return NextResponse.json(
      {
        ok: true,
        goal: goalDef(a.fitnessGoal),
        target,
        programme,
        mealPlan,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[plan] setup failed:", err);
    return NextResponse.json(
      { error: "Could not save. Check the database connection." },
      { status: 503 },
    );
  }
}

/** GET /api/plan — the stored programme plus a freshly composed day of meals. */
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
    const mealPlan = bundle.target
      ? await buildMealPlan(
          new Types.ObjectId(guard.userId),
          bundle.target,
          p.dietPref ?? "veg",
          date,
        )
      : null;

    return NextResponse.json({
      onboarded: true,
      fitnessGoal: p.fitnessGoal,
      goal: p.fitnessGoal ? goalDef(p.fitnessGoal) : null,
      experience: p.experience,
      equipment: p.equipment,
      daysPerWeek: p.daysPerWeek,
      sessionMinutes: p.sessionMinutes,
      target: bundle.target,
      programme: p.programme ?? null,
      mealPlan,
    });
  } catch (err) {
    console.error("[plan] read failed:", err);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/**
 * Compose a day of meals from whatever is actually in the food database.
 *
 * The date seeds the rotation, so the plan varies across the week without
 * being random — the same day always produces the same suggestion.
 */
async function buildMealPlan(
  uid: Types.ObjectId,
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number },
  dietPref: string,
  date: string,
) {
  const foods = await FuelFood.find({ $or: [{ ownerUserId: null }, { ownerUserId: uid }] })
    .sort({ isVerified: -1, popularity: -1 })
    .limit(300)
    .lean();

  if (foods.length === 0) {
    return generateMealPlan([], target, dietPref as never, 0);
  }

  const portions = await FuelPortion.find({ foodId: { $in: foods.map((f) => f._id) } })
    .sort({ sortOrder: 1 })
    .lean();

  const byFood = new Map<string, Array<{ id: string; label: string; grams: number }>>();
  for (const p of portions) {
    const key = String(p.foodId);
    const list = byFood.get(key) ?? [];
    list.push({ id: String(p._id), label: p.label, grams: p.grams });
    byFood.set(key, list);
  }

  const plannable: PlannableFood[] = foods.map((f) => ({
    id: String(f._id),
    name: f.name,
    per100g: f.per100g,
    vegFlag: (f.vegFlag ?? "unknown") as PlannableFood["vegFlag"],
    portions: byFood.get(String(f._id)) ?? [],
    role: inferRole(f.name, f.per100g),
  }));

  // Day-of-year seed: deterministic per date, different across the week.
  const seed = Math.abs(Date.parse(`${date}T00:00:00Z`) / 86_400_000) | 0;
  return generateMealPlan(plannable, target, dietPref as never, seed);
}
