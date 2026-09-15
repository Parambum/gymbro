import { describe, it, expect } from "vitest";
import { estimateAdaptiveTdee, shouldRefreshTarget, type IntakeDay } from "./adaptive";
import { withWeightTrend } from "./trend";

const iso = (dayOffset: number) =>
  new Date(Date.UTC(2026, 7, 1) + dayOffset * 86_400_000).toISOString().slice(0, 10);

/** `days` of eating `kcal` while the scale moves `kgPerDay`. */
function scenario(days: number, kcal: number, kgPerDay: number, startKg = 85) {
  const intake: IntakeDay[] = Array.from({ length: days }, (_, i) => ({ date: iso(i), kcal }));
  const weights = Array.from({ length: days }, (_, i) => ({
    date: iso(i),
    weightKg: startKg + kgPerDay * i,
  }));
  return { intake, trend: withWeightTrend(weights) };
}

describe("estimateAdaptiveTdee — the energy-balance identity", () => {
  it("finds a burn above intake when weight is falling", () => {
    // 2,000 kcal/day, losing 0.1 kg/day → ~2,000 + 770
    const { intake, trend } = scenario(30, 2000, -0.1);
    const e = estimateAdaptiveTdee(intake, trend, 2100);
    expect(e.tdee).toBeGreaterThan(2500);
    expect(e.confidence).toBe("high");
  });

  it("finds a burn below intake when weight is rising", () => {
    const { intake, trend } = scenario(30, 3000, 0.05);
    const e = estimateAdaptiveTdee(intake, trend, 2900);
    expect(e.tdee).toBeLessThan(3000);
  });

  it("equals intake when weight is genuinely flat", () => {
    const { intake, trend } = scenario(30, 2400, 0);
    const e = estimateAdaptiveTdee(intake, trend, 2400);
    expect(e.tdee).toBeGreaterThan(2300);
    expect(e.tdee).toBeLessThan(2500);
  });

  it("reads intake, not obedience — missing the target doesn't corrupt it", () => {
    // Someone who "failed" their 1,800 target and ate 2,600 while holding
    // weight is burning 2,600. The estimate should say so.
    const { intake, trend } = scenario(30, 2600, 0);
    const e = estimateAdaptiveTdee(intake, trend, 1900);
    expect(e.tdee).toBeGreaterThan(2400);
  });

  it("ignores the formula entirely once confidence is high", () => {
    const { intake, trend } = scenario(30, 2000, -0.1);
    const wildlyWrong = estimateAdaptiveTdee(intake, trend, 900);
    const alsoWrong = estimateAdaptiveTdee(intake, trend, 4000);
    expect(wildlyWrong.tdee).toBe(alsoWrong.tdee);
  });

  it("blends toward the formula while the data is thin", () => {
    // 15 logged days over 15 → medium, so the formula still pulls a little
    const { intake, trend } = scenario(15, 2000, -0.1);
    const low = estimateAdaptiveTdee(intake, trend, 1500);
    const high = estimateAdaptiveTdee(intake, trend, 3500);
    expect(low.tdee).not.toBe(high.tdee);
    expect(low.confidence).toBe("medium");
  });
});

describe("estimateAdaptiveTdee — refusing to guess", () => {
  it("says nothing before ten logged days", () => {
    const { intake, trend } = scenario(6, 2000, -0.1);
    const e = estimateAdaptiveTdee(intake, trend, 2100);
    expect(e.tdee).toBeNull();
    expect(e.confidence).toBe("none");
    expect(e.note).toMatch(/more logged/i);
  });

  it("says nothing over too short a span, however many days are logged", () => {
    const intake: IntakeDay[] = Array.from({ length: 12 }, () => ({ date: iso(0), kcal: 2000 }));
    const { trend } = scenario(12, 2000, -0.1);
    const e = estimateAdaptiveTdee(intake, trend, 2100);
    expect(e.tdee).toBeNull();
  });

  it("handles no data at all", () => {
    expect(estimateAdaptiveTdee([], [], 2100).tdee).toBeNull();
    expect(estimateAdaptiveTdee([], [], null).confidence).toBe("none");
  });

  it("rejects an implausible result rather than reporting it", () => {
    // 5 kg/day is a data-entry disaster, not a metabolism
    const { intake, trend } = scenario(30, 2000, -5);
    const e = estimateAdaptiveTdee(intake, trend, 2100);
    expect(e.tdee).toBeNull();
    expect(e.note).toMatch(/don't add up/i);
  });

  it("grades confidence on how completely the window was logged", () => {
    const full = scenario(30, 2200, -0.05);
    expect(estimateAdaptiveTdee(full.intake, full.trend, 2300).confidence).toBe("high");

    // same span, but only every third day logged
    const sparse = {
      intake: full.intake.filter((_, i) => i % 3 === 0),
      trend: full.trend,
    };
    const e = estimateAdaptiveTdee(sparse.intake, sparse.trend, 2300);
    expect(["low", "none"]).toContain(e.confidence);
  });
});

describe("the reported note", () => {
  it("states the gap as a fact, never as a failure", () => {
    const { intake, trend } = scenario(30, 2000, -0.1);
    const note = estimateAdaptiveTdee(intake, trend, 2100).note!;
    expect(note).toMatch(/more than the formula assumed/i);
    expect(note).not.toMatch(/fail|should have|too much|lazy|bad/i);
  });

  it("calls out an unusually close match", () => {
    const { intake, trend } = scenario(30, 2400, 0);
    const e = estimateAdaptiveTdee(intake, trend, e0(intake, trend));
    expect(e.note).toMatch(/within/i);
  });
});

/** The measured value, used to build a deliberately-agreeing formula figure. */
function e0(intake: IntakeDay[], trend: ReturnType<typeof withWeightTrend>): number {
  return estimateAdaptiveTdee(intake, trend, null).tdee!;
}

describe("shouldRefreshTarget", () => {
  const good = { tdee: 2600, confidence: "high" as const };

  it("refreshes weekly when the estimate has really moved", () => {
    expect(shouldRefreshTarget({ ...base, ...good }, 2400, 7)).toBe(true);
  });

  it("waits a full week", () => {
    expect(shouldRefreshTarget({ ...base, ...good }, 2400, 3)).toBe(false);
  });

  it("ignores noise-sized drift", () => {
    expect(shouldRefreshTarget({ ...base, ...good }, 2580, 14)).toBe(false);
  });

  it("never acts on a low-confidence estimate", () => {
    expect(shouldRefreshTarget({ ...base, tdee: 2600, confidence: "low" }, 2000, 30)).toBe(false);
    expect(shouldRefreshTarget({ ...base, tdee: null, confidence: "none" }, 2000, 30)).toBe(false);
  });

  it("sets the first target as soon as it is confident", () => {
    expect(shouldRefreshTarget({ ...base, ...good }, null, 7)).toBe(true);
  });
});

const base = {
  tdee: null as number | null,
  confidence: "none" as const,
  loggedDays: 0,
  spanDays: 0,
  avgIntakeKcal: null,
  weeklyChangeKg: null,
  formulaTdee: null,
  deltaVsFormula: null,
  note: null,
};
