import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { FuelLog } from "@/models/FuelLog";
import { fuelGuard } from "@/lib/fuel/server";
import { FuelLogFoodSchema, FuelQuickAddSchema } from "@/lib/validation";
import { entryMacrosFor } from "@/lib/fuel/log";
import { resolveGrams } from "@/lib/fuel/portions";
import { isValidIso, todayIso, addDaysIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * POST /api/fuel/log — add one entry.
 *
 * Two shapes, distinguished by whether a `foodId` is present:
 *
 *   food  — the client sends what was eaten and how much of it. The server
 *           looks up the portion, resolves grams, and computes every macro
 *           from the food's stored composition. Client-sent macros are not
 *           read, so a tampered payload cannot invent a zero-calorie meal.
 *   quick — raw numbers with no food behind them. Taken at face value because
 *           there is nothing to derive them from, and marked as such forever.
 *
 * Whatever the shape, the macros are **frozen into the row** along with the
 * food's name (§4). Correcting a food's data later never rewrites history.
 *
 * Idempotent: a repeated `clientId` returns the row that already exists rather
 * than logging the meal twice, so a double-tap on a slow connection is safe.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const isQuickAdd = !raw.foodId;
  const parsed = isQuickAdd ? FuelQuickAddSchema.safeParse(raw) : FuelLogFoodSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const localDate = parsed.data.localDate;
  // Backfilling the past is fine; the future is not. The one-day grace covers
  // a client legitimately ahead of the server's UTC day, as /api/workouts does.
  if (localDate > addDaysIso(todayIso(), 1)) {
    return NextResponse.json({ error: "You can only log today or a past day." }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    let doc: Record<string, unknown>;

    if (isQuickAdd) {
      const q = parsed.data as import("@/lib/validation").FuelQuickAddInput;
      doc = {
        userId: uid,
        localDate: q.localDate,
        loggedAt: new Date(),
        meal: q.meal,
        foodId: null,
        portionId: null,
        foodName: q.foodName,
        portionLabel: null,
        quantity: 1,
        unit: "serving",
        gramsResolved: 0,
        kcal: Math.round(q.kcal),
        proteinG: q.proteinG,
        carbsG: q.carbsG,
        fatG: q.fatG,
        fiberG: q.fiberG,
        entryMethod: "quick",
        clientId: q.clientId ?? null,
      };
    } else {
      const f = parsed.data as import("@/lib/validation").FuelLogFoodInput;

      // The food must be global or the user's own — never someone else's.
      const food = await FuelFood.findOne({
        _id: new Types.ObjectId(f.foodId),
        $or: [{ ownerUserId: null }, { ownerUserId: uid }],
      }).lean();
      if (!food) return NextResponse.json({ error: "That food no longer exists." }, { status: 404 });

      let grams: number;
      let portionLabel: string | null = null;
      let unit = "g";

      if (f.portionId) {
        const portion = await FuelPortion.findOne({
          _id: new Types.ObjectId(f.portionId),
          foodId: food._id,
        }).lean();
        if (!portion) {
          return NextResponse.json({ error: "That serving size no longer exists." }, { status: 404 });
        }
        grams = resolveGrams(f.quantity, portion.grams);
        portionLabel = portion.label;
        unit = portion.unit ?? "household";
      } else {
        // No portion chosen: quantity is grams.
        grams = resolveGrams(f.quantity, 1);
      }

      if (grams <= 0 || grams > 10_000) {
        return NextResponse.json({ error: "That portion size doesn't look right." }, { status: 400 });
      }

      const macros = entryMacrosFor(food.per100g, grams);
      doc = {
        userId: uid,
        localDate: f.localDate,
        loggedAt: new Date(),
        meal: f.meal,
        foodId: food._id,
        portionId: f.portionId ? new Types.ObjectId(f.portionId) : null,
        foodName: food.name,
        portionLabel,
        quantity: f.quantity,
        unit,
        gramsResolved: grams,
        ...macros,
        entryMethod: f.entryMethod,
        clientId: f.clientId ?? null,
      };
    }

    let saved;
    try {
      saved = await FuelLog.create(doc);
    } catch (err) {
      // Duplicate clientId — the same save arriving twice. Hand back the row
      // that already exists: the user's intent was one entry, and they got one.
      if ((err as { code?: number }).code === 11000 && doc.clientId) {
        const existing = await FuelLog.findOne({ userId: uid, clientId: doc.clientId });
        if (existing) return NextResponse.json({ entry: serialize(existing), duplicate: true });
      }
      throw err;
    }

    // Popularity is a search-ranking input, not a statistic anyone sees.
    if (doc.foodId) {
      await FuelFood.updateOne({ _id: doc.foodId as Types.ObjectId }, { $inc: { popularity: 1 } });
    }

    return NextResponse.json({ entry: serialize(saved) }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not save. Check the database connection." },
      { status: 503 },
    );
  }
}

/** GET /api/fuel/log?date=yyyy-mm-dd — the raw entries for one day. */
export async function GET(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const date = new URL(req.url).searchParams.get("date") ?? todayIso();
  if (!isValidIso(date)) {
    return NextResponse.json({ error: "date must be yyyy-mm-dd" }, { status: 400 });
  }

  try {
    await connectDB();
    const entries = await FuelLog.find({
      userId: new Types.ObjectId(guard.userId),
      localDate: date,
    })
      .sort({ loggedAt: 1 })
      .lean();
    return NextResponse.json({ date, entries: entries.map(serialize) });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/** DELETE /api/fuel/log?id=… — remove one entry. */
export async function DELETE(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "A valid entry id is required" }, { status: 400 });
  }

  try {
    await connectDB();
    const res = await FuelLog.deleteOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(guard.userId), // scoping is the authorisation
    });
    if (res.deletedCount === 0) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/**
 * PATCH /api/fuel/log — change the quantity or the meal of an existing entry.
 * Macros are recomputed from the stored food, never accepted from the client.
 */
export async function PATCH(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => null)) as
    | { id?: string; quantity?: number; meal?: string }
    | null;
  if (!body?.id || !Types.ObjectId.isValid(body.id)) {
    return NextResponse.json({ error: "A valid entry id is required" }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);
    const entry = await FuelLog.findOne({ _id: new Types.ObjectId(body.id), userId: uid });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    if (body.meal) entry.meal = body.meal as typeof entry.meal;

    if (typeof body.quantity === "number" && body.quantity > 0 && entry.foodId) {
      const food = await FuelFood.findById(entry.foodId).lean();
      if (!food) return NextResponse.json({ error: "That food no longer exists." }, { status: 404 });

      const perUnitGrams = entry.portionId
        ? (await FuelPortion.findById(entry.portionId).lean())?.grams ?? 1
        : 1;
      const grams = resolveGrams(body.quantity, perUnitGrams);
      if (grams <= 0 || grams > 10_000) {
        return NextResponse.json({ error: "That portion size doesn't look right." }, { status: 400 });
      }

      const macros = entryMacrosFor(food.per100g, grams);
      entry.quantity = body.quantity;
      entry.gramsResolved = grams;
      entry.kcal = macros.kcal;
      entry.proteinG = macros.proteinG;
      entry.carbsG = macros.carbsG;
      entry.fatG = macros.fatG;
      entry.fiberG = macros.fiberG;
      // An AI-drafted row the user corrected is the signal that makes vision
      // accuracy measurable later.
      if (entry.entryMethod === "photo" || entry.entryMethod === "text") entry.wasEdited = true;
    }

    await entry.save();
    return NextResponse.json({ entry: serialize(entry) });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

type LogLike = {
  _id: unknown;
  localDate: string;
  meal: string;
  foodId?: unknown;
  portionId?: unknown;
  foodName: string;
  portionLabel?: string | null;
  quantity: number;
  unit?: string;
  gramsResolved: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  entryMethod: string;
  confidence?: number | null;
  assumptions?: string | null;
  wasEdited?: boolean;
  loggedAt?: Date;
};

function serialize(e: LogLike) {
  return {
    id: String(e._id),
    localDate: e.localDate,
    meal: e.meal,
    foodId: e.foodId ? String(e.foodId) : null,
    portionId: e.portionId ? String(e.portionId) : null,
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
  };
}
