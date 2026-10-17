import { describe, expect, it } from "vitest";
import table from "@/lib/data/food-vision-classes.json";
import { centreSquare, rgbaToPlanar } from "./preprocess";
import { confidenceLabel, topK, verdict } from "./ranking";
import { macrosFor, proteinDensity, sumMacros, type VisionClassTable } from "./classes";

const classes = (table as unknown as VisionClassTable).classes;

describe("preprocessing matches training", () => {
  it("takes the centred square, like common.center_square", () => {
    expect(centreSquare(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
    expect(centreSquare(300, 400)).toEqual({ sx: 0, sy: 50, side: 300 });
    expect(centreSquare(224, 224)).toEqual({ sx: 0, sy: 0, side: 224 });
  });

  it("lays RGBA out as planar RGB, 0–255, alpha dropped", () => {
    // 2×2 image: red, green, blue, white
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 128, 255, 255, 255, 0]);
    expect(Array.from(rgbaToPlanar(rgba, 2))).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  });

  it("refuses a buffer of the wrong size rather than reading garbage", () => {
    expect(() => rgbaToPlanar(new Uint8ClampedArray(10), 2)).toThrow();
  });
});

describe("ranking", () => {
  const keys = ["a", "b", "c", "d"];

  it("returns the best k, best first", () => {
    expect(topK([0.1, 0.6, 0.05, 0.25], keys, 2)).toEqual([
      { key: "b", prob: 0.6 },
      { key: "d", prob: 0.25 },
    ]);
  });

  it("catches a model/label mismatch", () => {
    expect(() => topK([0.5, 0.5], keys)).toThrow();
  });

  it("leads with one answer only when confident and clear of the runner-up", () => {
    expect(verdict([{ key: "a", prob: 0.8 }, { key: "b", prob: 0.1 }], 0.5).kind).toBe("confident");
    expect(verdict([{ key: "a", prob: 0.4 }, { key: "b", prob: 0.1 }], 0.5).kind).toBe("unsure");
    // above threshold, but a near tie is still an either-or
    expect(verdict([{ key: "a", prob: 0.55 }, { key: "b", prob: 0.45 }], 0.5).kind).toBe("unsure");
  });

  it("never claims 0% or 100%", () => {
    expect(confidenceLabel(0.9999)).toBe("99%");
    expect(confidenceLabel(0.001)).toBe("1%");
  });
});

describe("the class table the app ships", () => {
  it("covers every class, with a label", () => {
    expect(Object.keys(classes).length).toBeGreaterThan(100);
    for (const [key, c] of Object.entries(classes)) {
      expect(c.label, key).toBeTruthy();
    }
  });

  it("has sane composition and servings for every item", () => {
    for (const [key, c] of Object.entries(classes)) {
      for (const f of [...c.items, ...c.alts]) {
        expect(f.per100g.kcal, `${key}: ${f.name}`).toBeGreaterThanOrEqual(0);
        expect(f.per100g.kcal, `${key}: ${f.name}`).toBeLessThanOrEqual(900);
        expect(f.servings.length, `${key}: ${f.name}`).toBeGreaterThan(0);
        expect(f.serving.grams, `${key}: ${f.name}`).toBeGreaterThan(0);
        expect(f.serving.grams, `${key}: ${f.name}`).toBeLessThan(1500);
        // the macros must roughly add up to the energy (4/4/9), or the row is broken
        const atwater = 4 * f.per100g.proteinG + 4 * f.per100g.carbsG + 9 * f.per100g.fatG;
        if (f.per100g.kcal > 20) {
          expect(Math.abs(atwater - f.per100g.kcal) / f.per100g.kcal, `${key}: ${f.name}`).toBeLessThan(0.35);
        }
      }
    }
  });

  it("never ships an INDB row with the fried-in-full-oil signature", () => {
    for (const c of Object.values(classes)) {
      for (const f of [...c.items, ...c.alts]) {
        if (f.source === "indb") expect(f.per100g.fatG).toBeLessThanOrEqual(35);
      }
    }
  });

  it("logs a combination dish as its parts", () => {
    const cb = classes.chole_bhature;
    expect(cb.items.length).toBe(2);
    const total = sumMacros(cb.items.map((i) => macrosFor(i, i.serving.grams)));
    expect(total.kcal).toBeGreaterThan(400);
  });

  it("protein density reads per 100 kcal", () => {
    expect(proteinDensity({ kcal: 200, proteinG: 30, carbsG: 0, fatG: 8, fiberG: 0 })).toBe(15);
    expect(proteinDensity({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 })).toBeNull();
  });
});
