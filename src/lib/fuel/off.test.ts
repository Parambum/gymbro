import { describe, it, expect } from "vitest";
import { isValidBarcode, mapOffProduct } from "./off";

const payload = (nutriments: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  product: { product_name: "Test Biscuit", brands: "Parle, Parle Products", nutriments, ...extra },
});

describe("isValidBarcode", () => {
  it("accepts 8–14 digit codes", () => {
    expect(isValidBarcode("8901058000009")).toBe(true);
    expect(isValidBarcode("12345678")).toBe(true);
  });

  it("rejects misreads", () => {
    expect(isValidBarcode("123")).toBe(false);
    expect(isValidBarcode("890105800000912")).toBe(false);
    expect(isValidBarcode("89010580000A")).toBe(false);
    expect(isValidBarcode("")).toBe(false);
  });
});

describe("mapOffProduct", () => {
  it("reads a well-formed product", () => {
    const p = mapOffProduct(
      "8901058000009",
      payload({
        "energy-kcal_100g": 456,
        proteins_100g: 6.8,
        carbohydrates_100g: 74.2,
        fat_100g: 14.5,
        fiber_100g: 2.1,
        sugars_100g: 26.4,
        sodium_100g: 0.35,
      }),
    );
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Test Biscuit");
    expect(p!.per100g.kcal).toBe(456);
    expect(p!.per100g.sodiumMg).toBe(350); // grams → mg
  });

  it("takes only the first brand", () => {
    const p = mapOffProduct("8901058000009", payload({ "energy-kcal_100g": 100, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 }));
    expect(p!.brand).toBe("Parle");
  });

  it("converts kilojoules when kcal is missing", () => {
    const p = mapOffProduct(
      "8901058000009",
      payload({ energy_100g: 1908, proteins_100g: 6.8, carbohydrates_100g: 74.2, fat_100g: 14.5 }),
    );
    expect(p!.per100g.kcal).toBeCloseTo(456, 0);
  });

  it("derives sodium from salt when sodium is absent", () => {
    const p = mapOffProduct(
      "8901058000009",
      payload({ "energy-kcal_100g": 400, proteins_100g: 5, carbohydrates_100g: 70, fat_100g: 12, salt_100g: 1 }),
    );
    expect(p!.per100g.sodiumMg).toBe(400); // 1 g salt ÷ 2.5 → 0.4 g sodium
  });

  it("reads the veg flag from OFF's own analysis", () => {
    const veg = mapOffProduct(
      "8901058000009",
      payload(
        { "energy-kcal_100g": 100, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 },
        { ingredients_analysis_tags: ["en:vegan", "en:palm-oil-free"] },
      ),
    );
    expect(veg!.vegFlag).toBe("veg");

    const unknown = mapOffProduct("8901058000009", payload({ "energy-kcal_100g": 100, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 }));
    expect(unknown!.vegFlag).toBe("unknown");
  });

  it("refuses a product with no usable nutrition rather than logging it as zero", () => {
    // This is the important one: a half-filled OFF record entering the database
    // as a zero-calorie food would silently corrupt every day it appears on.
    expect(mapOffProduct("8901058000009", payload({}))).toBeNull();
    expect(mapOffProduct("8901058000009", payload({ "energy-kcal_100g": 456 }))).toBeNull();
    expect(
      mapOffProduct("8901058000009", payload({ proteins_100g: 5, carbohydrates_100g: 70, fat_100g: 12 })),
    ).toBeNull();
  });

  it("refuses impossible composition", () => {
    const tooDense = mapOffProduct(
      "8901058000009",
      payload({ "energy-kcal_100g": 4000, proteins_100g: 5, carbohydrates_100g: 70, fat_100g: 12 }),
    );
    expect(tooDense).toBeNull();

    const overweight = mapOffProduct(
      "8901058000009",
      payload({ "energy-kcal_100g": 400, proteins_100g: 500, carbohydrates_100g: 70, fat_100g: 12 }),
    );
    expect(overweight).toBeNull();
  });

  it("refuses a nameless product", () => {
    const p = mapOffProduct("8901058000009", {
      product: { nutriments: { "energy-kcal_100g": 100, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } },
    });
    expect(p).toBeNull();
  });

  it("handles a missing product entirely", () => {
    expect(mapOffProduct("8901058000009", { status: 0 })).toBeNull();
    expect(mapOffProduct("8901058000009", null)).toBeNull();
  });
});
