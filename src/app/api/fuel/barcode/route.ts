import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { FuelBarcodeCache } from "@/models/FuelBarcodeCache";
import { createFood, fuelGuard } from "@/lib/fuel/server";
import { fetchOffProduct, isValidBarcode } from "@/lib/fuel/off";
import { entryMacrosFor } from "@/lib/fuel/log";

export const runtime = "nodejs";

/** How long a "not in Open Food Facts" answer stays believed. */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/fuel/barcode?code=8901058000009
 *
 * Cache first, then Open Food Facts. Every hit is written into `fuelfoods` so
 * the second person to scan the same packet never waits on the network — and
 * so the food then shows up in ordinary search too.
 *
 * Misses are cached as well, with a shorter life. "OFF doesn't have this" is
 * a useful answer to give instantly, but products get added, so the miss
 * expires and the next scan tries again.
 */
export async function GET(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim();
  if (!isValidBarcode(code)) {
    return NextResponse.json({ error: "That doesn't look like a barcode." }, { status: 400 });
  }

  try {
    await connectDB();

    const cached = await FuelBarcodeCache.findOne({ barcode: code }).lean();
    if (cached?.foodId) {
      const food = await FuelFood.findById(cached.foodId).lean();
      if (food) return NextResponse.json({ found: true, cached: true, food: await shape(food) });
    }
    if (cached && !cached.foodId) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      if (age < MISS_TTL_MS) {
        return NextResponse.json({ found: false, cached: true, barcode: code });
      }
    }

    let product;
    try {
      product = await fetchOffProduct(code);
    } catch (err) {
      // Upstream being down is not the same as the product not existing, and
      // must not be cached as a miss.
      console.error("[fuel/barcode] Open Food Facts failed:", err);
      return NextResponse.json(
        { error: "Couldn't reach the barcode database. Try again, or add the food by hand." },
        { status: 503 },
      );
    }

    if (!product) {
      await FuelBarcodeCache.findOneAndUpdate(
        { barcode: code },
        { $set: { foodId: null, fetchedAt: new Date() } },
        { upsert: true },
      );
      return NextResponse.json({ found: false, cached: false, barcode: code });
    }

    // A packaged product's serving size is the useful default; grams second.
    const portions = product.servingGrams
      ? [{ label: `1 serving (${Math.round(product.servingGrams)} g)`, grams: product.servingGrams }]
      : [];

    const foodId = await createFood({
      name: product.name,
      brand: product.brand,
      source: "off",
      sourceRef: code,
      per100g: product.per100g,
      vegFlag: product.vegFlag,
      barcode: code,
      // Crowd-sourced: trusted enough to log, not enough to call verified.
      isVerified: false,
      ownerUserId: null,
      portions,
    });

    await FuelBarcodeCache.findOneAndUpdate(
      { barcode: code },
      { $set: { foodId, fetchedAt: new Date() } },
      { upsert: true },
    );

    const food = await FuelFood.findById(foodId).lean();
    return NextResponse.json({ found: true, cached: false, food: await shape(food!) });
  } catch (err) {
    console.error("[fuel/barcode] failed:", err);
    return NextResponse.json({ error: "Barcode lookup is unavailable right now." }, { status: 503 });
  }
}

/** The same row shape the search endpoint returns, so the sheet reuses it. */
async function shape(food: Record<string, unknown> & { _id: Types.ObjectId }) {
  const portions = await FuelPortion.find({ foodId: food._id }).sort({ sortOrder: 1 }).lean();
  const def = portions.find((p) => p.isDefault) ?? portions[0] ?? null;
  const per100g = food.per100g as Parameters<typeof entryMacrosFor>[0];

  return {
    id: String(food._id),
    name: String(food.name),
    brand: (food.brand as string | null) ?? null,
    isVerified: Boolean(food.isVerified),
    vegFlag: String(food.vegFlag ?? "unknown"),
    source: String(food.source),
    reason: "match" as const,
    per100g,
    portions: portions.map((p) => ({
      id: String(p._id),
      label: p.label,
      grams: p.grams,
      unit: p.unit,
      isDefault: Boolean(p.isDefault),
    })),
    defaultPortion: def
      ? { id: String(def._id), label: def.label, grams: def.grams, ...entryMacrosFor(per100g, def.grams) }
      : null,
  };
}
