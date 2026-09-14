import { describe, it, expect } from "vitest";
import { entryMacrosFor, groupByMeal, loggingStreak, totalsFor } from "./log";
import type { Meal } from "./types";

/** Masoor dal, as actually fetched from USDA (fdcId 175254), per 100 g. */
const DAL = { kcal: 114, proteinG: 9.02, carbsG: 19.5, fatG: 0.38, fiberG: 7.9 };

describe("entryMacrosFor", () => {
  it("scales composition to the portion actually eaten", () => {
    // one small katori = 150 g
    expect(entryMacrosFor(DAL, 150)).toEqual({
      kcal: 171,
      proteinG: 13.5,
      carbsG: 29.3,
      fatG: 0.6,
      fiberG: 11.9,
    });
  });

  it("is the identity at 100 g", () => {
    const m = entryMacrosFor(DAL, 100);
    expect(m.kcal).toBe(114);
    expect(m.proteinG).toBe(9);
  });

  it("is zero at zero grams", () => {
    expect(entryMacrosFor(DAL, 0)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
  });

  it("treats missing fibre as zero rather than NaN", () => {
    const noFibre = { kcal: 100, proteinG: 5, carbsG: 10, fatG: 2 };
    expect(entryMacrosFor(noFibre, 200).fiberG).toBe(0);
  });
});

const entry = (meal: Meal, kcal: number, proteinG = 0) => ({
  meal,
  kcal,
  proteinG,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
});

describe("totalsFor", () => {
  it("sums a day", () => {
    const t = totalsFor([entry("breakfast", 400, 30), entry("lunch", 650, 45), entry("dinner", 700, 50)]);
    expect(t.kcal).toBe(1750);
    expect(t.proteinG).toBe(125);
  });

  it("rounds once at the end so repeated addition can't drift", () => {
    const third = { meal: "snack" as Meal, kcal: 0, proteinG: 0.1, carbsG: 0.2, fatG: 0, fiberG: 0 };
    const t = totalsFor(Array(10).fill(third));
    expect(t.proteinG).toBe(1);
    expect(t.carbsG).toBe(2);
  });

  it("is zero for an empty day", () => {
    expect(totalsFor([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
  });
});

describe("groupByMeal", () => {
  it("returns all four meals in order, even the empty ones", () => {
    const grouped = groupByMeal([entry("dinner", 700)]);
    expect(grouped.map((g) => g.meal)).toEqual(["breakfast", "lunch", "snack", "dinner"]);
    expect(grouped[0].entries).toEqual([]);
    expect(grouped[0].totals.kcal).toBe(0);
  });

  it("gives each meal its own subtotal", () => {
    const grouped = groupByMeal([
      entry("breakfast", 300, 20),
      entry("breakfast", 150, 10),
      entry("lunch", 600, 40),
    ]);
    expect(grouped[0].totals.kcal).toBe(450);
    expect(grouped[0].totals.proteinG).toBe(30);
    expect(grouped[1].totals.kcal).toBe(600);
  });
});

describe("loggingStreak", () => {
  it("counts back from today", () => {
    expect(loggingStreak(["2026-09-14", "2026-09-13", "2026-09-12"], "2026-09-14")).toBe(3);
  });

  it("survives a today that hasn't been logged yet", () => {
    // it's 9am and you haven't eaten — the streak still stands from yesterday
    expect(loggingStreak(["2026-09-13", "2026-09-12"], "2026-09-14")).toBe(2);
  });

  it("breaks after a full day of silence", () => {
    expect(loggingStreak(["2026-09-12", "2026-09-11"], "2026-09-14")).toBe(0);
  });

  it("ignores days beyond the gap", () => {
    expect(loggingStreak(["2026-09-14", "2026-09-13", "2026-09-10", "2026-09-09"], "2026-09-14")).toBe(2);
  });

  it("is zero with nothing logged", () => {
    expect(loggingStreak([], "2026-09-14")).toBe(0);
  });

  it("crosses a month boundary", () => {
    expect(loggingStreak(["2026-09-01", "2026-08-31", "2026-08-30"], "2026-09-01")).toBe(3);
  });
});
