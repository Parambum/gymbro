import { describe, it, expect } from "vitest";
import { latestTrendKg, trendDirection, weeklyChangeKg, withWeightTrend } from "./trend";

/** A run of readings, one per day, starting at `from`. */
function daily(from: string, weights: number[]) {
  const start = Date.parse(`${from}T00:00:00Z`);
  return weights.map((weightKg, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    weightKg,
  }));
}

describe("withWeightTrend", () => {
  it("seeds on the first real reading, not on zero", () => {
    const [first] = withWeightTrend(daily("2026-01-01", [80]));
    expect(first.trendKg).toBe(80);
  });

  it("lags a step change instead of jumping to it", () => {
    const t = withWeightTrend(daily("2026-01-01", [80, 80, 80, 84]));
    // α=0.1, so a 4 kg jump moves the trend by ~0.4 kg, not 4
    expect(t[3].trendKg).toBeCloseTo(80.4, 1);
    expect(t[3].weightKg).toBe(84);
  });

  it("converges toward a sustained new weight", () => {
    const t = withWeightTrend(daily("2026-01-01", Array(60).fill(75)).map((p, i) => ({
      ...p,
      weightKg: i === 0 ? 80 : 75,
    })));
    expect(latestTrendKg(t)).toBeCloseTo(75, 1);
  });

  it("smooths day-to-day noise out of a flat series", () => {
    const noisy = daily("2026-01-01", [80, 81.2, 79.1, 80.6, 79.4, 80.9, 79.8]);
    const t = withWeightTrend(noisy);
    const spread = Math.max(...t.map((p) => p.trendKg)) - Math.min(...t.map((p) => p.trendKg));
    expect(spread).toBeLessThan(0.6); // raw spread is 2.1 kg
  });

  it("sorts by date and never mutates the input", () => {
    const input = daily("2026-01-01", [80, 81, 82]).reverse();
    const snapshot = JSON.stringify(input);
    const t = withWeightTrend(input);
    expect(t.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("returns an empty series for no readings", () => {
    expect(withWeightTrend([])).toEqual([]);
    expect(latestTrendKg([])).toBeNull();
  });
});

describe("weeklyChangeKg", () => {
  it("measures a steady cut off the trend line", () => {
    // 0.1 kg/day for 28 days ≈ 0.7 kg/week
    const series = daily("2026-01-01", Array.from({ length: 28 }, (_, i) => 80 - i * 0.1));
    const change = weeklyChangeKg(withWeightTrend(series));
    expect(change).toBeLessThan(0);
    expect(Math.abs(change!)).toBeGreaterThan(0.4);
    expect(Math.abs(change!)).toBeLessThan(0.8);
  });

  it("reports a bulk as positive", () => {
    const series = daily("2026-01-01", Array.from({ length: 28 }, (_, i) => 70 + i * 0.03));
    expect(weeklyChangeKg(withWeightTrend(series))!).toBeGreaterThan(0);
  });

  it("stays silent until there is a week of spread — two readings prove nothing", () => {
    expect(weeklyChangeKg(withWeightTrend(daily("2026-01-01", [80])))).toBeNull();
    expect(weeklyChangeKg(withWeightTrend(daily("2026-01-01", [80, 78])))).toBeNull();
    expect(weeklyChangeKg(withWeightTrend(daily("2026-01-01", [80, 79, 78, 77])))).toBeNull();
  });

  it("only looks at the most recent window", () => {
    // 6 weeks losing, then 4 weeks flat on the scale.
    //
    // The recent window reads much flatter than the full history — but not
    // zero, and that is the smoothing working as designed: after a sustained
    // decline the EWMA sits above the raw weight and keeps descending for a
    // couple of weeks as it catches up to the new plateau. Asserting the
    // *relationship* keeps the test honest about that lag instead of pinning
    // it to a magic number.
    const losing = Array.from({ length: 42 }, (_, i) => 90 - i * 0.1);
    const flat = Array.from({ length: 28 }, () => 85.8);
    const t = withWeightTrend(daily("2026-01-01", [...losing, ...flat]));

    const recent = Math.abs(weeklyChangeKg(t, 28)!);
    const whole = Math.abs(weeklyChangeKg(t, 90)!);
    expect(recent).toBeLessThan(whole / 2);
    expect(recent).toBeLessThan(0.3);
    expect(whole).toBeGreaterThan(0.4);
  });
});

describe("trendDirection", () => {
  it("calls small movement flat rather than inventing a signal", () => {
    expect(trendDirection(0.05)).toBe("flat");
    expect(trendDirection(-0.05)).toBe("flat");
    expect(trendDirection(null)).toBe("flat");
  });

  it("names a real direction", () => {
    expect(trendDirection(0.3)).toBe("rising");
    expect(trendDirection(-0.3)).toBe("falling");
  });
});
