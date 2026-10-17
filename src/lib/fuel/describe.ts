/**
 * "2 roti, 1 katori dal aur ek glass doodh" -> three phrases with amounts.
 *
 * The keyless half of natural-language logging. With an Anthropic key the
 * parse route asks a model; without one it uses this, and a meal described the
 * way people actually describe a thali still comes back as a draft. It is
 * deliberately simple — numbers, a household unit, and the rest is the food —
 * because every result goes through the same check-before-saving sheet, and
 * the food itself is found by the search ranker, which already knows that
 * "doodh" is milk and "dhal" is dal.
 *
 * Pure: no database, no network. The route does the lookups.
 */

export interface Phrase {
  raw: string;
  quantity: number;
  /** Canonical unit, or null when the amount is a count of the food itself ("2 roti"). */
  unit: Unit | null;
  /** What to search for. */
  query: string;
}

export type Unit =
  | "g"
  | "ml"
  | "katori"
  | "bowl"
  | "plate"
  | "glass"
  | "cup"
  | "piece"
  | "slice"
  | "tbsp"
  | "tsp"
  | "scoop"
  | "handful";

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, half: 0.5, couple: 2, few: 3,
  // Hindi / Hinglish
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6,
  saat: 7, aath: 8, aadha: 0.5, adha: 0.5, aadhi: 0.5, adhi: 0.5, dedh: 1.5, dhai: 2.5, dhaai: 2.5,
};

const UNIT_WORDS: Record<string, Unit> = {
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g", gr: "g",
  ml: "ml",
  katori: "katori", katoris: "katori", vati: "katori", bowl: "bowl", bowls: "bowl",
  plate: "plate", plates: "plate", thali: "plate",
  glass: "glass", glasses: "glass", gilas: "glass",
  cup: "cup", cups: "cup", mug: "cup",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", nos: "piece",
  slice: "slice", slices: "slice",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", chammach: "tbsp", spoon: "tbsp", spoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  scoop: "scoop", scoops: "scoop",
  handful: "handful", mutthi: "handful",
};

/** Joining words that never belong to the food name. */
const FILLER = new Set(["of", "ka", "ki", "ke", "with", "and", "aur", "plus", "some", "thoda", "thodi", "x"]);

/** Split a sentence into one phrase per food. */
export function splitMeal(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\s+(?:and|aur|plus|with|n|&|\+)\s+/g, ",")
    .split(/[,;\n+&]|(?:\s|^)\d+\)\s/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseNumber(token: string): number | null {
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  if (/^\d+\/\d+$/.test(token)) {
    const [a, b] = token.split("/").map(Number);
    return b ? a / b : null;
  }
  if (token === "½") return 0.5;
  if (token === "¼") return 0.25;
  if (token === "¾") return 0.75;
  return NUMBER_WORDS[token] ?? null;
}

/** "200g paneer", "2 roti", "ek katori dal", "half plate biryani", "curd". */
export function parsePhrase(raw: string): Phrase {
  // "200g" / "250ml" glued together
  const spaced = raw.replace(/(\d)(g|gm|gms|ml)\b/gi, "$1 $2");
  const tokens = spaced.split(/\s+/).filter(Boolean);

  let quantity: number | null = null;
  let unit: Unit | null = null;
  const rest: string[] = [];

  for (const t of tokens) {
    const n = parseNumber(t);
    // "do" is also English; only read it as a number before anything else.
    if (n != null && quantity == null && rest.length === 0) {
      quantity = n;
      continue;
    }
    const u = UNIT_WORDS[t];
    if (u && unit == null && rest.length === 0) {
      unit = u;
      continue;
    }
    if (FILLER.has(t)) continue;
    rest.push(t);
  }

  // "dal 2 katori" — amount after the food
  if (quantity == null) {
    const m = spaced.match(/(\d+(?:\.\d+)?)\s*(\w+)?\s*$/);
    if (m && rest.length > 1) {
      quantity = Number(m[1]);
      const u = m[2] ? UNIT_WORDS[m[2]] : undefined;
      if (u) unit = u;
      const strip = new Set([m[1], m[2]].filter(Boolean));
      for (let i = rest.length - 1; i >= 0 && strip.size; i--) {
        if (strip.has(rest[i])) {
          strip.delete(rest[i]);
          rest.splice(i, 1);
        }
      }
    }
  }

  return { raw, quantity: quantity ?? 1, unit, query: rest.join(" ") };
}

export interface PortionOption {
  label: string;
  grams: number;
  isDefault?: boolean;
}

const UNIT_LABEL_HINTS: Record<Unit, RegExp | null> = {
  g: null,
  ml: null,
  katori: /katori/i,
  bowl: /bowl|katori \(medium\)/i,
  plate: /plate/i,
  glass: /glass/i,
  cup: /\bcup\b/i,
  piece: /^1 (?!katori|cup|glass|plate|bowl|tbsp|tsp|scoop)/i,
  slice: /slice/i,
  tbsp: /tbsp/i,
  tsp: /tsp/i,
  scoop: /scoop/i,
  handful: /handful/i,
};

/**
 * Does this food come in the unit the phrase named? "a glass of doodh" is
 * milk, not Doodh biscuits — biscuits have no glass. A bare count or a weight
 * says nothing about the food, so it matches anything.
 */
export function servesIn(p: Phrase, portions: PortionOption[]): boolean {
  if (!p.unit || p.unit === "g" || p.unit === "ml") return true;
  const hint = UNIT_LABEL_HINTS[p.unit];
  return hint == null || portions.some((x) => hint.test(x.label));
}

/**
 * Grams for a phrase, given the food's portion list. A stated weight wins; a
 * stated household unit picks the matching portion; a bare count ("2 roti")
 * means that many default portions.
 */
export function gramsFor(p: Phrase, portions: PortionOption[]): { grams: number; portion: string } {
  if (p.unit === "g" || p.unit === "ml") {
    return { grams: p.quantity, portion: `${p.quantity} ${p.unit}` };
  }
  const hint = p.unit ? UNIT_LABEL_HINTS[p.unit] : null;
  const byUnit = hint ? portions.find((x) => hint.test(x.label)) : undefined;
  const chosen = byUnit ?? portions.find((x) => x.isDefault) ?? portions[0];
  if (!chosen) return { grams: 100 * p.quantity, portion: `${p.quantity} × 100 g` };
  return {
    grams: Math.round(chosen.grams * p.quantity * 10) / 10,
    portion: `${p.quantity} × ${chosen.label}`,
  };
}
