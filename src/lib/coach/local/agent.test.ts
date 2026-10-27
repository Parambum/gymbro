import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachTurn } from "@/lib/coach/types";

/**
 * The whole agent, turn by turn — routing, food lookups, clarifying
 * questions and typo correction — with the database swapped for the real
 * food data held in memory, and the research library stubbed so these tests
 * never load the embedding model.
 */

const research = vi.hoisted(() => ({ mode: "empty" as "empty" | "down" }));

vi.mock("@/lib/db/mongoose", () => ({ connectDB: async () => undefined }));
vi.mock("@/lib/fuel/describe-server", async () => ({ matchDescription: (await import("./food-fixture")).matchInMemory }));
vi.mock("@/models/FuelProfile", () => ({
  FuelProfile: { findOne: () => ({ select: () => ({ lean: async () => ({ eyesOffMode: false }) }) }) },
}));
vi.mock("./nutrition-server", () => ({
  loadDayIntake: async (_userId: string, date: string) => ({
    onboarded: true,
    eyesOff: false,
    date,
    consumed: { kcal: 900, proteinG: 50, carbsG: 100, fatG: 30, fiberG: 8 },
    target: { kcal: 2200, proteinG: 140, carbsG: 250, fatG: 70, fiberG: 30, waterMl: 2500, effectiveFrom: "2026-10-01" },
    notes: [],
    items: 3,
    meals: ["breakfast", "lunch"],
  }),
}));
vi.mock("@/lib/coach/rag/retrieve", () => ({
  retrieve: async () => {
    if (research.mode === "down") throw new Error("Cannot find package 'onnxruntime-common'");
    return { hits: [], queryVector: new Float32Array(384) };
  },
}));

const { runLocalCoach } = await import("./agent");

const ask = (text: string, history: CoachTurn[] = [], userId: string | null = null) =>
  runLocalCoach([...history, { role: "user", content: text }], userId, { localDate: "2026-10-27" });

beforeEach(() => {
  research.mode = "empty";
});

describe("food", () => {
  it("answers a bare food with its calories", async () => {
    const r = await ask("apple");
    expect(r.reply).toContain("**Apple, raw**");
    expect(r.reply).toMatch(/\*\*\d+ kcal\*\*/);
    expect(r.toolsUsed).toContain("food_lookup");
  });

  it("answers a described meal with a total", async () => {
    const r = await ask("I had 2 eggs and 2 roti for breakfast");
    expect(r.reply).toContain("Egg, whole, raw, fresh");
    expect(r.reply).toContain("Chapati/Roti");
    expect(r.reply).toContain("**Total:**");
  });

  it("reads 'it' as the food from the last answer", async () => {
    const first = await ask("100g paneer");
    const r = await ask("how much protein is in it?", [
      { role: "user", content: "100g paneer" },
      { role: "assistant", content: first.reply },
    ]);
    expect(r.reply).toContain("Cheese, paneer");
    expect(r.reply).toMatch(/^- \*\*[\d.]+ g protein\*\*/m);
  });

  it("adds to the meal when the next message starts with 'and'", async () => {
    const first = await ask("apple");
    const r = await ask("and a banana", [
      { role: "user", content: "apple" },
      { role: "assistant", content: first.reply },
    ]);
    expect(r.reply).toContain("Bananas, raw");
  });

  it("says it can't find a food it was asked about, rather than guessing", async () => {
    const r = await ask("calories in zxqvbn");
    expect(r.reply).toMatch(/couldn't find \*\*zxqvbn\*\*/);
    expect(r.reply).not.toMatch(/\d+ kcal/);
  });
});

describe("unclear messages", () => {
  it("asks what the person means when it's gibberish", async () => {
    for (const m of ["asdkjh", "lkj lkj lkj", "???"]) {
      const r = await ask(m);
      expect(r.reply, m).toMatch(/not sure what you mean|What are you trying to find out/);
      expect(r.reply, m).toContain("Look up a food");
    }
  });

  it("asks rather than answering a stray word that matches nothing", async () => {
    expect((await ask("car")).reply).toMatch(/not sure what you mean by “car”/);
  });

  it("reads an obvious typo, and says how it read it", async () => {
    const r = await ask("calries in apple");
    expect(r.reply.split("\n")[0]).toBe("*(Reading “calries” as “calories”.)*");
    expect(r.reply).toContain("**Apple, raw**");
  });

  it("explains it can only read English for another script", async () => {
    expect((await ask("नमस्ते")).reply).toMatch(/only read English/);
  });
});

describe("the user's own eating", () => {
  it("needs someone signed in", async () => {
    expect((await ask("how many calories have I got left?")).reply).toMatch(/Sign in/);
  });

  it("reads today's log against the target", async () => {
    const r = await ask("how many calories have I got left?", [], "65f0c0ffee0000000000abcd");
    expect(r.reply).toContain("**900 kcal** of 2,200 (41%) — **1,300 left**");
    expect(r.toolsUsed).toContain("fuel_log");
  });
});

describe("when the research library is down", () => {
  it("says so plainly instead of erroring or answering from memory", async () => {
    research.mode = "down";
    const r = await ask("how long should I rest between sets?");
    expect(r.reply).toMatch(/research library isn't loading/);
    expect(r.reply).not.toMatch(/onnxruntime/);
  });
});
