import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelProfile } from "@/models/FuelProfile";
import { FuelTarget } from "@/models/FuelTarget";
import { FuelWeight } from "@/models/FuelWeight";
import { fuelGuard, recomputeTarget } from "@/lib/fuel/server";
import { FuelTargetOverrideSchema } from "@/lib/validation";
import { ageOn, bmrMifflinStJeor } from "@/lib/fuel/engine";
import { MIN_KCAL } from "@/lib/fuel/types";
import { isValidIso, todayIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * GET /api/fuel/targets — the full append-only history, newest first.
 * The profile screen uses it to show when a target changed and why.
 */
export async function GET() {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  try {
    await connectDB();
    const rows = await FuelTarget.find({ userId: new Types.ObjectId(guard.userId) })
      .sort({ effectiveFrom: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      targets: rows.map((t) => ({
        effectiveFrom: t.effectiveFrom,
        kcal: t.kcal,
        proteinG: t.proteinG,
        carbsG: t.carbsG,
        fatG: t.fatG,
        fiberG: t.fiberG,
        waterMl: t.waterMl,
        source: t.source,
        isEstimate: Boolean(t.isEstimate),
        notes: t.notes ?? [],
        basis: t.basis ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/**
 * POST /api/fuel/targets — write a new target, effective from a date.
 *
 *   { mode: "auto",  localDate }            → re-run the engine
 *   { mode: "manual", kcal, ..., localDate } → the user's own numbers
 *
 * A manual target is still floored by §5.6. Those floors are not advice: the
 * client cannot post its way under them, because this route recomputes the
 * user's BMR from the profile and clamps before writing.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => null)) as { mode?: string } | null;
  if (!body || (body.mode !== "auto" && body.mode !== "manual")) {
    return NextResponse.json({ error: 'mode must be "auto" or "manual"' }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    const [profile, latestWeight] = await Promise.all([
      FuelProfile.findOne({ userId: uid }),
      FuelWeight.findOne({ userId: uid }).sort({ localDate: -1 }).lean(),
    ]);
    if (!profile) return NextResponse.json({ error: "Set up Fuel first" }, { status: 404 });
    if (!latestWeight) {
      return NextResponse.json({ error: "Log a bodyweight first" }, { status: 400 });
    }

    // ── auto: hand it back to the engine ─────────────────────────────
    if (body.mode === "auto") {
      const localDate = (body as { localDate?: string }).localDate ?? todayIso();
      if (!isValidIso(localDate)) {
        return NextResponse.json({ error: "localDate must be yyyy-mm-dd" }, { status: 400 });
      }
      const result = await recomputeTarget(
        guard.userId,
        profile,
        latestWeight.weightKg,
        localDate,
      );
      return NextResponse.json({ ok: true, source: "auto", ...result }, { status: 201 });
    }

    // ── manual: the user's numbers, still floored ────────────────────
    const parsed = FuelTargetOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const m = parsed.data;

    const bmr = bmrMifflinStJeor(
      profile.sex,
      latestWeight.weightKg,
      profile.heightCm,
      ageOn(profile.birthDate, m.localDate),
    );
    const floor = Math.max(MIN_KCAL[profile.sex], bmr);

    const notes: string[] = [];
    let kcal = m.kcal;
    if (kcal < floor) {
      notes.push(
        `Raised to ${Math.round(floor)} kcal — that's what your body burns at rest, and we don't set targets below it.`,
      );
      kcal = Math.round(floor);
    }

    const saved = await FuelTarget.findOneAndUpdate(
      { userId: uid, effectiveFrom: m.localDate },
      {
        $set: {
          kcal,
          proteinG: Math.round(m.proteinG),
          carbsG: Math.round(m.carbsG),
          fatG: Math.round(m.fatG),
          fiberG: Math.round(m.fiberG ?? (kcal / 1000) * 14),
          waterMl: Math.round(m.waterMl ?? 35 * latestWeight.weightKg),
          source: "manual",
          isEstimate: profile.sex === "unspecified",
          notes,
          basis: { weightKg: latestWeight.weightKg, bmr: Math.round(bmr), tdee: null },
        },
      },
      { upsert: true, new: true },
    );

    return NextResponse.json(
      {
        ok: true,
        source: "manual",
        kcal: saved.kcal,
        proteinG: saved.proteinG,
        carbsG: saved.carbsG,
        fatG: saved.fatG,
        fiberG: saved.fiberG,
        waterMl: saved.waterMl,
        notes,
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
