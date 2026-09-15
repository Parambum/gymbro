import { describe, it, expect } from "vitest";
import { allowedFor, generateMealPlan, inferRole, type PlannableFood } from "./meal-plan";
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

const food = (
  id: string,
  name: string,
  p100: Per100g,
  role: PlannableFood["role"],
  vegFlag: PlannableFood["vegFlag"] = "veg",
  portions: PlannableFood["portions"] = [{ id: `${id}-p`, label: "1 katori", grams: 150 }],
): PlannableFood => ({ id, name, per100g: p100, vegFlag, portions, role });

/** Real per-100g figures, so the plans that come out are sane. */
const DB: PlannableFood[] = [
  food("rice", "Rice, white (cooked)", per(129, 2.67, 28, 0.28), "staple"),
  food("roti", "Roti / Chapati", per(299, 7.85, 46, 9.2), "staple", "veg", [
    { id: "roti-p", label: "1 roti", grams: 40 },
  ]),
  food("dal", "Masoor Dal (cooked)", per(114, 9.02, 19.5, 0.38), "protein"),
  food("paneer", "Paneer", per(299, 15.86, 22.5, 15.5), "dairy"),
  food("curd", "Curd / Dahi", per(61, 3.5, 4.7, 3.2), "dairy"),
  food("chicken", "Chicken Breast", per(165, 31, 0, 3.6), "protein", "nonveg", [
    { id: "ch-p", label: "1 piece (100 g)", grams: 100 },
  ]),
  food("egg", "Egg, whole", per(155, 12.6, 1.1, 10.6), "protein", "egg", [
    { id: "egg-p", label: "1 egg", grams: 50 },
  ]),
  food("palak", "Palak / Spinach", per(23, 2.9, 3.6, 0.4), "vegetable"),
  food("banana", "Banana", per(89, 1.1, 23, 0.3), "fruit", "veg", [
    { id: "ban-p", label: "1 medium", grams: 118 },
  ]),
  food("aloo", "Potato (boiled)", per(87, 1.9, 20, 0.1), "vegetable"),
];

const TARGET = { kcal: 2100, proteinG: 145, carbsG: 250, fatG: 58 };

describe("allowedFor", () => {
  const chicken = DB.find((f) => f.id === "chicken")!;
  const egg = DB.find((f) => f.id === "egg")!;
  const curd = DB.find((f) => f.id === "curd")!;
  const aloo = DB.find((f) => f.id === "aloo")!;

  it("lets a non-vegetarian eat everything", () => {
    for (const f of DB) expect(allowedFor(f, "nonveg")).toBe(true);
  });

  it("keeps meat away from everyone else", () => {
    for (const d of ["veg", "egg", "vegan", "jain"] as const) {
      expect(allowedFor(chicken, d)).toBe(false);
    }
  });

  it("treats eggetarian as its own position, not a shade of vegetarian", () => {
    expect(allowedFor(egg, "egg")).toBe(true);
    expect(allowedFor(egg, "veg")).toBe(false);
    expect(allowedFor(egg, "vegan")).toBe(false);
  });

  it("excludes dairy for vegans only", () => {
    expect(allowedFor(curd, "veg")).toBe(true);
    expect(allowedFor(curd, "vegan")).toBe(false);
  });

  it("excludes root vegetables on a Jain diet", () => {
    expect(allowedFor(aloo, "veg")).toBe(true);
    expect(allowedFor(aloo, "jain")).toBe(false);
  });
});

describe("generateMealPlan", () => {
  it("returns all four meals with food in them", () => {
    const plan = generateMealPlan(DB, TARGET, "nonveg");
    expect(plan.meals).toHaveLength(4);
    expect(plan.meals.every((m) => m.items.length > 0)).toBe(true);
  });

  it("lands somewhere near the calorie target", () => {
    const plan = generateMealPlan(DB, TARGET, "nonveg");
    expect(plan.totals.kcal).toBeGreaterThan(TARGET.kcal * 0.7);
    expect(plan.totals.kcal).toBeLessThan(TARGET.kcal * 1.3);
  });

  it("never prescribes food the diet forbids", () => {
    const vegan = generateMealPlan(DB, TARGET, "vegan");
    const names = vegan.meals.flatMap((m) => m.items.map((i) => i.foodId));
    expect(names).not.toContain("chicken");
    expect(names).not.toContain("egg");
    expect(names).not.toContain("curd");
    expect(names).not.toContain("paneer");
  });

  it("uses household portions rather than raw grams", () => {
    const plan = generateMealPlan(DB, TARGET, "veg");
    const labels = plan.meals.flatMap((m) => m.items.map((i) => i.portionLabel));
    expect(labels.some((l) => /katori|roti|medium|piece|egg/.test(l))).toBe(true);
  });

  it("uses quantities a person would actually measure", () => {
    const plan = generateMealPlan(DB, TARGET, "veg");
    for (const item of plan.meals.flatMap((m) => m.items)) {
      expect([0.5, 1, 1.5, 2, 2.5, 3]).toContain(item.quantity);
    }
  });

  it("is deterministic for a given seed, and varies across seeds", () => {
    const a = JSON.stringify(generateMealPlan(DB, TARGET, "veg", 0));
    const b = JSON.stringify(generateMealPlan(DB, TARGET, "veg", 0));
    const c = JSON.stringify(generateMealPlan(DB, TARGET, "veg", 1));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("scales with the target", () => {
    const small = generateMealPlan(DB, { ...TARGET, kcal: 1500, proteinG: 110 }, "veg");
    const large = generateMealPlan(DB, { ...TARGET, kcal: 3200, proteinG: 190 }, "veg");
    expect(large.totals.kcal).toBeGreaterThan(small.totals.kcal);
  });

  it("splits the day so lunch is the biggest meal", () => {
    const plan = generateMealPlan(DB, TARGET, "nonveg");
    const byMeal = Object.fromEntries(plan.meals.map((m) => [m.meal, m.totals.kcal]));
    expect(byMeal.lunch).toBeGreaterThan(byMeal.snack);
    expect(byMeal.lunch).toBeGreaterThanOrEqual(byMeal.breakfast);
  });

  it("says so when it misses rather than presenting the miss as the answer", () => {
    // one low-calorie food can't build 2100 kcal
    const thin = [DB.find((f) => f.id === "palak")!, DB.find((f) => f.id === "curd")!,
                  DB.find((f) => f.id === "rice")!, DB.find((f) => f.id === "dal")!];
    const plan = generateMealPlan(thin, { ...TARGET, kcal: 4000, proteinG: 220 }, "veg");
    expect(plan.notes.join(" ")).toMatch(/under target|short/i);
  });

  it("refuses to pretend when the database is nearly empty", () => {
    const plan = generateMealPlan(DB.slice(0, 2), TARGET, "veg");
    expect(plan.meals.every((m) => m.items.length === 0)).toBe(true);
    expect(plan.notes.join(" ")).toMatch(/enough foods/i);
  });

  it("always frames itself as an example, not a prescription", () => {
    const plan = generateMealPlan(DB, TARGET, "nonveg");
    expect(plan.notes.join(" ")).toMatch(/not a prescription/i);
  });

  it("totals match the sum of the meals", () => {
    const plan = generateMealPlan(DB, TARGET, "nonveg");
    const summed = plan.meals.reduce((n, m) => n + m.totals.kcal, 0);
    expect(plan.totals.kcal).toBe(summed);
  });
});

describe("inferRole", () => {
  it("reads protein sources from composition", () => {
    expect(inferRole("Chicken Breast", per(165, 31, 0, 3.6))).toBe("protein");
    expect(inferRole("Soya Chunks", per(345, 52, 33, 0.5))).toBe("protein");
  });

  it("knows staples, dairy, fruit and fat by name", () => {
    expect(inferRole("Rice, white (cooked)", per(129, 2.7, 28, 0.3))).toBe("staple");
    expect(inferRole("Curd / Dahi", per(61, 3.5, 4.7, 3.2))).toBe("dairy");
    expect(inferRole("Banana", per(89, 1.1, 23, 0.3))).toBe("fruit");
    expect(inferRole("Mustard Oil", per(884, 0, 0, 100))).toBe("fat");
  });

  it("puts dal with the protein even though it is carb-heavy", () => {
    expect(inferRole("Masoor Dal (cooked)", per(114, 9, 19.5, 0.4))).toBe("protein");
  });

  it("recognises vegetables", () => {
    expect(inferRole("Palak / Spinach (cooked)", per(23, 2.9, 3.6, 0.4))).toBe("vegetable");
    expect(inferRole("Bhindi / Okra", per(33, 1.9, 7, 0.2))).toBe("vegetable");
  });

  it("puts paneer with dairy rather than protein, so a plate isn't all cheese", () => {
    expect(inferRole("Paneer", per(299, 15.9, 22.5, 15.5))).toBe("dairy");
  });
});
