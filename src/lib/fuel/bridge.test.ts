import { describe, it, expect } from "vitest";
import { cycleTarget, exerciseKcal, proteinVerdict, type WeekSlice } from "./bridge";

const BASE = { kcal: 2100, proteinG: 144, carbsG: 250, fatG: 58 };

describe("cycleTarget (§8.1)", () => {
  it("adds 10% carbs on a training day", () => {
    const day = cycleTarget(BASE, true, 4);
    expect(day.carbsG).toBe(275); // 250 + 25
    expect(day.kcal).toBe(2200); // +25 g carbs × 4 kcal
    expect(day.note).toMatch(/training day/i);
  });

  it("takes it back on rest days", () => {
    const day = cycleTarget(BASE, false, 4);
    expect(day.carbsG).toBeLessThan(BASE.carbsG);
    expect(day.kcal).toBeLessThan(BASE.kcal);
    expect(day.note).toMatch(/rest day/i);
  });

  it("holds the weekly total constant — this moves calories, it doesn't create them", () => {
    const training = 4;
    const rest = 7 - training;
    const week =
      cycleTarget(BASE, true, training).kcal * training +
      cycleTarget(BASE, false, training).kcal * rest;
    expect(week).toBeCloseTo(BASE.kcal * 7, -1); // within rounding of whole kcal
  });

  it("leaves protein and fat alone — neither has a reason to swing", () => {
    for (const isTraining of [true, false]) {
      const day = cycleTarget(BASE, isTraining, 4);
      expect(day.proteinG).toBe(BASE.proteinG);
      expect(day.fatG).toBe(BASE.fatG);
    }
  });

  it("shifts more per rest day when there are fewer of them", () => {
    const fewRest = cycleTarget(BASE, false, 6); // 1 rest day funds 6
    const manyRest = cycleTarget(BASE, false, 2); // 5 rest days fund 2
    expect(fewRest.kcal).toBeLessThan(manyRest.kcal);
  });

  it("returns the base target unchanged for a degenerate week", () => {
    // no rest days to take from, and no training days to give to
    expect(cycleTarget(BASE, true, 7)).toMatchObject({ ...BASE, note: null });
    expect(cycleTarget(BASE, false, 0)).toMatchObject({ ...BASE, note: null });
  });

  it("never drives carbs negative", () => {
    const tiny = { kcal: 1500, proteinG: 140, carbsG: 5, fatG: 60 };
    expect(cycleTarget(tiny, false, 6).carbsG).toBeGreaterThanOrEqual(0);
  });
});

describe("exerciseKcal (§8.2)", () => {
  it("scales with bodyweight and distance", () => {
    // ~1 kcal per kg per km running
    expect(exerciseKcal([{ type: "RUN", distanceM: 5000 }], 80)).toBe(400);
    expect(exerciseKcal([{ type: "RUN", distanceM: 5000 }], 60)).toBe(300);
  });

  it("costs less per km on a bike than on foot", () => {
    const ride = exerciseKcal([{ type: "RIDE", distanceM: 10_000 }], 80);
    const run = exerciseKcal([{ type: "RUN", distanceM: 10_000 }], 80);
    expect(ride).toBeLessThan(run);
  });

  it("adds up a day of activities", () => {
    const total = exerciseKcal(
      [
        { type: "RUN", distanceM: 5000 },
        { type: "WALK", distanceM: 2000 },
      ],
      80,
    );
    expect(total).toBe(400 + 80);
  });

  it("counts an unknown activity as zero rather than guessing", () => {
    expect(exerciseKcal([{ type: "PADEL", distanceM: 3000 }], 80)).toBe(0);
  });

  it("is zero for nonsense input", () => {
    expect(exerciseKcal([], 80)).toBe(0);
    expect(exerciseKcal([{ type: "RUN", distanceM: 5000 }], 0)).toBe(0);
    expect(exerciseKcal([{ type: "RUN", distanceM: 5000 }], NaN)).toBe(0);
    expect(exerciseKcal([{ type: "RUN", distanceM: -100 }], 80)).toBe(0);
  });
});

const week = (weekStart: string, avgProteinG: number | null, tonnageKg: number): WeekSlice => ({
  weekStart,
  avgProteinG,
  avgKcal: 2100,
  tonnageKg,
  daysLogged: 5,
});

describe("proteinVerdict (§8.3)", () => {
  it("connects low protein to stalled volume", () => {
    const v = proteinVerdict(
      [week("2026-09-01", 90, 12_000), week("2026-09-08", 88, 12_050)],
      80,
    );
    expect(v.latestProteinPerKg).toBeCloseTo(1.1, 1);
    expect(v.message).toMatch(/didn't move/i);
    expect(v.message).toMatch(/144 g/); // 1.8 × 80
  });

  it("praises volume that is moving on adequate protein", () => {
    const v = proteinVerdict(
      [week("2026-09-01", 150, 10_000), week("2026-09-08", 152, 11_000)],
      80,
    );
    expect(v.tonnageChangePct).toBe(10);
    expect(v.message).toMatch(/working/i);
  });

  it("flags low protein even when volume is climbing", () => {
    const v = proteinVerdict(
      [week("2026-09-01", 100, 10_000), week("2026-09-08", 100, 11_000)],
      80,
    );
    expect(v.message).toMatch(/under the 1\.8/);
  });

  it("stays silent rather than guessing from thin data", () => {
    // one week is not a trend
    expect(proteinVerdict([week("2026-09-08", 90, 12_000)], 80).message).toBeNull();
    // no bodyweight means no g/kg
    expect(
      proteinVerdict([week("2026-09-01", 90, 1), week("2026-09-08", 90, 1)], null).message,
    ).toBeNull();
    // barely-logged weeks don't count
    const sparse = { ...week("2026-09-08", 90, 12_000), daysLogged: 1 };
    expect(proteinVerdict([week("2026-09-01", 90, 12_000), sparse], 80).message).toBeNull();
  });

  it("says nothing when protein is fine and volume is flat", () => {
    const v = proteinVerdict(
      [week("2026-09-01", 150, 10_000), week("2026-09-08", 150, 10_050)],
      80,
    );
    expect(v.message).toBeNull();
  });
});
