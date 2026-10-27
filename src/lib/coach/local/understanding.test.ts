import { describe, expect, it } from "vitest";
import { classify } from "./intent";
import { CANONICAL_FOODS, FOOD_MATCHING, FOOD_MARKER, foodReply, readFoodAsk } from "./food";
import { assessClarity, editDistance, suggestWord } from "./understand";
import { intakeReply, asksForTarget, type DayIntake } from "./nutrition";
import { matchInMemory } from "./food-fixture";
import { targetForDay } from "@/lib/fuel/bridge";

const match = (text: string) => matchInMemory(text, null, FOOD_MATCHING);

describe("classify — food and the user's own eating", () => {
  it("routes a question that names a nutrient to the food database", () => {
    for (const q of [
      "calories in an apple",
      "how many calories are in 2 boiled eggs?",
      "how much protein does 100g paneer have",
      "is paneer high in protein?",
      "apple calories",
      "macros of 2 roti",
    ]) {
      expect(classify(q, null), q).toBe("food");
    }
  });

  it("keeps questions about people, goals and amounts per day as research", () => {
    for (const q of [
      "how much protein for muscle gain",
      "protein for vegetarians",
      "what are the macros for bulking",
    ]) {
      expect(classify(q, null), q).toBe("research");
    }
  });

  it("routes the user's own intake and targets to their Fuel log", () => {
    for (const q of [
      "how many calories have I got left?",
      "my calories today",
      "how much protein have I eaten",
      "what's my calorie target?",
      "how many calories should I eat",
      "protein left today",
    ]) {
      expect(classify(q, null), q).toBe("my-nutrition");
    }
  });

  it("reads a thumbs-up as thanks", () => {
    expect(classify("👍", null)).toBe("thanks");
  });
});

describe("readFoodAsk", () => {
  it("treats a short message that is only food as an implicit lookup", () => {
    expect(readFoodAsk("apple")).toEqual({ text: "apple", nutrient: null, explicit: false });
    expect(readFoodAsk("do roti aur dal")?.text).toBe("do roti aur dal");
  });

  it("strips what someone says around a meal", () => {
    expect(readFoodAsk("I had 2 eggs and toast for breakfast")?.text).toBe("2 eggs and toast");
  });

  it("names the nutrient that was asked for", () => {
    expect(readFoodAsk("how much protein does 100g paneer have")).toMatchObject({ text: "100g paneer", nutrient: "protein", explicit: true });
    expect(readFoodAsk("is paneer high in protein")).toMatchObject({ text: "paneer", nutrient: "protein" });
    expect(readFoodAsk("apple calories")).toMatchObject({ text: "apple", nutrient: "kcal" });
  });

  it("leaves research topics, training words and questions alone", () => {
    expect(readFoodAsk("creatine")).toBeNull();
    expect(readFoodAsk("whey protein")).toBeNull();
    expect(readFoodAsk("legs")).toBeNull();
    expect(readFoodAsk("why do my legs shake")).toBeNull();
    expect(readFoodAsk("how much protein should I eat")).toBeNull();
  });

  it("knows a cut of meat is not a body part", () => {
    expect(readFoodAsk("chicken legs")?.text).toBe("chicken legs");
  });
});

describe("matching against the real food database", () => {
  it("pins every staple to a row that exists and is verified", async () => {
    const usda = (await import("@/lib/data/fuel-foods.json")).default.foods;
    const indb = (await import("@/lib/data/fuel-foods-indb.json")).default.foods;
    const verified = new Set([...usda, ...indb].filter((f) => f.isVerified).map((f) => f.name));
    for (const [, name] of CANONICAL_FOODS) expect(verified.has(name), name).toBe(true);
  });

  it("answers the plain food, not the first alphabetically", async () => {
    const top = async (q: string) => (await match(q)).matches[0]?.food.name;
    expect(await top("apple")).toBe("Apple, raw"); // not "Apple cider"
    expect(await top("banana")).toBe("Bananas, raw"); // not "Banana chips"
    expect(await top("rice")).toBe("Rice, white, cooked, no added fat"); // not a branded pack
    expect(await top("2 roti")).toBe("Chapati/Roti"); // home-cooked, from the Indian databank
  });

  it("prefers unbranded, verified food when nothing is pinned", async () => {
    const peanuts = (await match("peanuts")).matches[0].food;
    expect(peanuts.brand).toBeNull();
    expect(peanuts.isVerified).toBe(true);
    expect((await match("chicken curry")).matches[0].food.name).toBe("Chicken curry"); // not instant noodles
  });

  it("uses the amount and the food's own portions", async () => {
    const { matches } = await match("2 boiled eggs");
    expect(matches[0].food.name).toBe("Egg, whole, cooked, hard-boiled");
    expect(matches[0].phrase.quantity).toBe(2);
    expect(matches[0].grams).toBe(100); // 2 × the medium egg's 50 g
  });

  it("tolerates a typo in a food name", async () => {
    const { matches } = await match("panner");
    expect(matches[0]?.food.name).toMatch(/paneer/i);
  });

  it("never answers a word that only starts like a food", async () => {
    expect((await match("car")).matches).toHaveLength(0); // not carrots
    expect(readFoodAsk("muscle gain")).toBeNull(); // a goal, not a mass gainer
  });

  it("takes a whole Indian meal", async () => {
    const { matches, unclear } = await match("2 roti and 1 katori dal");
    expect(unclear).toEqual([]);
    expect(matches.map((m) => m.food.name).join(" | ")).toMatch(/roti|chapati/i);
    expect(matches[1].portion).toMatch(/katori/);
  });
});

describe("foodReply", () => {
  it("states calories, macros and per-100 g figures, and where they came from", async () => {
    const { matches, unclear } = await match("apple");
    const text = foodReply({ text: "apple", nutrient: null, explicit: false }, matches, unclear, { hideCalories: false, signedIn: true });
    expect(text).toMatch(/\*\*\d+(\.\d)? kcal\*\*/);
    expect(text).toContain("**Per 100 g**");
    expect(text).toContain(FOOD_MARKER);
    expect(text).toContain("USDA FoodData Central");
  });

  it("leads with the nutrient that was asked about", async () => {
    const { matches } = await match("100g paneer");
    const text = foodReply({ text: "100g paneer", nutrient: "protein", explicit: true }, matches, [], { hideCalories: false, signedIn: true });
    expect(text.split("\n")[1]).toMatch(/^- \*\*[\d.]+ g protein\*\*/);
  });

  it("hides calories in eyes-off mode but keeps protein", async () => {
    const { matches } = await match("apple");
    const text = foodReply({ text: "apple", nutrient: null, explicit: false }, matches, [], { hideCalories: true, signedIn: true });
    expect(text).not.toMatch(/kcal/);
    expect(text).toMatch(/protein/);
  });

  it("totals a meal and says what it couldn't find", async () => {
    const { matches, unclear } = await match("2 roti, 1 katori dal, zxqv");
    const text = foodReply({ text: "", nutrient: null, explicit: true }, matches, unclear, { hideCalories: false, signedIn: false });
    const sum = Math.round(matches.reduce((s, m) => s + m.macros.kcal, 0));
    expect(text).toContain(`**Total:** **${sum.toLocaleString("en-IN")} kcal**`);
    expect(text).toContain("**zxqv**");
  });
});

describe("assessClarity", () => {
  it("asks about keyboard mash and stray characters", () => {
    for (const m of ["asdkjh", "lkj lkj lkj", "fdgdfg dfgdfg", "???", "qwerty"]) {
      expect(assessClarity(m).unclear, m).toBe(true);
    }
  });

  it("reads real sentences, Hinglish and chat shorthand", () => {
    for (const m of ["how much protein should i eat", "bhai kitna protein khana chahiye", "wat is deload", "is paneer good for bulking"]) {
      expect(assessClarity(m).unclear, m).toBe(false);
    }
  });

  it("suggests the gym word a typo was meant to be", () => {
    expect(editDistance("protien", "protein")).toBe(1);
    expect(suggestWord("protien")).toBe("protein");
    expect(suggestWord("creatin")).toBe("creatine");
    expect(assessClarity("how much protien should i eat").corrected).toBe("how much protein should i eat");
  });

  it("notices a script it cannot read", () => {
    expect(assessClarity("नमस्ते")).toMatchObject({ unclear: true, otherScript: true });
  });
});

describe("intakeReply", () => {
  const base: DayIntake = {
    onboarded: true,
    eyesOff: false,
    date: "2026-10-27",
    consumed: { kcal: 1240, proteinG: 62, carbsG: 150, fatG: 40, fiberG: 12 },
    target: { kcal: 2300, proteinG: 140, carbsG: 260, fatG: 70, fiberG: 32, waterMl: 2500, effectiveFrom: "2026-10-01" },
    notes: [],
    items: 4,
    meals: ["breakfast", "lunch"],
  };

  it("says what's left of the day", () => {
    const text = intakeReply(base, "today");
    expect(text).toContain("**1,240 kcal** of 2,300 (54%) — **1,060 left**");
    expect(text).toContain("Protein 62 / 140 g (78 g left)");
  });

  it("says 'over' plainly rather than hiding it", () => {
    expect(intakeReply({ ...base, consumed: { ...base.consumed, kcal: 2520 } }, "today")).toContain("**220 over**");
  });

  it("hides calories in eyes-off mode", () => {
    const text = intakeReply({ ...base, eyesOff: true }, "today");
    expect(text).not.toMatch(/kcal/);
    expect(text).toContain("Protein 62 / 140 g");
  });

  it("sends someone without Fuel set up to set it up, without inventing a number", () => {
    const text = intakeReply({ ...base, onboarded: false, target: null, items: 0 }, "target");
    expect(text).toMatch(/haven't set up \*\*Fuel\*\*/);
    expect(text).not.toMatch(/\d{3,} kcal/);
  });

  it("knows a target question from a today question", () => {
    expect(asksForTarget("what's my calorie target")).toBe(true);
    expect(asksForTarget("how many calories should I eat")).toBe(true);
    expect(asksForTarget("calories left today")).toBe(false);
  });
});

describe("targetForDay", () => {
  const target = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 };
  const day = { calorieCycling: false, exerciseCalories: false, isTrainingDay: true, trainingDaysLast7: 4, activities: [], weightKg: 70 };

  it("is the stored target when both toggles are off", () => {
    expect(targetForDay(target, day).target).toEqual(target);
  });

  it("adds cardio back only behind its toggle, and says so", () => {
    const run = [{ type: "RUN", distanceM: 5000 }];
    expect(targetForDay(target, { ...day, activities: run }).target.kcal).toBe(2000);
    const on = targetForDay(target, { ...day, exerciseCalories: true, activities: run });
    expect(on.target.kcal).toBe(2350); // 1.0 kcal/kg/km × 70 kg × 5 km
    expect(on.notes[0]).toMatch(/^\+350 kcal/);
  });
});
