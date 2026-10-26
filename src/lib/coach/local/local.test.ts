import { describe, expect, it } from "vitest";
import { classify, isFollowUp, QUESTIONNAIRE_MARKER, PLAN_MARKER } from "./intent";
import { extractSlots, missingSlots } from "./slots";
import { checkGrounding, numbersIn } from "./grounding";
import { demoReply, planReply, questionnaireReply } from "./plan";
import { reviewLog } from "./log-review";
import { summarizeTrainingLog, type FlatSet } from "@/lib/coach/training-log";
import { analyze, expandQuery } from "@/lib/coach/rag/bm25";

describe("classify", () => {
  it("puts safety first, even inside other requests", () => {
    expect(classify("my knee hurts when I squat, build me a plan", null)).toBe("safety");
    expect(classify("I have diabetes, how much protein?", null)).toBe("safety");
    expect(classify("I felt dizzy after deadlifts", null)).toBe("safety");
  });
  it("treats conditions as research when they are not the user's own", () => {
    expect(classify("does creatine cause kidney damage?", null)).toBe("research");
  });
  it("does not trip on gym idioms", () => {
    expect(classify("will skipping cardio hurt my gains?", null)).toBe("research");
    expect(classify("no pain no gain, right?", null)).toBe("research");
  });
  it("still flags literal neck pain", () => {
    expect(classify("I get a pain in the neck when benching", null)).toBe("safety");
  });
  it("routes demo, plan and log requests", () => {
    expect(classify("Show me what you can do — give me a demo.", null)).toBe("demo");
    expect(classify("Build me a custom A-Z workout plan.", null)).toBe("plan");
    expect(classify("Look at my logged training and tell me how I'm progressing.", null)).toBe("my-training");
    expect(classify("how am I doing?", null)).toBe("my-training");
  });
  it("treats a questionnaire answer as a plan turn, and a new question as a question", () => {
    const q = `${QUESTIONNAIRE_MARKER}, tell me:`;
    expect(classify("build muscle, beginner, gym, 4 days", q)).toBe("plan");
    expect(classify("wait, how much protein should I eat?", q)).toBe("research");
  });
  it("rebuilds a plan when a tweak follows it", () => {
    expect(classify("make it 5 days", `...\n${PLAN_MARKER}\n...`, true)).toBe("plan");
    expect(classify("make it 5 days", "some research answer", true)).toBe("research");
  });
  it("recognises greetings and thanks only when short", () => {
    expect(classify("hey", null)).toBe("greeting");
    expect(classify("thanks!", null)).toBe("thanks");
    expect(classify("hey how much creatine should I take each day", null)).toBe("research");
  });
});

describe("isFollowUp", () => {
  it("spots short questions that lean on the previous turn", () => {
    expect(isFollowUp("why?")).toBe(true);
    expect(isFollowUp("and for women?")).toBe(true);
    expect(isFollowUp("is it safe?")).toBe(true);
    expect(isFollowUp("how much protein should a vegan athlete eat per day to build muscle")).toBe(false);
  });
});

describe("extractSlots", () => {
  it("reads all four answers from one message", () => {
    expect(extractSlots(["I want to build muscle, I'm a beginner, I have a full gym, 4 days a week, 60 min"])).toEqual({
      goal: "build-muscle",
      experience: "beginner",
      equipment: "full-gym",
      daysPerWeek: 4,
      sessionMinutes: 60,
    });
  });
  it("accepts the app's own labels as offered in the questionnaire", () => {
    const s = extractSlots(["get stronger", "been training a while", "dumbbells only", "three times a week"]);
    expect(s).toMatchObject({ goal: "get-strong", experience: "intermediate", equipment: "dumbbells", daysPerWeek: 3 });
    expect(extractSlots(["new to this"]).experience).toBe("beginner");
    expect(extractSlots(["experienced"]).experience).toBe("advanced");
  });
  it("lets a later answer override an earlier one", () => {
    expect(extractSlots(["3 days a week", "actually make it 5 days"]).daysPerWeek).toBe(5);
  });
  it("reads years of training and layoffs", () => {
    expect(extractSlots(["lifting for 2 years"]).experience).toBe("intermediate");
    expect(extractSlots(["6 years in"]).experience).toBe("advanced");
    expect(extractSlots(["I haven't trained in a while"]).experience).toBe("beginner");
  });
  it("prefers bodyweight when someone says they have no equipment", () => {
    expect(extractSlots(["no equipment, I train at home"]).equipment).toBe("bodyweight");
  });
  it("reports endurance as unsupported instead of mapping it", () => {
    const s = extractSlots(["I want endurance for a marathon"]);
    expect(s.goal).toBeUndefined();
    expect(s.unsupportedGoal).toBe("endurance");
    expect(missingSlots(s)).toContain("goal");
  });
  it("does not read '5x5' as a schedule", () => {
    expect(extractSlots(["I like 5x5"]).daysPerWeek).toBeUndefined();
  });
});

describe("grounding", () => {
  const evidence = ["Intakes of 1.4–2.0 g/kg/d are sufficient for most exercising individuals.", "Take two to four cups."];
  it("collects numbers in every spelling", () => {
    expect([...numbersIn("1.4–2.0 g, 3,000 mg, two cups [1]")].sort()).toEqual(["1.4", "2", "2", "3000"].filter((v, i, a) => a.indexOf(v) === i).sort());
  });
  it("accepts a faithful rewrite", () => {
    expect(checkGrounding("- Aim for 1.4–2 g/kg a day [1]\n- Two to four cups works [2]", evidence, "how much?", 2).ok).toBe(true);
  });
  it("rejects an invented number", () => {
    const r = checkGrounding("- Aim for 1.6–2.2 g/kg a day [1]", evidence, "how much?", 2);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/1.6/);
  });
  it("rejects missing or impossible citations, links and refusals", () => {
    expect(checkGrounding("- Aim for 1.4 g/kg", evidence, "", 2).ok).toBe(false);
    expect(checkGrounding("- Aim for 1.4 g/kg [3]", evidence, "", 2).ok).toBe(false);
    expect(checkGrounding("- see https://x.y [1]", evidence, "", 2).ok).toBe(false);
    expect(checkGrounding("INSUFFICIENT", evidence, "", 2).ok).toBe(false);
  });
  it("allows numbers the user supplied", () => {
    expect(checkGrounding("- At 80 kg that is 1.4 g/kg [1]", evidence, "I weigh 80 kg", 2).ok).toBe(true);
  });
});

describe("plan replies", () => {
  it("demo ends with the prompt's exact closing line", () => {
    const d = demoReply();
    expect(d).toContain("### Day 1");
    expect(d.trim().endsWith("This is just a sample! Want me to build a custom A-Z plan just for you?")).toBe(true);
  });
  it("questionnaire asks only for what is missing", () => {
    const q = questionnaireReply({ goal: "build-muscle" }, ["experience", "equipment", "days"]);
    expect(q.startsWith(QUESTIONNAIRE_MARKER)).toBe(true);
    expect(q).not.toContain("**Goal**");
    expect(q).toContain("**Experience**");
    expect(q).toContain("Got so far: build muscle");
  });
  it("a plan has a day per session, bold exercises, and the plan marker", () => {
    const p = planReply({ goal: "build-muscle", experience: "beginner", equipment: "full-gym", daysPerWeek: 4 }, null);
    expect(p.match(/^### Day \d/gm)).toHaveLength(4);
    expect(p).toMatch(/- \*\*[^*]+\*\* — \d × \d+–\d+ · rest/);
    expect(p).toContain(PLAN_MARKER);
  });
  it("says so when the requested schedule is outside the generator's range", () => {
    expect(planReply({ goal: "maintain", experience: "beginner", equipment: "bodyweight", daysPerWeek: 7 }, null)).toContain("I cap plans at 6");
    expect(planReply({ goal: "maintain", experience: "beginner", equipment: "bodyweight", daysPerWeek: 1 }, null)).toContain("shortest split I write is 2");
  });
});

describe("reviewLog", () => {
  const set = (date: string, exercise: string, muscleGroup: string, weight: number, reps: number): FlatSet => ({
    date, exercise, muscleGroup, mode: "weight-reps", weight, reps, durationSec: null, setType: "WORKING", e1rm: weight * (1 + reps / 30),
  });

  it("says the log is empty instead of inventing anything", () => {
    const r = reviewLog(summarizeTrainingLog([], [], 45, "2026-10-28"));
    expect(r.text).toContain("no sessions");
    expect(r.text).not.toMatch(/\d+ kg/);
    expect(r.researchTopic).toBeNull();
  });

  it("reports real trends and untrained muscles from the sets given", () => {
    const sets = [
      set("2026-10-01", "Barbell Bench Press", "chest", 80, 5),
      set("2026-10-08", "Barbell Bench Press", "chest", 82.5, 5),
      set("2026-10-15", "Barbell Bench Press", "chest", 85, 5),
    ];
    const r = reviewLog(summarizeTrainingLog(sets, [], 45, "2026-10-28"));
    expect(r.text).toContain("**3 sessions**");
    expect(r.text).toContain("Barbell Bench Press");
    expect(r.text).toMatch(/\+6\.2% estimated 1RM \(93\.5 → 99 kg\)/);
    expect(r.text).toContain("Nothing logged for:");
    expect(r.researchTopic).toMatch(/weekly sets/);
  });
});

describe("bm25 analysis", () => {
  it("stems so word forms meet", () => {
    expect(analyze("trained training trains")).toEqual(["train", "train", "train"]);
  });
  it("expands gym slang into the papers' vocabulary", () => {
    expect(expandQuery("best way to bulk")).toEqual(expect.arrayContaining(["hypertrophy"]));
    expect(expandQuery("should I take pre-workout")).toEqual(expect.arrayContaining(["caffeine"]));
  });
});
