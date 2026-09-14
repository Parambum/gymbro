import { describe, it, expect } from "vitest";
import { editDistanceWithin, matchScore, normalize, rankFoods, tokenize, type SearchCandidate } from "./search";

const food = (id: string, name: string, aliases: string[] = [], extra: Partial<SearchCandidate> = {}): SearchCandidate => ({
  id,
  name,
  aliases,
  searchText: [name, ...aliases].join(" ").toLowerCase(),
  isVerified: true,
  popularity: 0,
  ...extra,
});

const DB = [
  food("dal", "Masoor Dal (cooked)", ["red lentil", "masur dal", "dhal", "daal"]),
  food("rice", "Rice, white (cooked)", ["chawal", "bhaat", "steamed rice", "plain rice"]),
  food("paneer", "Paneer", ["cottage cheese", "panir"]),
  food("palak-paneer", "Palak Paneer", ["saag paneer", "spinach paneer"]),
  food("curd", "Curd / Dahi (plain)", ["dahi", "yoghurt", "yogurt"]),
  food("roti", "Roti / Chapati (whole wheat)", ["chapati", "phulka", "roti"]),
  food("milk", "Milk, whole", ["doodh", "full cream milk"]),
  food("lassi", "Sweet Lassi", ["lassi"]),
  food("chicken", "Chicken Breast (cooked, skinless)", ["murgh", "chicken"]),
  food("biryani", "Chicken Biryani", ["murgh biryani"]),
];

const names = (q: string, ctx = {}) => rankFoods(q, DB, ctx).map((r) => r.food.id);

describe("normalize / tokenize", () => {
  it("folds case, accents and punctuation to one form", () => {
    expect(normalize("Dal (toor, cooked)")).toBe("dal toor cooked");
    expect(normalize("Curd / Dahi")).toBe("curd dahi");
    expect(normalize("  Café  ")).toBe("cafe");
  });

  it("returns no tokens for an empty query", () => {
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("")).toEqual([]);
  });
});

describe("editDistanceWithin", () => {
  it("measures small edits", () => {
    expect(editDistanceWithin("paneer", "paneer", 2)).toBe(0);
    expect(editDistanceWithin("panner", "paneer", 2)).toBe(1); // one substitution
    expect(editDistanceWithin("dal", "dahl", 2)).toBe(1); // one insertion
    expect(editDistanceWithin("chiken", "chicken", 2)).toBe(1);
    expect(editDistanceWithin("recipe", "receipt", 2)).toBe(2);
  });

  it("gives up rather than computing a distance nobody asked for", () => {
    expect(editDistanceWithin("paneer", "biryani", 2)).toBeGreaterThan(2);
    expect(editDistanceWithin("a", "abcdefgh", 2)).toBeGreaterThan(2);
  });
});

describe("transliteration — the §6 requirement", () => {
  it("finds dal by every common spelling", () => {
    for (const q of ["dal", "dhal", "daal", "masur dal", "lentil"]) {
      expect(names(q)[0]).toBe("dal");
    }
  });

  it("finds curd by curd and by dahi", () => {
    expect(names("curd")[0]).toBe("curd");
    expect(names("dahi")[0]).toBe("curd");
    expect(names("yoghurt")[0]).toBe("curd");
  });

  it("finds rice by chawal, and roti by chapati", () => {
    expect(names("chawal")[0]).toBe("rice");
    expect(names("chapati")[0]).toBe("roti");
    expect(names("doodh")[0]).toBe("milk");
  });
});

describe("typo tolerance", () => {
  it("forgives a transposed or missing letter", () => {
    expect(names("panner")).toContain("paneer");
    expect(names("panir")[0]).toBe("paneer");
    expect(names("chiken")).toContain("chicken");
  });

  it("does not forgive a completely different word", () => {
    expect(names("bicycle")).toEqual([]);
  });
});

describe("match quality", () => {
  it("prefers the whole-name hit over an incidental mention", () => {
    expect(names("paneer")[0]).toBe("paneer");
    expect(names("milk")[0]).toBe("milk");
  });

  it("requires every query token to match something", () => {
    // "chicken biryani" must not rank plain chicken above the biryani
    expect(names("chicken biryani")[0]).toBe("biryani");
    expect(names("chicken biryani")).not.toContain("chicken");
  });

  it("ranks the more specific dish first for a two-word query", () => {
    expect(names("palak paneer")[0]).toBe("palak-paneer");
  });
});

describe("personal history outranks text", () => {
  it("puts what you eat most at the top", () => {
    const plain = names("c");
    const withHistory = names("c", { frequentIds: ["curd"] });
    expect(withHistory[0]).toBe("curd");
    expect(plain[0]).not.toBe("curd");
  });

  it("ranks a frequent food above a merely recent one", () => {
    const ranked = rankFoods("", DB, { frequentIds: ["rice"], recentIds: ["roti"] });
    expect(ranked.map((r) => r.food.id)).toEqual(["rice", "roti"]);
    expect(ranked[0].reason).toBe("frequent");
    expect(ranked[1].reason).toBe("recent");
  });

  it("decays down the history list, so #1 beats #10", () => {
    const ranked = rankFoods("", DB, { frequentIds: ["rice", "roti", "dal"] });
    expect(ranked.map((r) => r.food.id)).toEqual(["rice", "roti", "dal"]);
  });

  it("shows only personal rows when nothing has been typed", () => {
    expect(rankFoods("", DB, {})).toEqual([]);
    const ranked = rankFoods("", DB, { favoriteIds: ["lassi"] });
    expect(ranked.map((r) => r.food.id)).toEqual(["lassi"]);
    expect(ranked[0].reason).toBe("favorite");
  });
});

describe("verified data breaks ties", () => {
  it("ranks a verified food above an identical unverified one", () => {
    const pair = [
      food("verified", "Poha", [], { isVerified: true }),
      food("unverified", "Poha", [], { isVerified: false }),
    ];
    expect(rankFoods("poha", pair).map((r) => r.food.id)).toEqual(["verified", "unverified"]);
  });
});

describe("matchScore", () => {
  it("is zero when a token matches nothing", () => {
    expect(matchScore("paneer tikka", DB[2])).toBe(0);
  });

  it("is highest for an exact name", () => {
    expect(matchScore("paneer", DB[2])).toBeGreaterThan(matchScore("paneer", DB[3]));
  });

  it("is zero for an empty query", () => {
    expect(matchScore("", DB[0])).toBe(0);
  });
});
