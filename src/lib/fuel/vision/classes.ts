import { entryMacrosFor } from "@/lib/fuel/log";
import type { MacroTotals, Per100g } from "@/lib/fuel/types";

/**
 * What a recognised class means in food terms — the shape of
 * src/lib/data/food-vision-classes.json, written by
 * scripts/build-vision-classes.mjs.
 */

export interface VisionServing {
  label: string;
  grams: number;
}

export interface VisionFood {
  source: "usda" | "indb" | "off";
  sourceRef: string;
  name: string;
  brand: string | null;
  isVerified: boolean;
  vegFlag: string;
  per100g: Per100g;
  /** The default for a photo: USDA's typical serving where it has one. */
  serving: VisionServing;
  /** How many of `serving` the dish usually is — 2 pav, a 2-egg omelette. */
  defaultQty: number;
  servings: VisionServing[];
}

export interface VisionClass {
  label: string;
  /** What gets logged. Several for a combination dish; none when no trustworthy data exists. */
  items: VisionFood[];
  /** Other versions of the same dish, offered as swaps. */
  alts: VisionFood[];
}

export interface VisionClassTable {
  generatedAt: string;
  count: number;
  classes: Record<string, VisionClass>;
}

export const SOURCE_LABEL: Record<VisionFood["source"], string> = {
  usda: "USDA FoodData Central",
  indb: "Indian Nutrient Databank",
  off: "Packet label (Open Food Facts)",
};

/** Macros for `grams` of a food — the same function the server stores with. */
export function macrosFor(food: Pick<VisionFood, "per100g">, grams: number): MacroTotals {
  return entryMacrosFor(food.per100g, grams);
}

export function sumMacros(parts: MacroTotals[]): MacroTotals {
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const t = parts.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      proteinG: a.proteinG + m.proteinG,
      carbsG: a.carbsG + m.carbsG,
      fatG: a.fatG + m.fatG,
      fiberG: a.fiberG + m.fiberG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
  return { kcal: Math.round(t.kcal), proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG), fiberG: round1(t.fiberG) };
}

/**
 * Grams of protein per 100 kcal — the number a lifter actually shops by.
 * 10+ is a protein food (chicken, paneer, whey); under 3 is mostly fuel.
 */
export function proteinDensity(m: MacroTotals): number | null {
  if (m.kcal <= 0) return null;
  return Math.round((m.proteinG / m.kcal) * 1000) / 10;
}
