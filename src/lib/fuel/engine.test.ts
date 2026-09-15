import { describe, it, expect } from "vitest";
import {
  ageOn,
  bmiOf,
  bmrMifflinStJeor,
  computeTargets,
  dailyDeltaForRate,
  daysToGoal,
  goalWeightNote,
  maxRateKgPerWeek,
  tdeeFrom,
  type TargetInput,
} from "./engine";
import { ATWATER } from "./types";

/** An 80 kg, 180 cm, 30-year-old man who lifts — the reference case below. */
const BASE: TargetInput = {
  sex: "male",
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "moderate",
  goal: "lose",
  rateKgPerWeek: 0.5,
  macroPreset: "balanced",
};

describe("BMR — Mifflin-St Jeor", () => {
  it("uses the published constants for male and female", () => {
    // 10(80) + 6.25(180) - 5(30) = 1775, then +5 / -161
    expect(bmrMifflinStJeor("male", 80, 180, 30)).toBe(1780);
    expect(bmrMifflinStJeor("female", 80, 180, 30)).toBe(1614);
  });

  it("averages the two when sex is unspecified, per §5.1", () => {
    const male = bmrMifflinStJeor("male", 80, 180, 30);
    const female = bmrMifflinStJeor("female", 80, 180, 30);
    expect(bmrMifflinStJeor("unspecified", 80, 180, 30)).toBe((male + female) / 2);
  });

  it("falls with age and rises with mass", () => {
    expect(bmrMifflinStJeor("male", 80, 180, 50)).toBeLessThan(bmrMifflinStJeor("male", 80, 180, 30));
    expect(bmrMifflinStJeor("male", 90, 180, 30)).toBeGreaterThan(bmrMifflinStJeor("male", 80, 180, 30));
  });
});

describe("TDEE", () => {
  it("applies the activity multiplier", () => {
    expect(tdeeFrom(1780, "sedentary")).toBeCloseTo(2136, 5);
    expect(tdeeFrom(1780, "moderate")).toBeCloseTo(2759, 5);
    expect(tdeeFrom(1780, "athlete")).toBeCloseTo(3382, 5);
  });
});

describe("goal adjustment (§5.3)", () => {
  it("converts a weekly rate to a daily delta at 7700 kcal/kg", () => {
    expect(dailyDeltaForRate(0.5)).toBeCloseTo(550, 5);
    expect(dailyDeltaForRate(1)).toBeCloseTo(1100, 5);
  });

  it("caps loss at 0.75% and gain at 0.35% of bodyweight per week", () => {
    expect(maxRateKgPerWeek("lose", 80)).toBeCloseTo(0.6, 5);
    expect(maxRateKgPerWeek("gain", 80)).toBeCloseTo(0.28, 5);
    expect(maxRateKgPerWeek("maintain", 80)).toBe(0);
  });

  it("honours a rate inside the cap without comment", () => {
    const r = computeTargets({ ...BASE, rateKgPerWeek: 0.5 });
    expect(r.appliedRateKgPerWeek).toBe(0.5);
    expect(r.kcal).toBe(Math.round(2759 - 550));
    expect(r.notes).toHaveLength(0);
  });

  it("clamps an aggressive rate silently and explains it in one line", () => {
    const r = computeTargets({ ...BASE, rateKgPerWeek: 1.5 });
    expect(r.appliedRateKgPerWeek).toBeCloseTo(0.6, 5);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatch(/0\.6 kg\/week/);
    // no scolding, no exclamation, no "you"-blaming language
    expect(r.notes[0]).not.toMatch(/!|fail|too much|shouldn't/i);
  });

  it("adds calories when gaining and leaves TDEE alone when maintaining", () => {
    const gain = computeTargets({ ...BASE, goal: "gain", rateKgPerWeek: 0.2 });
    expect(gain.kcal).toBeGreaterThan(gain.tdee);

    const maintain = computeTargets({ ...BASE, goal: "maintain", rateKgPerWeek: 0.5 });
    expect(maintain.kcal).toBe(maintain.tdee);
    expect(maintain.appliedRateKgPerWeek).toBe(0);
  });
});

describe("safety floors (§5.6) — non-negotiable", () => {
  it("never returns a target below 1200 kcal for a woman", () => {
    // small, sedentary, asking for an aggressive cut
    const r = computeTargets({
      sex: "female",
      ageYears: 25,
      heightCm: 150,
      weightKg: 50,
      activityLevel: "sedentary",
      goal: "lose",
      rateKgPerWeek: 0.75,
      macroPreset: "balanced",
    });
    expect(r.kcal).toBe(1200);
    expect(r.notes.some((n) => n.includes("1200"))).toBe(true);
  });

  it("never returns a target below 1500 kcal for a man", () => {
    const r = computeTargets({
      sex: "male",
      ageYears: 70,
      heightCm: 155,
      weightKg: 48,
      activityLevel: "sedentary",
      goal: "lose",
      rateKgPerWeek: 0.36,
      macroPreset: "balanced",
    });
    expect(r.kcal).toBeGreaterThanOrEqual(1500);
  });

  it("never returns a target below BMR, even when BMR is the higher floor", () => {
    const r = computeTargets({
      sex: "male",
      ageYears: 30,
      heightCm: 190,
      weightKg: 120,
      activityLevel: "sedentary",
      goal: "lose",
      rateKgPerWeek: 0.9,
      macroPreset: "balanced",
    });
    expect(r.bmr).toBe(2243);
    expect(r.kcal).toBe(2243);
    expect(r.notes.some((n) => /at rest/.test(n))).toBe(true);
  });

  it("uses the higher floor when sex is unspecified", () => {
    const r = computeTargets({
      sex: "unspecified",
      ageYears: 25,
      heightCm: 150,
      weightKg: 50,
      activityLevel: "sedentary",
      goal: "lose",
      rateKgPerWeek: 0.75,
      macroPreset: "balanced",
    });
    expect(r.kcal).toBe(1500);
    expect(r.isEstimate).toBe(true);
  });

  it("marks a known sex as not an estimate", () => {
    expect(computeTargets(BASE).isEstimate).toBe(false);
  });
});

describe("macros (§5.4)", () => {
  it("closes: protein + carbs + fat account for the calorie target", () => {
    const r = computeTargets(BASE);
    const fromMacros =
      r.proteinG * ATWATER.protein + r.carbsG * ATWATER.carbs + r.fatG * ATWATER.fat;
    expect(Math.abs(fromMacros - r.kcal)).toBeLessThanOrEqual(10); // whole-gram rounding only
  });

  it("sets protein from bodyweight, inside the 1.6–2.2 g/kg band", () => {
    for (const preset of ["balanced", "high-protein", "low-carb"] as const) {
      const r = computeTargets({ ...BASE, macroPreset: preset });
      const perKg = r.proteinG / BASE.weightKg;
      expect(perKg).toBeGreaterThanOrEqual(1.6);
      expect(perKg).toBeLessThanOrEqual(2.2);
    }
    expect(computeTargets(BASE).proteinG).toBe(144); // 1.8 × 80
  });

  it("clamps a custom protein figure into the band instead of rejecting it", () => {
    const greedy = computeTargets({ ...BASE, macroPreset: "custom", customProteinGPerKg: 4 });
    expect(greedy.proteinG).toBe(Math.round(2.2 * 80));

    const stingy = computeTargets({ ...BASE, macroPreset: "custom", customProteinGPerKg: 0.4 });
    expect(stingy.proteinG).toBe(Math.round(1.6 * 80));
  });

  it("keeps fat at or above 0.6 g/kg", () => {
    const r = computeTargets({ ...BASE, macroPreset: "custom", customFatPctKcal: 0.15 });
    expect(r.fatG).toBeGreaterThanOrEqual(0.6 * BASE.weightKg);
  });

  it("gives low-carb more fat and fewer carbs than balanced, at the same calories", () => {
    const balanced = computeTargets(BASE);
    const lowCarb = computeTargets({ ...BASE, macroPreset: "low-carb" });
    expect(lowCarb.kcal).toBe(balanced.kcal);
    expect(lowCarb.fatG).toBeGreaterThan(balanced.fatG);
    expect(lowCarb.carbsG).toBeLessThan(balanced.carbsG);
  });

  it("never returns negative carbs, and says so when the budget is that tight", () => {
    // Deliberately extreme: heavy, short, old, sedentary, aggressive cut, max protein.
    const r = computeTargets({
      sex: "female",
      ageYears: 80,
      heightCm: 140,
      weightKg: 100,
      activityLevel: "sedentary",
      goal: "lose",
      rateKgPerWeek: 0.75,
      macroPreset: "high-protein",
    });
    expect(r.carbsG).toBeGreaterThanOrEqual(0);
    expect(r.notes.some((n) => /carbs/i.test(n))).toBe(true);
  });

  it("sets fibre at 14 g per 1000 kcal", () => {
    const r = computeTargets(BASE);
    expect(r.fiberG).toBe(Math.round((r.kcal / 1000) * 14));
  });

  it("sets water at 35 ml/kg, plus 500 ml on a training day", () => {
    const rest = computeTargets(BASE);
    const training = computeTargets({ ...BASE, trainingDay: true });
    expect(rest.waterMl).toBe(2800);
    expect(training.waterMl - rest.waterMl).toBe(500);
  });
});

describe("BMI guidance", () => {
  it("computes BMI to one decimal", () => {
    expect(bmiOf(80, 180)).toBe(24.7);
    expect(bmiOf(0, 0)).toBe(0);
  });

  it("notes a goal weight under the healthy band, without blocking it", () => {
    const note = goalWeightNote(55, 180);
    expect(note).toBeTruthy();
    expect(note).toMatch(/18\.5/);
  });

  it("stays quiet for a goal weight inside the healthy band", () => {
    expect(goalWeightNote(72, 180)).toBeNull();
  });
});

describe("projections", () => {
  it("counts the days to a goal weight at the applied rate", () => {
    expect(daysToGoal(80, 75, "lose", 0.6)).toBe(59); // 5 kg ÷ 0.6 kg/wk × 7
    expect(daysToGoal(70, 75, "gain", 0.25)).toBe(140);
  });

  it("returns null when the goal is met, the rate is zero, or maintaining", () => {
    expect(daysToGoal(75, 75, "lose", 0.6)).toBeNull();
    expect(daysToGoal(74, 75, "lose", 0.6)).toBeNull();
    expect(daysToGoal(80, 75, "lose", 0)).toBeNull();
    expect(daysToGoal(80, 75, "maintain", 0.5)).toBeNull();
  });
});

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("1990-06-15", "2026-09-14")).toBe(36);
  });

  it("turns over on the birthday, not before", () => {
    expect(ageOn("1990-09-15", "2026-09-14")).toBe(35);
    expect(ageOn("1990-09-14", "2026-09-14")).toBe(36);
    expect(ageOn("1990-09-13", "2026-09-14")).toBe(36);
  });

  it("handles a 29 February birth date without going negative", () => {
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
    expect(ageOn("2030-01-01", "2026-01-01")).toBe(0);
  });
});
