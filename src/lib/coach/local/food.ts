import { normalize, editDistanceWithin } from "@/lib/fuel/search";
import { stem } from "@/lib/coach/rag/bm25";
import type { FoodCandidate, PhraseMatch } from "@/lib/fuel/describe-server";
import type { MacroTotals } from "@/lib/fuel/types";

/**
 * "apple", "calories in 2 eggs", "how much protein does 100g paneer have",
 * "I had 2 roti and dal" — answered from the app's own food database (USDA,
 * the Indian Nutrient Databank, Open Food Facts), through the same matcher
 * Fuel's "Describe it" uses. The coach never estimates a food: no match, no
 * number.
 *
 * This file is the pure half — reading the question, judging a match and
 * writing the reply. The database half is matchDescription() in
 * lib/fuel/describe-server.ts, called from the agent.
 */

export type Nutrient = "kcal" | "protein" | "carbs" | "fat" | "fiber";

export interface FoodAsk {
  /** The food phrase(s), amounts included: "2 boiled eggs, 1 roti". */
  text: string;
  /** The nutrient the question named, if one — it leads the reply. */
  nutrient: Nutrient | null;
  /** They asked for nutrition outright, rather than just naming a food. */
  explicit: boolean;
}

/** Every food reply carries this line, which is how "and 2 rotis" is read as a follow-up. */
export const FOOD_MARKER = "From the GymBro food database";

const NUTRIENT =
  "(calories|calorie|cals?|kcals?|energy|macros?|macronutrients|protein|proteins|carbs?|carbohydrates?|fats?|fibre|fiber|nutrition(?:al)?(?: (?:info|information|facts|values?))?|nutrients?)";

function nutrientOf(word: string): Nutrient | null {
  const w = word.toLowerCase();
  if (/^protein/.test(w)) return "protein";
  if (/^carb/.test(w)) return "carbs";
  if (/^fats?$/.test(w)) return "fat";
  if (/^fib/.test(w)) return "fiber";
  if (/^(calorie|cal|kcal|energy)/.test(w)) return "kcal";
  return null; // macros / nutrition: the whole panel
}

/**
 * A "food" that is really a person, a goal or a time span: "how much protein
 * for muscle gain", "calories in a day", "protein for women". Those are
 * research questions, and must not be looked up as products.
 */
const NOT_A_FOOD =
  /\b(i|me|my|myself|you|day|daily|week|weekly|per|bulk\w*|cut|cutting|muscle|muscles|weight|lose|losing|gain|gaining|maintain\w*|deficit|surplus|diet|goal|body|athletes?|men|women|male|female|beginners?|workout|training|exercise|gym|kg|kilo\w*|pound|lbs?|vegetarians?|vegans?|people|adults?|kids?|children|elderly|older|seniors?|teens?|teenagers?|runners?|lifters?|bodybuilders?|breakfast|lunch|dinner|snacks?|meals?|today)\b/i;

/**
 * Words that make a short message a question about something, not a food.
 * Not "do": in Hinglish it is two ("do roti").
 */
const ASKS =
  /\b(how|what|why|when|where|who|which|should|can|could|would|will|does|did|is|are|best|better|worse|vs|versus|good|bad|healthy|unhealthy|need|want|help|tips?|advice|explain|tell|plan|build|make|show)\b/i;

/** Training words: "legs", "pull day", "5x5" are not foods — unless it is a cut of meat. */
const TRAINING =
  /\b(workout|train\w*|gym|sets?|reps?|squat\w*|deadlift\w*|bench|press|curls?|rows?|pull\s?ups?|push\s?ups?|chin\s?ups?|dips?|plank|cardio|run\w*|walk\w*|stretch\w*|legs?|arms?|chest|back|shoulders?|biceps?|triceps?|abs|glutes?|split|routine|program\w*|deload|failure|hypertrophy|strength|muscles?)\b/i;
const MEAT_CUT = /\b(chicken|mutton|lamb|goat|pork|beef|turkey|duck|fish)\s+(legs?|breasts?|thighs?|wings?|chest|back)\b/i;
const isTraining = (s: string) => TRAINING.test(s) && !MEAT_CUT.test(s);

/**
 * A bare topic the research library covers. "creatine" on its own is a
 * question about creatine, not a request for a creatine tub's label.
 */
const RESEARCH_TOPIC =
  /^(creatine|caffeine|coffee|whey|whey protein|casein|bcaas?|eaas?|hmb|beta[- ]?alanine|keto|ketogenic|fasting|intermittent fasting|vegan|vegetarian|protein|carbs?|fats?|supplements?|pre[- ]?workout|energy drinks?|sleep|nutrient timing)$/i;

const strip = (s: string) =>
  s
    .trim()
    .replace(/[?!.。]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

/** "I had 2 eggs for breakfast" → "2 eggs". */
function mealDescription(s: string): string {
  return s
    .replace(/^(?:today\s+|so far\s+)?(?:i\s+)?(?:just\s+|have\s+|'ve\s+)?(?:ate|eaten|had|eat|eating|having|consumed|drank|drink|log|logged)\s+/i, "")
    .replace(/\s+(?:for|at|in)\s+(?:breakfast|lunch|dinner|snacks?|brunch|supper)$/i, "")
    .replace(/\s+(?:today|just now|this morning|tonight)$/i, "")
    .trim();
}

/**
 * Read a food question out of a message, or null when it isn't one.
 * Explicit questions name a nutrient; implicit ones are a short message that
 * is just food ("apple", "2 roti and dal").
 */
export function readFoodAsk(message: string): FoodAsk | null {
  const text = strip(message);
  if (!/[a-z]/i.test(text) || RESEARCH_TOPIC.test(text)) return null;
  const lead = "(?:(?:how (?:many|much)|what(?:'s| is| are)?(?: the)?|tell me(?: the)?|give me(?: the)?|show me(?: the)?|get me(?: the)?|amount of|total|any)\\s+)*";

  const patterns: Array<[RegExp, number, number]> = [
    // calories in an apple · how many calories are there in 2 eggs · protein of paneer
    [new RegExp(`^${lead}${NUTRIENT}\\s+(?:(?:are|is|does|do)\\s+)?(?:there\\s+)?(?:in|of|for|on)\\s+(.+?)(?:\\s+(?:have|has|contain|contains|got))?$`, "i"), 1, 2],
    // how much protein does 100g paneer have
    [new RegExp(`^how (?:much|many)\\s+${NUTRIENT}\\s+(?:does|do|is|are|will)\\s+(.+?)\\s+(?:have|has|contain|contains|got|give|gives)$`, "i"), 1, 2],
    // is paneer high in protein
    [new RegExp(`^(?:is|are)\\s+(.+?)\\s+(?:high|low|rich|good|a good source)\\s+(?:in|of|for)\\s+${NUTRIENT}$`, "i"), 2, 1],
    // apple calories · 2 eggs macros · paneer protein content
    [new RegExp(`^(.+?)\\s+${NUTRIENT}(?:\\s+(?:content|count|info|value|values|breakdown))?$`, "i"), 2, 1],
    // calories: 2 roti, dal
    [new RegExp(`^${NUTRIENT}\\s*[:\\-]\\s*(.+)$`, "i"), 1, 2],
  ];

  for (const [re, nIdx, fIdx] of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const food = mealDescription(m[fIdx]).replace(/^the\s+/i, "");
    if (!food || NOT_A_FOOD.test(food) || isTraining(food) || ASKS.test(food)) return null;
    return { text: food, nutrient: nutrientOf(m[nIdx]), explicit: true };
  }

  // Implicit: a short message that is only food.
  const described = mealDescription(text);
  const wordCount = described.split(/\s+/).length;
  if (wordCount === 0 || wordCount > 8) return null;
  if (/\?/.test(message) && wordCount > 3) return null;
  if (ASKS.test(described) || isTraining(described) || RESEARCH_TOPIC.test(described)) return null;
  if (/\b(i|me|my|you|your)\b/i.test(described)) return null;
  return { text: described, nutrient: null, explicit: false };
}

/** Plural and simple inflections fold together: "eggs" is "egg", "apples" is "apple". */
const fold = (t: string) => stem(t.replace(/es$/, (e) => (t.length > 4 && /(ch|sh|x|o)es$/.test(t) ? "" : e)));

function tokenMatches(q: string, c: string): boolean {
  if (q === c || fold(q) === fold(c)) return true;
  // "toast" → "toasted", "boil" → "boiled" — never "car" → "carrots"
  if (q.length >= 4 && c.startsWith(q) && c.length - q.length <= 3) return true;
  // typos: "panner" → "paneer", "chiken" → "chicken"
  if (q.length >= 5 && editDistanceWithin(q, c, 1) <= 1) return true;
  if (q.length >= 8 && editDistanceWithin(q, c, 2) <= 2) return true;
  return false;
}

/**
 * Stricter than the search box: every word of the phrase must be a word of
 * the food — its name, brand or an alias. The search box may offer
 * "Carrots" for "car" because someone is mid-word; the coach answering a
 * finished message must not.
 */
export function wholeWordMatch(query: string, food: Pick<FoodCandidate, "name" | "brand" | "aliases">): boolean {
  const q = normalize(query).split(" ").filter((t) => t && !/^\d+$/.test(t));
  if (q.length === 0) return false;
  const c = normalize([food.name, food.brand ?? "", ...(food.aliases ?? [])].join(" ")).split(" ").filter(Boolean);
  return q.every((qt) => c.some((ct) => tokenMatches(qt, ct)));
}

// ── which food, when several match ──────────────────────────────────

/**
 * Everyday staples, pinned to one reviewed row each. The search box can offer
 * a list and let you pick; the coach answers with one food, and for the words
 * people type most the ranker's tie-break is alphabetical — "apple" lands on
 * "Apple cider", "rice" on a branded pack. Home-cooked Indian staples point
 * at the Indian Nutrient Databank, the rest at USDA, as the vision mapping
 * does. The reply always names the food it used, so a pin is never hidden.
 */
export const CANONICAL_FOODS: Array<[RegExp, string]> = [
  [/^(apples?|seb)$/, "Apple, raw"],
  [/^(bananas?|kela)$/, "Bananas, raw"],
  [/^(oranges?|santra)$/, "Orange, raw"],
  [/^(mangoe?s?|aam)$/, "Mango, raw"],
  [/^(eggs?|anda|ande)$/, "Egg, whole, raw, fresh"],
  [/^(boiled|hard boiled|hardboiled) (eggs?|anda|ande)$/, "Egg, whole, cooked, hard-boiled"],
  [/^((white |cooked |plain )?rice|chawal)$/, "Rice, white, cooked, no added fat"],
  [/^(milk|doodh)$/, "Milk"],
  [/^(white )?bread$/, "Bread, white"],
  [/^chicken( breast)?$/, "Chicken, breast, boneless, skinless"],
  [/^(paneer|panir)$/, "Cheese, paneer"],
  [/^(curd|dahi|yogurt|yoghurt)$/, "Yogurt, plain, whole milk"],
  [/^(potato(es)?|aloo)$/, "Potato"],
  [/^(dal|daal|dhal)$/, "Dal"],
  [/^(rotis?|chapatis?|chapattis?|phulkas?)$/, "Chapati/Roti"],
  [/^(idlis?|idly)$/, "Idli"],
  [/^(almonds?|badam)$/, "Almonds"],
  [/^peanut butter$/, "Peanut butter"],
  [/^poha$/, "Poha"],
  [/^upma$/, "Upma"],
];

export function canonicalFood(query: string): string | null {
  const q = normalize(query);
  return CANONICAL_FOODS.find(([re]) => re.test(q))?.[1] ?? null;
}

/** Descriptors that don't make a food a different food. */
const GENERIC = new Set(
  "raw fresh whole plain ns as to regular and or of in with the home made homemade prepared average form from type style all varieties ripe cooked boiled steamed skin medium large small mature seeds commercial commercially white includes".split(" "),
);

/**
 * Among foods that all match, prefer the plain one: unbranded unless a brand
 * was named, lab-verified over crowd-sourced label data, and the fewest words
 * the question didn't ask for ("Bananas, raw" over "Banana chips").
 */
export function preferPlainFood<R extends { score: number; food: Pick<FoodCandidate, "name" | "brand" | "isVerified"> }>(
  query: string,
  ranked: R[],
): R[] {
  const asked = new Set(normalize(query).split(" ").filter(Boolean).map(fold));
  const brandAsked = (brand: string | null | undefined) =>
    Boolean(brand) && normalize(brand!).split(" ").some((t) => asked.has(fold(t)));
  const cost = (r: R) => {
    const name = normalize(r.food.name.replace(/\([^)]*\)/g, " "));
    const extras = name.split(" ").filter((t) => t && !asked.has(fold(t)) && !GENERIC.has(t) && !/^\d/.test(t));
    return -r.score + (r.food.brand && !brandAsked(r.food.brand) ? 30 : 0) + (r.food.isVerified ? 0 : 15) + 12 * extras.length;
  };
  return [...ranked].sort((a, b) => cost(a) - cost(b) || a.food.name.length - b.food.name.length);
}

/** The coach's matching rules, as options for matchDescription(). */
export const FOOD_MATCHING = { accept: wholeWordMatch, rerank: preferPlainFood, pinned: canonicalFood, shortlist: 25 };

// ── the reply ────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  usda: "USDA FoodData Central",
  indb: "Indian Nutrient Databank",
  ifct: "Indian Food Composition Tables",
  off: "Open Food Facts (from the pack label)",
  user: "your custom food",
  recipe: "your recipe",
  ai: "an earlier AI estimate",
};

const fmt = (n: number, unit = "") => {
  const v = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${v.toLocaleString("en-IN")}${unit}`;
};

function portionText(m: PhraseMatch): string {
  const { quantity, unit } = m.phrase;
  if (unit === "g" || unit === "ml") return `${fmt(quantity)} ${unit}`;
  const chosen = m.portion.replace(/^[\d.]+ × /, "");
  if (m.portions.length === 0) return `${fmt(m.grams)} g`;
  const label = quantity === 1 ? chosen : `${fmt(quantity)} × ${chosen.replace(/^1 /, "")}`;
  return `${label} · ${fmt(m.grams)} g`;
}

const NUTRIENT_PARTS: Array<[Nutrient, (m: MacroTotals) => string]> = [
  ["kcal", (m) => `${fmt(m.kcal)} kcal`],
  ["protein", (m) => `${fmt(m.proteinG, " g")} protein`],
  ["carbs", (m) => `${fmt(m.carbsG, " g")} carbs`],
  ["fat", (m) => `${fmt(m.fatG, " g")} fat`],
  ["fiber", (m) => `${fmt(m.fiberG, " g")} fibre`],
];

/**
 * @param hideCalories the user turned on Fuel's eyes-off mode, which hides
 *   calorie numbers for people for whom a count is harmful — the coach honours
 *   it like every other screen does.
 */
function macroLine(m: MacroTotals, lead: Nutrient | null, hideCalories: boolean): string {
  const parts = NUTRIENT_PARTS.filter(([k]) => !(hideCalories && k === "kcal")).filter(([k]) => k !== "fiber" || lead === "fiber");
  const ordered = lead ? [...parts.filter(([k]) => k === lead), ...parts.filter(([k]) => k !== lead)] : parts;
  return ordered.map(([k, f], i) => (i === 0 || k === lead ? `**${f(m)}**` : f(m))).join(" · ");
}

function per100Line(f: FoodCandidate, hideCalories: boolean): string {
  const p = f.per100g;
  const bits = [
    hideCalories ? null : `${fmt(p.kcal)} kcal`,
    `${fmt(p.proteinG, " g")} protein`,
    `${fmt(p.carbsG, " g")} carbs`,
    `${fmt(p.fatG, " g")} fat`,
    p.fiberG ? `${fmt(p.fiberG, " g")} fibre` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

export function foodReply(
  ask: FoodAsk,
  matches: PhraseMatch[],
  unclear: string[],
  opts: { hideCalories: boolean; signedIn: boolean },
): string {
  const lines: string[] = [];
  const { hideCalories } = opts;

  if (matches.length === 1) {
    const m = matches[0];
    lines.push(`**${m.food.name}** — ${portionText(m)}`);
    lines.push(`- ${macroLine(m.macros, ask.nutrient, hideCalories)}`);
    lines.push(`- Per 100 g: ${per100Line(m.food, hideCalories)}`);
  } else {
    for (const m of matches) {
      lines.push(`- **${m.food.name}** (${portionText(m)}) — ${macroLine(m.macros, ask.nutrient, hideCalories)}`);
    }
    const total = matches.reduce<MacroTotals>(
      (s, m) => ({
        kcal: s.kcal + m.macros.kcal,
        proteinG: s.proteinG + m.macros.proteinG,
        carbsG: s.carbsG + m.macros.carbsG,
        fatG: s.fatG + m.macros.fatG,
        fiberG: s.fiberG + m.macros.fiberG,
      }),
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    );
    lines.push("", `**Total:** ${macroLine(total, ask.nutrient, hideCalories)}`);
  }

  if (unclear.length > 0) {
    lines.push("", `I couldn't find ${unclear.map((u) => `**${u}**`).join(", ")} in the food database, so ${unclear.length === 1 ? "it isn't" : "they aren't"} counted. Try a simpler name, like "dal" or "chicken curry".`);
  }

  const noAmount = matches.some((m) => !m.phrase.unit && m.phrase.quantity === 1 && m.portions.length > 0);
  const sources = [...new Set(matches.map((m) => SOURCE_LABEL[m.food.source] ?? m.food.source))];
  const unverified = matches.some((m) => !m.food.isVerified);
  lines.push(
    "",
    `*${FOOD_MARKER}: ${sources.join(", ")}${unverified ? " — label data, not lab-verified" : ""}.${noAmount ? " No amount given, so I used one typical serving." : ""}*`,
  );
  lines.push(
    opts.signedIn
      ? `Want a different amount? Ask like **150 g ${matches[0].phrase.query}**. To log it, open **Fuel → Describe it** and type the same words.`
      : `Want a different amount? Ask like **150 g ${matches[0].phrase.query}**. Sign in and Fuel can log it for you.`,
  );
  return lines.join("\n");
}

/** What to say when someone clearly asked about a food and nothing matched. */
export function noFoodReply(ask: FoodAsk): string {
  return `I couldn't find **${ask.text}** in the food database, and I won't guess its calories. Try a simpler or more common name (like "paneer", "dal" or "chicken breast"), or scan the barcode in **Fuel** if it's a packaged food.`;
}
