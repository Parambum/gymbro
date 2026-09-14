import { describe, it, expect } from "vitest";
import { recipePer100g } from "./recipe";
import type { Per100g } from "./types";

const per = (kcal: number, p: number, c: number, f: number): Per100g => ({
  kcal,
  proteinG: p,
  carbsG: c,
  fatG: f,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 0,
});

/** Real numbers: cooked rice and sunflower oil, per 100 g. */
const RICE = per(129, 2.67, 27.99, 0.28);
const OIL = per(884, 0, 0, 100);

describe("recipePer100g", () => {
  it("weights by mass, not by ingredient count", () => {
    // 500 g rice + 5 g oil. Averaging the two per-100g rows would give ~507
    // kcal; the correct answer is barely above plain rice.
    const { per100g, totalGrams } = recipePer100g([
      { grams: 500, per100g: RICE },
      { grams: 5, per100g: OIL },
    ]);
    expect(totalGrams).toBe(505);
    expect(per100g.kcal).toBeCloseTo(136.5, 0);
    expect(per100g.kcal).toBeLessThan(150);
  });

  it("is the identity for a single ingredient", () => {
    const { per100g, totalGrams } = recipePer100g([{ grams: 250, per100g: RICE }]);
    expect(totalGrams).toBe(250);
    expect(per100g.kcal).toBeCloseTo(129, 1);
    expect(per100g.proteinG).toBeCloseTo(2.67, 2);
  });

  it("conserves total energy across the dish", () => {
    const ingredients = [
      { grams: 300, per100g: RICE },
      { grams: 14, per100g: OIL },
    ];
    const { per100g, totalGrams } = recipePer100g(ingredients);
    const fromParts = ingredients.reduce((s, i) => s + (i.per100g.kcal * i.grams) / 100, 0);
    const fromDish = (per100g.kcal * totalGrams) / 100;
    expect(fromDish).toBeCloseTo(fromParts, 0);
  });

  it("scales with servings the way the caller divides it", () => {
    const { totalGrams } = recipePer100g([
      { grams: 400, per100g: RICE },
      { grams: 200, per100g: per(114, 9.02, 19.5, 0.38) },
    ]);
    expect(totalGrams).toBe(600);
    expect(totalGrams / 4).toBe(150); // four servings of 150 g
  });

  it("returns zeros rather than NaN for an empty or weightless recipe", () => {
    expect(recipePer100g([]).totalGrams).toBe(0);
    expect(recipePer100g([]).per100g.kcal).toBe(0);
    expect(recipePer100g([{ grams: 0, per100g: RICE }]).per100g.kcal).toBe(0);
  });

  it("ignores negative ingredient weights instead of subtracting them", () => {
    const { totalGrams } = recipePer100g([
      { grams: 100, per100g: RICE },
      { grams: -50, per100g: OIL },
    ]);
    expect(totalGrams).toBe(100);
  });
});
