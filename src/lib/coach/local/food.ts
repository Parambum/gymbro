import { normalize, editDistanceWithin } from "@/lib/fuel/search";
import { stem } from "@/lib/coach/rag/bm25";
import type { FoodCandidate, PhraseMatch } from "@/lib/fuel/describe-server";
import type { MacroTotals } from "@/lib/fuel/types";
import { compareVerdict, profileLines, profileOf, type FoodGoal } from "./food-profile";

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
  /** "is paneer good for bulking" — the goal to judge the food against. */
  goal?: FoodGoal | null;
  /** Asked to judge the food ("is X healthy?") rather than for its numbers. */
  judged?: boolean;
}

/** "bulking" → gain, "a cut" → lose; null when the words name no goal. */
export function foodGoalIn(text: string): FoodGoal | null {
  if (/\b(cut|cutting|fat loss|weight loss|losing|lose|diet|dieting|shred\w*|lean|deficit)\b/i.test(text)) return "lose";
  if (/\b(bulk\w*|gain\w*|mass|size|surplus)\b/i.test(text)) return "gain";
  if (/\b(maintain\w*|maintenance)\b/i.test(text)) return "maintain";
  return null;
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

  // is paneer healthy · is rice good for a cut · can I eat bananas while bulking
  const judged =
    text.match(/^(?:is|are)\s+(.+?)\s+(?:healthy|unhealthy|good|bad|ok|okay|fine|worth eating)(?:\s+(?:for|on|during|while)\s+(.+))?$/i) ??
    text.match(/^(?:can|should)\s+i\s+(?:eat|have)\s+(.+?)(?:\s+(?:on|during|while|for|when)\s+(.+))?$/i);
  if (judged) {
    const food = judged[1].replace(/^(the|a|an)\s+/i, "");
    if (food && !NOT_A_FOOD.test(food) && !isTraining(food) && !RESEARCH_TOPIC.test(food) && !ASKS.test(food) && food.split(/\s+/).length <= 5) {
      return { text: food, nutrient: null, explicit: true, judged: true, goal: judged[2] ? foodGoalIn(judged[2]) : null };
    }
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

export interface FoodCompare {
  a: string;
  b: string;
  goal: FoodGoal | "protein" | null;
}

/** "apple vs banana", "rice or roti for weight loss", "which is better, paneer or tofu?". */
export function readFoodCompare(message: string): FoodCompare | null {
  const text = strip(message).toLowerCase();
  const m =
    text.match(/^(?:which is |what'?s |what is )(?:better|healthier|best)(?:\s+for\s+([^,:]+?))?[,:]?\s+(.+?)\s+or\s+(.+?)$/) ??
    text.match(/^(.+?)\s+or\s+(.+?)[,]?\s+which is (?:better|healthier)(?:\s+for\s+(.+))?$/) ??
    text.match(/^compare\s+(.+?)\s+(?:and|with|to|vs\.?)\s+(.+?)(?:\s+for\s+(.+))?$/) ??
    text.match(/^(.+?)\s+(?:vs\.?|versus|v\/s|or|compared (?:to|with))\s+(.+?)(?:\s+for\s+(.+))?$/);
  if (!m) return null;
  // the first pattern puts the goal first
  const [a, b, goalText] = m[0].match(/^(?:which is |what'?s |what is )/) ? [m[2], m[3], m[1]] : [m[1], m[2], m[3]];
  const side = (s: string | undefined) => {
    const t = (s ?? "").replace(/^(the|a|an)\s+/, "").trim();
    return t && /[a-z]/.test(t) && t.split(/\s+/).length <= 4 && !NOT_A_FOOD.test(t) && !isTraining(t) && !RESEARCH_TOPIC.test(t) && !ASKS.test(t) ? t : null;
  };
  const left = side(a);
  const right = side(b);
  if (!left || !right) return null;
  const goal = goalText ? (/\bprotein\b/.test(goalText) ? "protein" : foodGoalIn(goalText)) : null;
  return { a: left, b: right, goal };
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
  const p = f.per100g as FoodCandidate["per100g"] & { sugarG?: number; sodiumMg?: number };
  const bits = [
    hideCalories ? null : `${fmt(p.kcal)} kcal`,
    `${fmt(p.proteinG, " g")} protein`,
    `${fmt(p.carbsG, " g")} carbs`,
    p.sugarG != null ? `${fmt(p.sugarG, " g")} sugar` : null,
    `${fmt(p.fatG, " g")} fat`,
    p.fiberG ? `${fmt(p.fiberG, " g")} fibre` : null,
    p.sodiumMg != null ? `${fmt(p.sodiumMg, " mg")} sodium` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

export interface FoodReplyOptions {
  /** Fuel's eyes-off mode: no calorie numbers anywhere. */
  hideCalories: boolean;
  signedIn: boolean;
  /** The goal to judge the food against — asked about, or from the Fuel profile. */
  goal?: FoodGoal | null;
  /** The day's target, for "that's 5% of your calories". */
  target?: { kcal: number; proteinG: number } | null;
  /** Calories left today before this food, when anything is logged. */
  remainingKcal?: number | null;
}

/** "That's 5% of your 2,200 kcal and 1% of your 140 g protein." */
function forYouLines(m: MacroTotals, opts: FoodReplyOptions): string[] {
  const t = opts.target;
  if (!t || t.kcal <= 0) return [];
  const pct = (v: number, of: number) => `${Math.round((v / of) * 100)}%`;
  const lines = [
    opts.hideCalories
      ? `- **For you:** ${pct(m.proteinG, t.proteinG)} of your ${fmt(t.proteinG)} g protein target.`
      : `- **For you:** ${pct(m.kcal, t.kcal)} of your ${fmt(t.kcal)} kcal and ${pct(m.proteinG, t.proteinG)} of your ${fmt(t.proteinG)} g protein for the day.`,
  ];
  if (!opts.hideCalories && opts.remainingKcal != null) {
    const after = Math.round(opts.remainingKcal - m.kcal);
    lines.push(after >= 0 ? `- After this you'd have **${fmt(after)} kcal** left today.` : `- This would put you **${fmt(-after)} kcal** over today's target.`);
  }
  return lines;
}

export function foodReply(ask: FoodAsk, matches: PhraseMatch[], unclear: string[], opts: FoodReplyOptions): string {
  const lines: string[] = [];
  const { hideCalories } = opts;

  if (matches.length === 1) {
    const m = matches[0];
    lines.push(`**${m.food.name}** — ${portionText(m)}`);
    lines.push(`- ${macroLine(m.macros, ask.nutrient, hideCalories)}`);
    lines.push(...forYouLines(m.macros, opts));
    lines.push("", "**Per 100 g**", `- ${per100Line(m.food, hideCalories)}`);
    lines.push(...profileLines(m.food, m.portions, { hideCalories, goal: ask.goal ?? opts.goal ?? null }));
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
    lines.push(...forYouLines(total, opts));
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

/** Two foods side by side: a serving of each, then per 100 g, then which wins for the goal. */
export function compareReply(cmp: FoodCompare, a: PhraseMatch, b: PhraseMatch, opts: FoodReplyOptions): string {
  const { hideCalories } = opts;
  const pa = { name: a.food.name, pr: profileOf(a.food, a.portions) };
  const pb = { name: b.food.name, pr: profileOf(b.food, b.portions) };
  const p100 = (m: PhraseMatch) => m.food.per100g as FoodCandidate["per100g"] & { sugarG?: number };
  const row = (label: string, get: (m: PhraseMatch) => number | undefined, unit: string) => {
    const x = get(a);
    const y = get(b);
    return x == null || y == null ? null : `- ${label}: ${fmt(x, unit)} vs ${fmt(y, unit)}`;
  };
  const lines = [
    `### ${a.food.name} vs ${b.food.name}`,
    "",
    "**A typical serving**",
    `- **${a.food.name}** (${portionText(a)}) — ${macroLine(a.macros, null, hideCalories)}`,
    `- **${b.food.name}** (${portionText(b)}) — ${macroLine(b.macros, null, hideCalories)}`,
    "",
    "**Per 100 g**",
    ...[
      hideCalories ? null : row("Calories", (m) => p100(m).kcal, " kcal"),
      row("Protein", (m) => p100(m).proteinG, " g"),
      row("Carbs", (m) => p100(m).carbsG, " g"),
      row("Sugar", (m) => p100(m).sugarG, " g"),
      row("Fat", (m) => p100(m).fatG, " g"),
      row("Fibre", (m) => p100(m).fiberG, " g"),
    ].filter((x): x is string => Boolean(x)),
    "",
    "**Which one**",
  ];
  const goal = cmp.goal ?? opts.goal ?? null;
  // eyes-off mode: judge on protein, never on calories
  lines.push(...compareVerdict(pa, pb, hideCalories && goal !== "protein" ? "protein" : goal === "maintain" ? null : goal));
  const sources = [...new Set([a, b].map((m) => SOURCE_LABEL[m.food.source] ?? m.food.source))];
  lines.push("", `*${FOOD_MARKER}: ${sources.join(", ")}.*`);
  return lines.join("\n");
}

/** What to say when someone clearly asked about a food and nothing matched. */
export function noFoodReply(ask: FoodAsk): string {
  return `I couldn't find **${ask.text}** in the food database, and I won't guess its calories. Try a simpler or more common name (like "paneer", "dal" or "chicken breast"), or scan the barcode in **Fuel** if it's a packaged food.`;
}
