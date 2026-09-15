/**
 * Open Food Facts — barcode lookup for packaged goods (§6, source 2).
 *
 * OFF is crowd-sourced, free and needs no key, which makes it the right tool
 * for barcodes and the wrong one for trust: a product's numbers were typed in
 * by whoever last scanned it. So anything from here lands as `isVerified:
 * false` and the UI badges it, unlike the USDA seed set.
 *
 * The mapping is split out from the fetch so it can be tested without the
 * network — OFF's payloads are inconsistent enough that the mapping is where
 * the bugs live.
 */

import type { Per100g, VegFlag } from "./types";

export interface OffProduct {
  barcode: string;
  name: string;
  brand: string | null;
  per100g: Per100g;
  vegFlag: VegFlag;
  servingGrams: number | null;
}

/** The `fields` list — asking for everything makes the response ~10× bigger. */
const FIELDS = [
  "product_name",
  "product_name_en",
  "brands",
  "nutriments",
  "serving_quantity",
  "ingredients_analysis_tags",
  "quantity",
].join(",");

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Energy per 100 g. OFF stores kcal when it has it and kJ when it doesn't,
 * and occasionally both under different keys.
 */
function kcalFrom(n: Record<string, unknown>): number | null {
  const kcal = num(n["energy-kcal_100g"]) ?? num(n["energy-kcal"]);
  if (kcal != null) return kcal;
  const kj = num(n["energy_100g"]) ?? num(n["energy-kj_100g"]);
  return kj != null ? kj / 4.184 : null;
}

/**
 * Sodium in mg. OFF gives sodium in *grams*, and for many products only salt
 * — which is sodium × 2.5 by the standard conversion.
 */
function sodiumMgFrom(n: Record<string, unknown>): number {
  const sodiumG = num(n["sodium_100g"]);
  if (sodiumG != null) return Math.round(sodiumG * 1000);
  const saltG = num(n["salt_100g"]);
  if (saltG != null) return Math.round((saltG / 2.5) * 1000);
  return 0;
}

/** OFF's own ingredient analysis, which is the only veg signal it offers. */
function vegFlagFrom(tags: unknown): VegFlag {
  if (!Array.isArray(tags)) return "unknown";
  const t = tags.map(String);
  if (t.includes("en:vegan")) return "veg";
  if (t.includes("en:vegetarian")) return "veg";
  if (t.includes("en:non-vegetarian")) return "nonveg";
  return "unknown";
}

/**
 * Map an OFF payload to our shape, or null if it is too incomplete to log.
 *
 * "Too incomplete" is deliberately strict: a product with no energy and no
 * macros would otherwise enter the database as a zero-calorie food and
 * silently corrupt every day it appears in.
 */
export function mapOffProduct(barcode: string, payload: unknown): OffProduct | null {
  const root = payload as { product?: Record<string, unknown>; status?: number } | null;
  const p = root?.product;
  if (!p) return null;

  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kcal = kcalFrom(n);
  const proteinG = num(n["proteins_100g"]);
  const carbsG = num(n["carbohydrates_100g"]);
  const fatG = num(n["fat_100g"]);

  if (kcal == null || proteinG == null || carbsG == null || fatG == null) return null;
  if (kcal < 0 || kcal > 900) return null;
  if ([proteinG, carbsG, fatG].some((v) => v < 0 || v > 100)) return null;

  const name = String(p.product_name_en || p.product_name || "").trim();
  if (!name) return null;

  const brand = String(p.brands ?? "")
    .split(",")[0]
    .trim();

  return {
    barcode,
    name,
    brand: brand || null,
    per100g: {
      kcal: Math.round(kcal * 10) / 10,
      proteinG: Math.round(proteinG * 100) / 100,
      carbsG: Math.round(carbsG * 100) / 100,
      fatG: Math.round(fatG * 100) / 100,
      fiberG: Math.max(0, num(n["fiber_100g"]) ?? 0),
      sugarG: Math.max(0, num(n["sugars_100g"]) ?? 0),
      sodiumMg: sodiumMgFrom(n),
    },
    vegFlag: vegFlagFrom(p.ingredients_analysis_tags),
    servingGrams: num(p.serving_quantity),
  };
}

/** A barcode is 8–14 digits. Anything else is a misread, not a lookup. */
export function isValidBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
}

/**
 * Fetch one product. Returns null for "OFF doesn't know this barcode", which
 * the caller caches as a miss so the next scan of the same packet answers
 * instantly instead of paying the round trip again.
 */
export async function fetchOffProduct(barcode: string): Promise<OffProduct | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
    {
      headers: { "user-agent": "GymBroFuel/1.0 (github.com/Parambum/gymbro)" },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  return mapOffProduct(barcode, await res.json());
}
