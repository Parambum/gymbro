import { describe, expect, it } from "vitest";
import kbFile from "@/lib/data/coach-kb.json";
import type { KbFile } from "@/lib/coach/rag/store";
import {
  CARDS,
  cardReply,
  catalogueEntry,
  catalogueReply,
  groupReply,
  notCoveredReply,
  overviewReply,
  parseCatalogue,
  personalDose,
  readSupplementAsk,
  useLibrary,
  weightIn,
  type QuoteRef,
  type SupplementContext,
} from "./supplements";

const kb = kbFile as unknown as KbFile;
const lib = useLibrary(kb);
const ctx: SupplementContext = { weightKg: null, weightFrom: null, plantBased: false, goal: null, minor: false, proteinTargetG: null };

/** Every distinct sentence of a paper that starts with these words. */
function matches(ref: QuoteRef): string[] {
  const src = kb.sources.findIndex((s) => s.id === ref.src);
  const found = new Set<string>();
  kb.passages.forEach((p) => p.source === src && p.sentences.forEach((s) => s.startsWith(ref.starts) && found.add(s)));
  return [...found];
}

describe("every card quotes the library, and only the library", () => {
  const refs = CARDS.flatMap((c) =>
    [...c.verdict, ...c.what, ...c.dose, ...c.timing, ...c.safety, ...(c.plantBased ?? []), ...(c.foodFirst ?? [])].map((r) => [c.id, r] as const),
  );

  it.each(refs)("%s: %o names exactly one sentence", (_id, ref) => {
    expect(matches(ref)).toHaveLength(1);
  });

  it("only scales doses that the quoted sentence actually states per kilogram", () => {
    for (const c of CARDS) {
      for (const d of c.perKg ?? []) {
        const [sentence] = matches(d.quote);
        expect(sentence, `${c.id}: ${d.label}`).toBeDefined();
        expect(sentence).toMatch(/\/\s*kg|per kg|kg[∙·]?\s*BW|g\/kg|mg\/kg/i);
        expect(sentence).toContain(String(d.low));
        if (d.high != null) expect(sentence).toContain(String(d.high));
      }
    }
  });
});

describe("the evidence tiers come from the review's own headings", () => {
  const catalogue = parseCatalogue(kb);

  it("reads dozens of supplements, each with a tier", () => {
    expect(catalogue.length).toBeGreaterThan(40);
    for (const e of catalogue) expect(e.muscle ?? e.performance).toBeDefined();
  });

  it("files the well-known ones where the review files them", () => {
    expect(catalogueEntry(lib, "Creatine monohydrate")).toMatchObject({ muscle: "strong", performance: "strong" });
    expect(catalogueEntry(lib, "Caffeine")?.performance).toBe("strong");
    expect(catalogueEntry(lib, "Branched chain amino acids (BCAA)")).toMatchObject({ muscle: "mixed", performance: "mixed" });
    expect(catalogueEntry(lib, "Glutamine")).toMatchObject({ muscle: "none", performance: "none" });
    expect(catalogueEntry(lib, "Tribulus terrestris")?.muscle).toBe("none");
  });
});

describe("readSupplementAsk", () => {
  it("routes a general question to the overview, with its goal", () => {
    expect(readSupplementAsk("what supplements should I take?")).toMatchObject({ kind: "overview", goal: null });
    expect(readSupplementAsk("best supplements for fat loss")).toMatchObject({ kind: "overview", goal: "fat-loss" });
    expect(readSupplementAsk("supplements for a vegan runner")).toMatchObject({ kind: "overview", goal: "performance", plantBased: true });
  });

  it("finds the supplement and what about it was asked", () => {
    expect(readSupplementAsk("how much creatine should I take")).toEqual({ kind: "card", id: "creatine", aspect: "dose" });
    expect(readSupplementAsk("does creatine cause hair loss?")).toEqual({ kind: "card", id: "creatine", aspect: "safety" });
    expect(readSupplementAsk("when should I take caffeine")).toEqual({ kind: "card", id: "caffeine", aspect: "timing" });
    expect(readSupplementAsk("is whey worth it")).toMatchObject({ kind: "card", id: "protein" });
    expect(readSupplementAsk("how much protein do I need")).toMatchObject({ kind: "card", id: "protein", aspect: "dose" });
    expect(readSupplementAsk("are BCAAs worth it")).toMatchObject({ kind: "catalogue", name: "Branched chain amino acids (BCAA)" });
  });

  it("knows product categories and admits what it doesn't cover", () => {
    expect(readSupplementAsk("best pre workout")).toEqual({ kind: "group", id: "pre-workout" });
    expect(readSupplementAsk("do test boosters work")).toEqual({ kind: "group", id: "test-boosters" });
    expect(readSupplementAsk("should I take ashwagandha")).toEqual({ kind: "not-covered", name: "ashwagandha" });
  });

  it("leaves non-supplement messages alone", () => {
    expect(readSupplementAsk("apple")).toBeNull();
    expect(readSupplementAsk("build me a plan")).toBeNull();
  });
});

describe("personal doses", () => {
  it("scales a quoted per-kg dose by the user's weight, showing the working", () => {
    const caffeine = CARDS.find((c) => c.id === "caffeine")!.perKg![0];
    expect(personalDose(caffeine, 72)).toBe("3–6 mg/kg × your 72 kg ≈ **215–430 mg** caffeine before training");
    const protein = CARDS.find((c) => c.id === "protein")!.perKg![0];
    expect(personalDose(protein, 80)).toBe("1.4–2 g/kg × your 80 kg ≈ **112–160 g** protein a day");
  });

  it("reads a stated weight from the conversation, and not a lift", () => {
    expect(weightIn(["I weigh 72 kg"])).toBe(72);
    expect(weightIn(["im 80kg and vegetarian"])).toBe(80);
    expect(weightIn(["my weight is 165 lbs"])).toBe(74.8);
    expect(weightIn(["I squatted 140 kg today"])).toBeNull();
  });
});

describe("replies", () => {
  it("answers one supplement in depth, the asked aspect first, every line cited", () => {
    const text = cardReply(CARDS.find((c) => c.id === "creatine")!, "safety", { ...ctx, weightKg: 72, weightFrom: "message" }, kb);
    expect(text).toMatch(/^### Creatine monohydrate/);
    expect(text).toContain("strong evidence, apparently safe");
    expect(text.indexOf("**Safety**")).toBeLessThan(text.indexOf("**How much**"));
    expect(text).toContain("hair loss");
    expect(text).toContain("≈ **7.2 g** creatine a day");
    expect(text).toContain("### Sources");
    // every bullet ends in a citation, or is the app's own working with one
    for (const line of text.split("\n").filter((l) => l.startsWith("- "))) expect(line, line).toMatch(/\[\d+\]$|\[\d+\]\.?$/);
  });

  it("gives the review's verdict on a catalogue-only supplement", () => {
    const text = catalogueReply("Glutamine", ctx, kb)!;
    expect(text).toContain("little to no evidence");
    expect(text).toMatch(/does not support athletes taking supplements in category III/);
  });

  it("builds a goal-specific shortlist with what to skip", () => {
    const text = overviewReply({ ...ctx, goal: "muscle", weightKg: 70, weightFrom: "log" }, kb);
    expect(text.indexOf("Creatine monohydrate")).toBeLessThan(text.indexOf("Caffeine"));
    expect(text).toContain("**Skip these**");
    expect(text).toMatch(/Glutamine/);
    expect(text).toContain("Using your latest weigh-in from Fuel");
  });

  it("adds the vegan notes only for someone plant-based", () => {
    expect(overviewReply({ ...ctx, plantBased: true }, kb)).toContain("If you're vegetarian or vegan");
    expect(overviewReply(ctx, kb)).not.toContain("If you're vegetarian or vegan");
  });

  it("explains a product category part by part", () => {
    const text = groupReply("test-boosters", ctx, kb);
    expect(text).toContain("Tribulus terrestris");
    expect(text).toContain("little to no evidence");
  });

  it("says so when the library has nothing", () => {
    expect(notCoveredReply("ashwagandha", kb)).toMatch(/nothing on \*\*ashwagandha\*\*, so I won't guess/);
  });
});
