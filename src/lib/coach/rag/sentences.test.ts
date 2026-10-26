import { describe, expect, it } from "vitest";
import { splitSentences } from "./sentences";

describe("splitSentences", () => {
  it("splits ordinary sentences", () => {
    expect(splitSentences("Protein matters. Sleep matters too! Does timing? Less so.")).toEqual([
      "Protein matters.",
      "Sleep matters too!",
      "Does timing?",
      "Less so.",
    ]);
  });

  it("does not split after et al., e.g., vs. or Fig.", () => {
    expect(splitSentences("Jäger et al. Found this. Compare A vs. B for strength.")).toEqual([
      "Jäger et al. Found this.",
      "Compare A vs. B for strength.",
    ]);
    expect(splitSentences("Use compounds (e.g. Squats) first. Then accessories.")).toHaveLength(2);
  });

  it("never splits a decimal", () => {
    expect(splitSentences("Take 1.6 g/kg daily. More is fine.")).toEqual(["Take 1.6 g/kg daily.", "More is fine."]);
  });

  it("does not split after an initial or an internal-period abbreviation", () => {
    expect(splitSentences("As J. Smith noted in the U.S. Army, rest helps.")).toHaveLength(1);
  });

  it("keeps an enumerator with the sentence it numbers", () => {
    expect(splitSentences("Does creatine cause hair loss? 2. Is creatine a steroid? 3. Is it safe?")).toEqual([
      "Does creatine cause hair loss?",
      "2. Is creatine a steroid?",
      "3. Is it safe?",
    ]);
  });

  it("ends a sentence at abbreviation-plus-period and tidies the double stop", () => {
    expect(splitSentences("See the review by Campbell et al.. Reportedly it helps.")).toEqual([
      "See the review by Campbell et al.",
      "Reportedly it helps.",
    ]);
  });

  it("splits after a curly closing quote", () => {
    expect(splitSentences("There is no ideal “hypertrophy zone.” From a practical standpoint, moderate loads work.")).toEqual([
      "There is no ideal “hypertrophy zone.”",
      "From a practical standpoint, moderate loads work.",
    ]);
  });

  it("lets an ordinary abbreviation end a sentence when a new one clearly starts", () => {
    expect(splitSentences("Rest for 3 min. The next set starts then.")).toHaveLength(2);
    expect(splitSentences("They ate approx. 20 g at each meal.")).toHaveLength(1);
  });
});
