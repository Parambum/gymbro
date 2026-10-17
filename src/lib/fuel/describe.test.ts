import { describe, expect, it } from "vitest";
import { gramsFor, parsePhrase, servesIn, splitMeal } from "./describe";

describe("splitMeal", () => {
  it("splits on commas and the joining words people actually type", () => {
    expect(splitMeal("2 roti, 1 katori dal aur ek glass doodh")).toEqual([
      "2 roti",
      "1 katori dal",
      "ek glass doodh",
    ]);
    expect(splitMeal("rajma with rice + salad")).toEqual(["rajma", "rice", "salad"]);
  });

  it("ignores empty pieces", () => {
    expect(splitMeal(" ,, curd ,")).toEqual(["curd"]);
  });
});

describe("parsePhrase", () => {
  it("reads a count of the food itself", () => {
    expect(parsePhrase("2 roti")).toMatchObject({ quantity: 2, unit: null, query: "roti" });
  });

  it("reads Hindi number words and household units", () => {
    expect(parsePhrase("ek katori dal")).toMatchObject({ quantity: 1, unit: "katori", query: "dal" });
    expect(parsePhrase("do glass doodh")).toMatchObject({ quantity: 2, unit: "glass", query: "doodh" });
    expect(parsePhrase("aadha plate biryani")).toMatchObject({ quantity: 0.5, unit: "plate", query: "biryani" });
    expect(parsePhrase("dedh roti")).toMatchObject({ quantity: 1.5, query: "roti" });
  });

  it("reads a weight glued to its number", () => {
    expect(parsePhrase("200g paneer")).toMatchObject({ quantity: 200, unit: "g", query: "paneer" });
    expect(parsePhrase("250 ml milk")).toMatchObject({ quantity: 250, unit: "ml", query: "milk" });
  });

  it("reads an amount written after the food", () => {
    expect(parsePhrase("dal 2 katori")).toMatchObject({ quantity: 2, unit: "katori", query: "dal" });
  });

  it("drops filler words but keeps the food's own words", () => {
    expect(parsePhrase("1 bowl of chicken curry")).toMatchObject({ unit: "bowl", query: "chicken curry" });
  });

  it("defaults to one serving when no amount is given", () => {
    expect(parsePhrase("curd")).toMatchObject({ quantity: 1, unit: null, query: "curd" });
  });

  it("does not read 'do' as a number mid-phrase", () => {
    expect(parsePhrase("paneer do pyaza").query).toBe("paneer do pyaza");
  });
});

describe("gramsFor", () => {
  const dal = [
    { label: "1 katori (small)", grams: 150, isDefault: true },
    { label: "1 katori (medium)", grams: 200 },
    { label: "100 g", grams: 100 },
  ];
  const roti = [
    { label: "1 roti / chapati", grams: 40, isDefault: true },
    { label: "100 g", grams: 100 },
  ];

  it("multiplies the default portion for a bare count", () => {
    expect(gramsFor(parsePhrase("2 roti"), roti)).toEqual({ grams: 80, portion: "2 × 1 roti / chapati" });
  });

  it("picks the portion matching a stated unit", () => {
    expect(gramsFor(parsePhrase("1 katori dal"), dal).grams).toBe(150);
  });

  it("uses a stated weight as-is", () => {
    expect(gramsFor(parsePhrase("120 g dal"), dal)).toEqual({ grams: 120, portion: "120 g" });
  });

  it("falls back to 100 g servings when a food has no portions", () => {
    expect(gramsFor(parsePhrase("2 mystery"), []).grams).toBe(200);
  });
});

describe("servesIn", () => {
  const milk = [{ label: "1 glass", grams: 200, isDefault: true }, { label: "100 g", grams: 100 }];
  const biscuits = [{ label: "100 g", grams: 100, isDefault: true }];

  it("rules out foods that don't come in the unit named", () => {
    expect(servesIn(parsePhrase("ek glass doodh"), milk)).toBe(true);
    expect(servesIn(parsePhrase("ek glass doodh"), biscuits)).toBe(false);
  });

  it("accepts anything for a bare count or a weight", () => {
    expect(servesIn(parsePhrase("2 doodh"), biscuits)).toBe(true);
    expect(servesIn(parsePhrase("50 g doodh"), biscuits)).toBe(true);
  });
});
