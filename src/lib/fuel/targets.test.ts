import { describe, it, expect } from "vitest";
import { progressFraction, remainingFor, targetForDate, type DatedTarget } from "./targets";

const t = (effectiveFrom: string, kcal: number): DatedTarget => ({
  effectiveFrom,
  kcal,
  proteinG: 144,
  carbsG: 250,
  fatG: 58,
  fiberG: 29,
  waterMl: 2800,
});

const HISTORY = [t("2026-01-01", 2200), t("2026-03-15", 2400), t("2026-06-01", 2000)];

describe("targetForDate", () => {
  it("returns the target that was in force on the day, not the newest one", () => {
    // this is the whole reason targets are append-only
    expect(targetForDate(HISTORY, "2026-02-10")!.kcal).toBe(2200);
    expect(targetForDate(HISTORY, "2026-04-01")!.kcal).toBe(2400);
    expect(targetForDate(HISTORY, "2026-09-14")!.kcal).toBe(2000);
  });

  it("takes effect on its own effectiveFrom date", () => {
    expect(targetForDate(HISTORY, "2026-03-14")!.kcal).toBe(2200);
    expect(targetForDate(HISTORY, "2026-03-15")!.kcal).toBe(2400);
  });

  it("returns null for a day before any target existed", () => {
    expect(targetForDate(HISTORY, "2025-12-31")).toBeNull();
    expect(targetForDate([], "2026-01-01")).toBeNull();
  });

  it("does not depend on input ordering", () => {
    const shuffled = [HISTORY[2], HISTORY[0], HISTORY[1]];
    expect(targetForDate(shuffled, "2026-04-01")!.kcal).toBe(2400);
  });
});

describe("remainingFor", () => {
  const target = t("2026-01-01", 2200);

  it("subtracts what was eaten", () => {
    const r = remainingFor(target, { kcal: 1500, proteinG: 100, carbsG: 180, fatG: 40, fiberG: 20 });
    expect(r.kcal).toBe(700);
    expect(r.proteinG).toBe(44);
    expect(r.overKcal).toBe(false);
  });

  it("goes negative rather than clamping — the UI shows 'over', it doesn't lie", () => {
    const r = remainingFor(target, { kcal: 2420, proteinG: 160, carbsG: 300, fatG: 70, fiberG: 30 });
    expect(r.kcal).toBe(-220);
    expect(r.overKcal).toBe(true);
  });

  it("is not 'over' when exactly on target", () => {
    const r = remainingFor(target, { kcal: 2200, proteinG: 144, carbsG: 250, fatG: 58, fiberG: 29 });
    expect(r.kcal).toBe(0);
    expect(r.overKcal).toBe(false);
  });
});

describe("progressFraction", () => {
  it("is a plain ratio, uncapped past 100%", () => {
    expect(progressFraction(1100, 2200)).toBe(0.5);
    expect(progressFraction(2640, 2200)).toBeCloseTo(1.2, 5);
  });

  it("is zero for a missing or nonsense target", () => {
    expect(progressFraction(1100, 0)).toBe(0);
    expect(progressFraction(NaN, 2200)).toBe(0);
    expect(progressFraction(1100, NaN)).toBe(0);
  });
});
