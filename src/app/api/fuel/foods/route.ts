import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { FuelLog } from "@/models/FuelLog";
import { createFood, fuelGuard } from "@/lib/fuel/server";
import { FuelCustomFoodSchema } from "@/lib/validation";
import { entryMacrosFor } from "@/lib/fuel/log";

export const runtime = "nodejs";

/**
 * POST /api/fuel/foods — create a custom food.
 *
 * Stored `isVerified: false`, always. These numbers came from a person reading
 * a packet, and §12 is explicit that an unsourced figure must never be
 * presented as fact — the search row and the portion sheet both badge it.
 *
 * Owned by its creator: `ownerUserId` is set, so it appears in that user's
 * search and nobody else's.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const parsed = FuelCustomFoodSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const f = parsed.data;

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    const foodId = await createFood({
      name: f.name,
      brand: f.brand ?? null,
      source: "user",
      sourceRef: null,
      per100g: f.per100g,
      vegFlag: f.vegFlag,
      aliases: f.aliases,
      barcode: f.barcode ?? null,
      isVerified: false,
      ownerUserId: uid,
      portions:
        f.servingLabel && f.servingGrams
          ? [{ label: f.servingLabel, grams: f.servingGrams }]
          : [],
    });

    const food = await FuelFood.findById(foodId).lean();
    const portions = await FuelPortion.find({ foodId }).sort({ sortOrder: 1 }).lean();
    const def = portions.find((p) => p.isDefault) ?? portions[0];

    return NextResponse.json(
      {
        food: {
          id: String(foodId),
          name: food!.name,
          brand: food!.brand ?? null,
          isVerified: false,
          vegFlag: food!.vegFlag,
          source: "user",
          reason: "match" as const,
          per100g: food!.per100g,
          portions: portions.map((p) => ({
            id: String(p._id),
            label: p.label,
            grams: p.grams,
            unit: p.unit,
            isDefault: Boolean(p.isDefault),
          })),
          defaultPortion: def
            ? {
                id: String(def._id),
                label: def.label,
                grams: def.grams,
                ...entryMacrosFor(food!.per100g, def.grams),
              }
            : null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[fuel/foods] create failed:", err);
    return NextResponse.json(
      { error: "Could not save. Check the database connection." },
      { status: 503 },
    );
  }
}

/** GET /api/fuel/foods — the user's own foods and recipes. */
export async function GET() {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  try {
    await connectDB();
    const foods = await FuelFood.find({ ownerUserId: new Types.ObjectId(guard.userId) })
      .sort({ name: 1 })
      .limit(200)
      .lean();

    return NextResponse.json({
      foods: foods.map((f) => ({
        id: String(f._id),
        name: f.name,
        brand: f.brand ?? null,
        source: f.source,
        isVerified: Boolean(f.isVerified),
        per100g: f.per100g,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/**
 * DELETE /api/fuel/foods?id=… — remove one of the user's own foods.
 *
 * Past log entries are untouched: they carry their own macro snapshot and food
 * name, so a deleted food leaves history intact rather than blanking it out.
 * Only the pointer goes stale, which nothing reads.
 */
export async function DELETE(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "A valid food id is required" }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);
    const foodId = new Types.ObjectId(id);

    // Scoping to ownerUserId is the authorisation: a global or another user's
    // food simply is not found.
    const res = await FuelFood.deleteOne({ _id: foodId, ownerUserId: uid });
    if (res.deletedCount === 0) {
      return NextResponse.json({ error: "Food not found" }, { status: 404 });
    }
    await FuelPortion.deleteMany({ foodId });
    await FuelLog.updateMany({ userId: uid, foodId }, { $set: { foodId: null, portionId: null } });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
