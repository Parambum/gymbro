import { describe, it, expect } from "vitest";
import {
  availableWith,
  classifyEquipment,
  generateProgramme,
  isCompound,
  nextProgression,
  schemeFor,
  splitFor,
} from "./program";
import { engineInputsFor, goalDef } from "@/lib/fuel/goals";

describe("equipment inference", () => {
  it("routes barbell, machine and cable work to a full gym", () => {
    for (const e of ["Flat Barbell Bench Press", "Leg Press", "Cable Crossover", "Lat Pulldown"]) {
      expect(classifyEquipment(e)).toBe("full-gym");
    }
  });

  it("recognises dumbbell work", () => {
    expect(classifyEquipment("Incline Dumbbell Bench Press")).toBe("dumbbells");
  });

  it("recognises bodyweight work", () => {
    for (const e of ["Push-ups", "Pull-ups", "Plank", "Hanging Leg Raise"]) {
      expect(classifyEquipment(e)).toBe("bodyweight");
    }
  });

  it("lets the gym keyword win when a name contains both", () => {
    // "Smith Machine Flat Bench" is not a bodyweight bench
    expect(classifyEquipment("Smith Machine Flat Bench")).toBe("full-gym");
    expect(classifyEquipment("Weighted Push-ups")).toBe("bodyweight");
  });

  it("assumes gym for anything unrecognised, which is the safe direction", () => {
    expect(classifyEquipment("Zercher Whatsit")).toBe("full-gym");
  });

  it("gates availability correctly", () => {
    expect(availableWith("Flat Barbell Bench Press", "full-gym")).toBe(true);
    expect(availableWith("Flat Barbell Bench Press", "dumbbells")).toBe(false);
    expect(availableWith("Push-ups", "dumbbells")).toBe(true);
    expect(availableWith("Incline Dumbbell Bench Press", "bodyweight")).toBe(false);
    expect(availableWith("Push-ups", "bodyweight")).toBe(true);
  });
});

describe("splits", () => {
  it("gives one session per training day", () => {
    for (const days of [2, 3, 4, 5, 6]) {
      expect(splitFor(days)).toHaveLength(days);
    }
  });

  it("clamps nonsense rather than producing an empty week", () => {
    expect(splitFor(0).length).toBeGreaterThan(0);
    expect(splitFor(99).length).toBeLessThanOrEqual(6);
  });

  it("covers more of the body per session when there are fewer days", () => {
    const three = splitFor(3)[0].muscles.length;
    const six = splitFor(6)[0].muscles.length;
    expect(three).toBeGreaterThan(six);
  });
});

describe("rep schemes", () => {
  it("gives strength work heavy sets and long rests", () => {
    const s = schemeFor("strength", true);
    expect(s.repsHigh).toBeLessThanOrEqual(6);
    expect(s.restSeconds).toBeGreaterThanOrEqual(180);
  });

  it("gives hypertrophy work more reps and shorter rests", () => {
    const h = schemeFor("hypertrophy", true);
    const s = schemeFor("strength", true);
    expect(h.repsHigh).toBeGreaterThan(s.repsHigh);
    expect(h.restSeconds).toBeLessThan(s.restSeconds);
  });

  it("gives isolations higher reps than compounds", () => {
    expect(schemeFor("hypertrophy", false).repsHigh).toBeGreaterThan(
      schemeFor("hypertrophy", true).repsHigh,
    );
  });

  it("knows a compound from an isolation", () => {
    expect(isCompound("Flat Barbell Bench Press")).toBe(true);
    expect(isCompound("Barbell Back Squat")).toBe(true);
    expect(isCompound("Dumbbell Chest Fly")).toBe(false);
    expect(isCompound("Lateral Raise")).toBe(false);
    expect(isCompound("Bicep Curl")).toBe(false);
  });
});

describe("generateProgramme", () => {
  const base = {
    goal: "build-muscle" as const,
    experience: "intermediate" as const,
    equipment: "full-gym" as const,
    daysPerWeek: 4,
  };

  it("produces a session per day, each with exercises", () => {
    const p = generateProgramme(base);
    expect(p.sessions).toHaveLength(4);
    for (const s of p.sessions) {
      expect(s.exercises.length).toBeGreaterThan(0);
      expect(s.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("is deterministic — same answers, same week", () => {
    expect(JSON.stringify(generateProgramme(base))).toBe(JSON.stringify(generateProgramme(base)));
  });

  it("never prescribes equipment the user doesn't have", () => {
    const home = generateProgramme({ ...base, equipment: "bodyweight" });
    const all = home.sessions.flatMap((s) => s.exercises.map((e) => e.exercise));
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) expect(classifyEquipment(e)).toBe("bodyweight");
  });

  it("respects a dumbbell-only setup", () => {
    const db = generateProgramme({ ...base, equipment: "dumbbells" });
    for (const e of db.sessions.flatMap((s) => s.exercises.map((x) => x.exercise))) {
      expect(["dumbbells", "bodyweight"]).toContain(classifyEquipment(e));
    }
  });

  it("never repeats an exercise inside one session", () => {
    for (const s of generateProgramme(base).sessions) {
      const names = s.exercises.map((e) => e.exercise);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("leads each session with compound work", () => {
    const first = generateProgramme(base).sessions[0].exercises[0];
    expect(first.compound).toBe(true);
  });

  it("fits the session into the time available", () => {
    const short = generateProgramme({ ...base, sessionMinutes: 30 });
    const long = generateProgramme({ ...base, sessionMinutes: 90 });
    const setsIn = (p: ReturnType<typeof generateProgramme>) =>
      p.sessions[0].exercises.reduce((n, e) => n + e.sets, 0);
    expect(setsIn(short)).toBeLessThan(setsIn(long));
    expect(short.sessions[0].estimatedMinutes).toBeLessThanOrEqual(36);
  });

  it("gives a strength goal heavier schemes than a hypertrophy goal", () => {
    const strong = generateProgramme({ ...base, goal: "get-strong" });
    const size = generateProgramme({ ...base, goal: "build-muscle" });
    expect(strong.sessions[0].exercises[0].repsHigh).toBeLessThan(
      size.sessions[0].exercises[0].repsHigh,
    );
  });

  it("gives beginners fewer exercises than advanced lifters", () => {
    const beginner = generateProgramme({ ...base, experience: "beginner" });
    const advanced = generateProgramme({ ...base, experience: "advanced", sessionMinutes: 120 });
    expect(beginner.sessions[0].exercises.length).toBeLessThan(
      advanced.sessions[0].exercises.length,
    );
  });

  it("reports weekly volume per muscle rather than hiding it", () => {
    const p = generateProgramme(base);
    const total = Object.values(p.weeklySetsByMuscle).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(20);
  });

  it("says so when a short week means thin volume", () => {
    const p = generateProgramme({ ...base, daysPerWeek: 2 });
    expect(p.notes.join(" ")).toMatch(/fewer sets|add a day/i);
  });

  it("explains how bodyweight progression works", () => {
    const p = generateProgramme({ ...base, equipment: "bodyweight" });
    expect(p.notes.join(" ")).toMatch(/reps, tempo/i);
  });
});

describe("goal → engine translation", () => {
  it("keeps every goal inside the engine's safety caps", () => {
    for (const g of ["lose-fat", "get-lean", "tone-up", "build-muscle", "get-strong", "maintain"] as const) {
      const { goal, rateKgPerWeek } = engineInputsFor(g, 80);
      if (goal === "lose") expect(rateKgPerWeek).toBeLessThanOrEqual(80 * 0.0075);
      if (goal === "gain") expect(rateKgPerWeek).toBeLessThanOrEqual(80 * 0.0035);
      if (goal === "maintain") expect(rateKgPerWeek).toBe(0);
    }
  });

  it("scales the rate with bodyweight", () => {
    expect(engineInputsFor("lose-fat", 100).rateKgPerWeek).toBeGreaterThan(
      engineInputsFor("lose-fat", 60).rateKgPerWeek,
    );
  });

  it("puts tone-up at maintenance and warns the scale won't move", () => {
    expect(engineInputsFor("tone-up", 80).goal).toBe("maintain");
    expect(goalDef("tone-up").expectation).toMatch(/scale may barely move/i);
  });

  it("cuts faster for lose-fat than for get-lean", () => {
    expect(engineInputsFor("lose-fat", 80).rateKgPerWeek).toBeGreaterThan(
      engineInputsFor("get-lean", 80).rateKgPerWeek,
    );
  });
});

describe("nextProgression — double progression", () => {
  const planned = {
    exercise: "Flat Barbell Bench Press",
    muscleGroup: "chest" as const,
    sets: 3,
    repsLow: 6,
    repsHigh: 10,
    restSeconds: 150,
    rir: 2,
    compound: true,
  };

  it("adds load only when every set hit the top of the range", () => {
    const a = nextProgression(planned, { weightKg: 80, reps: [10, 10, 10] }, "intermediate");
    expect(a.action).toBe("add-load");
    expect(a.nextWeightKg).toBeGreaterThan(80);
    expect(a.message).toMatch(/add/i);
  });

  it("asks for another rep when partway up the range", () => {
    const a = nextProgression(planned, { weightKg: 80, reps: [8, 8, 7] }, "intermediate");
    expect(a.action).toBe("add-reps");
    expect(a.nextWeightKg).toBe(80);
  });

  it("holds rather than deloads on a single bad set", () => {
    const a = nextProgression(planned, { weightKg: 80, reps: [8, 6, 4] }, "intermediate");
    expect(a.action).toBe("hold");
    expect(a.nextWeightKg).toBe(80);
  });

  it("gives beginners bigger jumps than advanced lifters", () => {
    const top = { weightKg: 100, reps: [10, 10, 10] };
    const b = nextProgression(planned, top, "beginner").nextWeightKg!;
    const a = nextProgression(planned, top, "advanced").nextWeightKg!;
    expect(b).toBeGreaterThan(a);
  });

  it("rounds to something you can actually load", () => {
    const a = nextProgression(planned, { weightKg: 83, reps: [10, 10, 10] }, "intermediate");
    expect((a.nextWeightKg! * 2) % 1).toBe(0);
  });

  it("tells a first-timer how to pick a starting weight", () => {
    const a = nextProgression(planned, null, "beginner");
    expect(a.nextWeightKg).toBeNull();
    expect(a.message).toMatch(/start at a weight/i);
  });
});
