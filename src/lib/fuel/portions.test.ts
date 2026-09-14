import { describe, it, expect } from "vitest";
import { resolveGrams, scalePer100g } from "./portions";
import { ACTIVITY_LEVELS, activityMultiplier, addMacros, macroPreset, round, roundMacros, ZERO_MACROS } from "./types";

describe("resolveGrams", () => {
  it("multiplies quantity by the portion weight", () => {
    expect(resolveGrams(2, 40)).toBe(80); // two rotis
    expect(resolveGrams(1, 200)).toBe(200); // one medium katori
  });

  it("handles fractional quantities without float drift", () => {
    expect(resolveGrams(1.5, 150)).toBe(225);
    expect(resolveGrams(0.5, 118)).toBe(59);
    // 3 × 0.1-style inputs must not produce 4.000000000000001
    expect(resolveGrams(3, 1.1)).toBe(3.3);
  });

  it("returns 0 rather than NaN for half-typed or nonsense input", () => {
    // a number field mid-edit hands us NaN; the preview must render blank, not "NaN kcal"
    expect(resolveGrams(NaN, 40)).toBe(0);
    expect(resolveGrams(2, NaN)).toBe(0);
    expect(resolveGrams(Infinity, 40)).toBe(0);
    expect(resolveGrams(0, 40)).toBe(0);
    expect(resolveGrams(-2, 40)).toBe(0);
    expect(resolveGrams(2, 0)).toBe(0);
  });
});

describe("scalePer100g", () => {
  it("scales a per-100g figure to an actual weight", () => {
    // masoor dal: 114 kcal/100g, one small katori = 150 g
    expect(scalePer100g(114, 150)).toBeCloseTo(171, 5);
    expect(scalePer100g(9.02, 150)).toBeCloseTo(13.53, 5);
  });

  it("is zero at zero grams, and safe on nonsense", () => {
    expect(scalePer100g(114, 0)).toBe(0);
    expect(scalePer100g(NaN, 150)).toBe(0);
    expect(scalePer100g(114, NaN)).toBe(0);
  });
});

describe("rounding", () => {
  it("rounds half away from zero without float drift", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(114.44, 0)).toBe(114);
  });

  it("gives calories whole numbers and macros one decimal", () => {
    expect(roundMacros({ kcal: 170.99, proteinG: 13.533, carbsG: 29.25, fatG: 0.57, fiberG: 11.85 })).toEqual({
      kcal: 171,
      proteinG: 13.5,
      carbsG: 29.3,
      fatG: 0.6,
      fiberG: 11.9,
    });
  });
});

describe("macro totals", () => {
  it("adds component-wise and starts from a true zero", () => {
    const a = { kcal: 171, proteinG: 13.5, carbsG: 29.3, fatG: 0.6, fiberG: 11.9 };
    expect(addMacros(ZERO_MACROS, a)).toEqual(a);
    expect(addMacros(a, a).kcal).toBe(342);
  });
});

describe("activity levels", () => {
  it("exposes the Mifflin-St Jeor multipliers in ascending order", () => {
    const multipliers = ACTIVITY_LEVELS.map((a) => a.multiplier);
    expect(multipliers).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
    expect([...multipliers].sort((x, y) => x - y)).toEqual(multipliers);
  });

  it("looks up by slug and falls back to sedentary on an unknown level", () => {
    expect(activityMultiplier("moderate")).toBe(1.55);
    expect(activityMultiplier("athlete")).toBe(1.9);
    // a profile written before a level was renamed must not crash the engine
    expect(activityMultiplier("nonsense" as never)).toBe(1.2);
  });
});

describe("macro presets", () => {
  it("keeps every preset inside the spec's protein band", () => {
    for (const preset of ["balanced", "high-protein", "low-carb"] as const) {
      const p = macroPreset(preset);
      expect(p.proteinGPerKg).toBeGreaterThanOrEqual(1.6);
      expect(p.proteinGPerKg).toBeLessThanOrEqual(2.2);
      expect(p.fatPctKcal).toBeGreaterThan(0);
      expect(p.fatPctKcal).toBeLessThan(0.6);
    }
  });

  it("falls back to balanced for a custom or unknown split", () => {
    expect(macroPreset("custom").slug).toBe("balanced");
  });
});
