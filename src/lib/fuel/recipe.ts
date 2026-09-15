/**
 * Recipe composition: N ingredients → one per-100g food.
 *
 * Pure, and separated from the route because this is where a recipe can go
 * quietly wrong. The whole dish is the weighted sum of its ingredients, then
 * normalised back to 100 g — not an average of their per-100g figures, which
 * is the tempting mistake and would make 5 g of oil count as much as 500 g of
 * rice.
 *
 * Cooking loss is deliberately not modelled. Water boils off and the dish gets
 * denser, so a recipe's per-100g is an underestimate for anything simmered —
 * but guessing an evaporation factor would be inventing data. The user divides
 * by servings they actually ate, which absorbs it.
 */

import { round, type Per100g } from "./types";

export interface RecipeIngredient {
  grams: number;
  per100g: Per100g;
}

export interface RecipeComposition {
  per100g: Per100g;
  totalGrams: number;
}

export function recipePer100g(ingredients: readonly RecipeIngredient[]): RecipeComposition {
  const totalGrams = ingredients.reduce((sum, i) => sum + (i.grams > 0 ? i.grams : 0), 0);

  if (totalGrams <= 0) {
    return {
      totalGrams: 0,
      per100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 },
    };
  }

  // Absolute totals for the whole dish first…
  const totals = ingredients.reduce(
    (sum, i) => {
      const f = i.grams / 100;
      return {
        kcal: sum.kcal + i.per100g.kcal * f,
        proteinG: sum.proteinG + i.per100g.proteinG * f,
        carbsG: sum.carbsG + i.per100g.carbsG * f,
        fatG: sum.fatG + i.per100g.fatG * f,
        fiberG: sum.fiberG + (i.per100g.fiberG ?? 0) * f,
        sugarG: sum.sugarG + (i.per100g.sugarG ?? 0) * f,
        sodiumMg: sum.sodiumMg + (i.per100g.sodiumMg ?? 0) * f,
      };
    },
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 },
  );

  // …then back down to 100 g of the finished dish.
  const scale = 100 / totalGrams;
  return {
    totalGrams: round(totalGrams, 1),
    per100g: {
      kcal: round(totals.kcal * scale, 1),
      proteinG: round(totals.proteinG * scale, 2),
      carbsG: round(totals.carbsG * scale, 2),
      fatG: round(totals.fatG * scale, 2),
      fiberG: round(totals.fiberG * scale, 2),
      sugarG: round(totals.sugarG * scale, 2),
      sodiumMg: round(totals.sodiumMg * scale, 1),
    },
  };
}
