import { sourceLines, type Citation } from "@/lib/coach/rag/compose";
import type { KbFile, KbSource } from "@/lib/coach/rag/store";

/**
 * Supplements, answered in depth — and only from the research library.
 *
 * Two layers, both read out of the library rather than written here:
 *
 *  - The verdict. The ISSN's evidence review (Kerksick et al. 2018) files
 *    every supplement it covers under "strong evidence", "limited or mixed
 *    evidence" or "little to no evidence", separately for building muscle and
 *    for performance. Those are the review's own section headings, so the
 *    catalogue below is parsed from them: about sixty supplements, each with
 *    its tier and the review's own paragraphs about it.
 *
 *  - The detail. For the supplements with their own ISSN position stand
 *    (creatine, protein, caffeine, coffee, beta-alanine, HMB, omega-3, sodium
 *    bicarbonate, energy drinks) a card picks the sentences that answer the
 *    questions people ask — does it work, how much, when, is it safe. A card
 *    holds no claims of its own: each line names a paper and the opening words
 *    of one of its sentences, and the reply quotes that sentence in full.
 *    supplements.test.ts fails if any of them is not in the library.
 *
 * The only arithmetic is a quoted per-kilogram dose times the user's own
 * recorded weight, shown with its working.
 */

// ── what the library says, found by its opening words ───────────────

export interface QuoteRef {
  /** PMCID of the paper. */
  src: string;
  /** The opening words of the sentence, enough to be unique. */
  starts: string;
}

const q = (src: string, starts: string): QuoteRef => ({ src, starts });

const P = {
  protein: "PMC5477153",
  creatine: "PMC5469049",
  creatineQA: "PMC7871530",
  creatineQA2: "PMC11703406",
  caffeine: "PMC7777221",
  coffee: "PMC10375938",
  energyDrinks: "PMC9987737",
  vegan: "PMC5598028",
  betaAlanine: "PMC4501114",
  hmb: "PMC11740297",
  omega3: "PMC11737053",
  bicarb: "PMC8427947",
  review: "PMC6090881",
} as const;

/** A per-kilogram dose stated in one quoted sentence, to scale by the user's weight. */
export interface PerKg {
  quote: QuoteRef;
  low: number;
  high?: number;
  unit: "mg" | "g";
  per: "day" | "dose" | "meal";
  /** What the scaled figure is, e.g. "protein a day". */
  label: string;
}

export type Aspect = "verdict" | "dose" | "timing" | "safety";

export interface SupplementCard {
  id: string;
  label: string;
  /** Matched against the lower-cased message. */
  aliases: RegExp;
  /** Heading names in the ISSN review's catalogue, for the verdict. */
  reviewNames: string[];
  verdict: QuoteRef[];
  what: QuoteRef[];
  dose: QuoteRef[];
  timing: QuoteRef[];
  safety: QuoteRef[];
  perKg?: PerKg[];
  /** Said only to vegans and vegetarians. */
  plantBased?: QuoteRef[];
  /** Food first: where the diet can supply it. */
  foodFirst?: QuoteRef[];
}

export const CARDS: SupplementCard[] = [
  {
    id: "creatine",
    label: "Creatine monohydrate",
    aliases: /\bcreatine\b|\bcrm\b/,
    reviewNames: ["Creatine monohydrate"],
    verdict: [
      q(P.review, "In our view, the most effective nutritional supplement available to athletes"),
      q(P.creatineQA2, "Creatine monohydrate supplementation (CrM) is a safe and effective intervention"),
    ],
    what: [
      q(P.review, "Numerous studies have indicated that creatine supplementation increases body mass"),
      q(P.creatine, "After creatine loading, performance of high intensity and/or repetitive exercise"),
      q(P.creatine, "Therefore, there is strong evidence that creatine supplementation can help athletes"),
    ],
    dose: [
      q(P.creatineQA, "Smaller, daily dosages of creatine supplementation"),
      q(P.creatineQA, "Therefore, a creatine"),
      q(P.creatine, "The most effective way to increase muscle creatine stores is to ingest 5 g"),
      q(P.creatine, "Once muscle creatine stores are fully saturated"),
    ],
    timing: [
      q(P.creatineQA2, "The timing of CrM does not appear to be a limiting factor"),
      q(P.creatineQA2, "Consistent CrM during an exercise training program is likely the most important variable."),
    ],
    safety: [
      q(P.creatine, "These studies show that short and long-term supplementation (up to 30 g/day for 5 years)"),
      q(P.creatineQA, "Creatine supplementation, when ingested at recommended dosages, does not result in kidney damage"),
      q(P.creatineQA, "The majority of available evidence does not support a link between creatine supplementation and hair loss"),
      q(P.creatineQA, "Creatine supplementation does not always lead to water retention."),
      q(P.creatineQA, "Creatine supplementation does not increase fat mass."),
      q(P.creatineQA, "Other forms of creatine are not superior to creatine monohydrate."),
    ],
    perKg: [
      {
        quote: q(P.creatineQA, "Smaller, daily dosages of creatine supplementation"),
        low: 0.1,
        unit: "g",
        per: "day",
        label: "creatine a day",
      },
    ],
    plantBased: [q(P.creatineQA2, "Populations with lower baseline creatine levels, such as vegans and vegetarians")],
  },
  {
    id: "protein",
    label: "Protein (whey, casein or plant)",
    aliases:
      /\b(protein powders?|whey|casein|protein shakes?|protein supplements?|plant protein|pea protein|soy protein|mass gainers?)\b|^protein$|\bhow much protein (do i|should i|per day|a day|daily|i need)|\bprotein (intake|requirements?|needs?) /,
    reviewNames: ["Protein"],
    verdict: [
      q(P.review, "These authors concluded that protein supplementation demonstrated a positive effect"),
      q(P.protein, "An acute exercise stimulus, particularly resistance exercise, and protein ingestion both stimulate"),
    ],
    what: [
      q(P.protein, "Rapidly digested proteins that contain high proportions of essential amino acids"),
      q(P.protein, "In general, the proteins with the greatest leucine content include dairy"),
    ],
    dose: [
      q(P.protein, "For building muscle mass and for maintaining muscle mass through a positive muscle protein balance"),
      q(P.protein, "Higher protein intakes (2.3"),
      q(P.protein, "General recommendations are 0.25 g of a high-quality protein per kg of body weight"),
    ],
    timing: [
      q(P.protein, "These protein doses should ideally be evenly distributed"),
      q(P.protein, "Pre-sleep casein protein intake"),
    ],
    safety: [],
    perKg: [
      {
        quote: q(P.protein, "For building muscle mass and for maintaining muscle mass through a positive muscle protein balance"),
        low: 1.4,
        high: 2.0,
        unit: "g",
        per: "day",
        label: "protein a day",
      },
      {
        quote: q(P.protein, "Higher protein intakes (2.3"),
        low: 2.3,
        high: 3.1,
        unit: "g",
        per: "day",
        label: "protein a day while cutting",
      },
      {
        quote: q(P.protein, "General recommendations are 0.25 g of a high-quality protein per kg of body weight"),
        low: 0.25,
        unit: "g",
        per: "meal",
        label: "protein a meal",
      },
    ],
    plantBased: [
      q(P.vegan, "Supplemental protein might be of interest to vegan athletes"),
      q(P.vegan, "Recent evidence also suggests like-for-like responses when comparing supplemental plant and dairy proteins"),
    ],
  },
  {
    id: "caffeine",
    label: "Caffeine",
    aliases: /\bcaffeine\b|\bcaffeinated\b/,
    reviewNames: ["Caffeine"],
    verdict: [q(P.caffeine, "Caffeine has consistently been shown to improve exercise performance")],
    what: [
      q(P.caffeine, "Caffeine has been shown to be ergogenic for cognitive function"),
      q(P.caffeine, "Caffeine may improve cognitive and physical performance in some individuals under conditions of sleep deprivation."),
    ],
    dose: [
      q(P.caffeine, "Caffeine has consistently been shown to improve exercise performance"),
      q(P.caffeine, "Minimal effective doses of caffeine currently remain unclear but they may be as low as 2 mg/kg"),
    ],
    timing: [q(P.caffeine, "The most commonly used timing of caffeine supplementation is 60 min pre-exercise.")],
    safety: [
      q(P.caffeine, "Very high doses of caffeine (e.g. 9 mg/kg) are associated with a high incidence of side-effects"),
      q(P.caffeine, "Inter-individual differences in sport and exercise performance as well as adverse effects on sleep"),
      q(P.caffeine, "Specifically, the use of caffeine needs to be balanced with the associated side-effects"),
      q(P.creatineQA2, "Short-term creatine and caffeine ingestion"),
    ],
    perKg: [
      {
        quote: q(P.caffeine, "Caffeine has consistently been shown to improve exercise performance"),
        low: 3,
        high: 6,
        unit: "mg",
        per: "dose",
        label: "caffeine before training",
      },
    ],
  },
  {
    id: "coffee",
    label: "Coffee",
    aliases: /\bcoffee\b|\bespresso\b|\bcold brew\b/,
    reviewNames: [],
    verdict: [q(P.coffee, "Coffee and/or its components improve performance across a temporal range")],
    what: [q(P.coffee, "Coffee’s constituents, including but not limited to caffeine, have neuromuscular")],
    dose: [q(P.coffee, "Optimal dosing and timing is approximately two to four cups")],
    timing: [],
    safety: [q(P.coffee, "Coffee has a history of controversy regarding side effects but is generally considered safe")],
    perKg: [
      {
        quote: q(P.coffee, "Optimal dosing and timing is approximately two to four cups"),
        low: 3,
        high: 6,
        unit: "mg",
        per: "dose",
        label: "caffeine from coffee",
      },
    ],
  },
  {
    id: "beta-alanine",
    label: "Beta-alanine",
    aliases: /\bbeta[- ]?alanine\b|β-alanine|ß-alanine/,
    reviewNames: ["ß-alanine", "β-alanine"],
    verdict: [q(P.betaAlanine, "A meta-analysis on beta-alanine supplementation indicated that supplementation improved exercise capacity")],
    what: [q(P.betaAlanine, "As the rate-limiting precursor to carnosine synthesis, beta-alanine supplementation has been shown")],
    dose: [
      q(P.betaAlanine, "To date, research suggests that beta-alanine requires a chronic loading dose of 4 to 6 g daily"),
      q(P.betaAlanine, "Doses of 4 to 6 g/day of beta-alanine have been shown to increase muscle carnosine"),
    ],
    timing: [],
    safety: [
      q(P.betaAlanine, "Single large boluses of beta-alanine have been shown to induce paraesthesia"),
      q(P.betaAlanine, "Current, although limited information, suggests that beta-alanine is safe in healthy individuals"),
    ],
    plantBased: [q(P.vegan, "Further, it was suggested here that creatine and")],
  },
  {
    id: "hmb",
    label: "HMB (β-hydroxy β-methylbutyrate)",
    aliases: /\bhmb\b|hydroxy[- ]?(beta[- ]?)?methylbutyrate/,
    reviewNames: ["β-hydroxy β-methylbutyrate (HMB)"],
    verdict: [q(P.hmb, "8. HMB may improve strength and power in untrained individuals")],
    what: [
      q(P.hmb, "5. HMB may help reduce muscle damage and promote muscle recovery"),
      q(P.hmb, "7. Daily HMB supplementation (38 mg/kg body weight)"),
    ],
    dose: [
      q(P.hmb, "7. Daily HMB supplementation (38 mg/kg body weight)"),
      q(P.hmb, "Clinical study results show that a 3 g dose of HMB induces"),
    ],
    timing: [],
    safety: [q(P.hmb, "In summary, the available data suggests that long-term oral HMB supplementation")],
    perKg: [
      { quote: q(P.hmb, "7. Daily HMB supplementation (38 mg/kg body weight)"), low: 38, unit: "mg", per: "day", label: "HMB a day" },
    ],
  },
  {
    id: "omega-3",
    label: "Omega-3 (fish oil: EPA and DHA)",
    aliases: /\bomega[- ]?3s?\b|\bfish oil\b|\bepa\b|\bdha\b|\bkrill\b|\balga(e|l) oil\b|ω-3/,
    reviewNames: [],
    verdict: [q(P.omega3, "Athletes may be at a higher risk for")],
    what: [
      q(P.omega3, "ω-3 PUFA supplementation, particularly eicosapentaenoic acid (EPA) and docosahexaenoic acid (DHA), has been shown to enhance endurance"),
      q(P.omega3, "ω-3 PUFA supplementation may decrease subjective measures of muscle soreness"),
      q(P.omega3, "ω-3 PUFA supplementation may not confer a muscle hypertrophic benefit in young adults."),
      q(P.omega3, "ω-3 PUFA supplementation is associated with improved sleep quality."),
    ],
    dose: [
      q(P.omega3, "To raise the O3i from the observed values to the target value of 8%"),
      q(P.omega3, "Standard fish oils typically contain 180 mg of EPA and 120 mg of DHA per 1,000 mg"),
    ],
    timing: [],
    safety: [],
    foodFirst: [q(P.omega3, "The most effective way to consume sufficient amounts of ω-3 PUFAs is by eating oily fish")],
    plantBased: [q(P.vegan, "Microalgae oil is rich in DHA")],
  },
  {
    id: "sodium-bicarbonate",
    label: "Sodium bicarbonate",
    aliases: /\b(sodium )?bicarbonate\b|\bbaking soda\b|\bbicarb\b/,
    reviewNames: ["Sodium bicarbonate"],
    verdict: [q(P.bicarb, "The ergogenic effects of sodium bicarbonate are mostly established for exercise tasks of high-intensity")],
    what: [q(P.bicarb, "Supplementation with sodium bicarbonate (doses from 0.2 to 0.5 g/kg) improves performance")],
    dose: [q(P.bicarb, "The optimal dose of sodium bicarbonate dose")],
    timing: [q(P.bicarb, "For single-dose supplementation protocols, the recommended timing of sodium bicarbonate ingestion")],
    safety: [
      q(P.bicarb, "Higher doses (e.g., 0.4"),
      q(P.bicarb, "Ingesting sodium bicarbonate (i) in smaller doses"),
    ],
    perKg: [
      { quote: q(P.bicarb, "The optimal dose of sodium bicarbonate dose"), low: 0.3, unit: "g", per: "dose", label: "sodium bicarbonate" },
    ],
  },
  {
    id: "energy-drinks",
    label: "Energy drinks and shots",
    aliases: /\benergy (drinks?|shots?)\b|\bred ?bull\b|\bmonster energy\b/,
    reviewNames: [],
    verdict: [q(P.energyDrinks, "Energy drinks can enhance acute aerobic exercise performance")],
    what: [q(P.energyDrinks, "Consuming ED and ES 10-60 minutes before exercise can improve mental focus")],
    dose: [q(P.energyDrinks, "Consuming ED and ES containing at least 3")],
    timing: [],
    safety: [
      // both appear twice in the paper, a character apart; these are the fuller versions
      q(P.energyDrinks, "Adolescents (aged 12 through 18) should exercise caution and seek parental guidance when considering the consumption of ED and ES, particularly in excessive amounts (e.g. >4"),
      q(P.energyDrinks, "Additionally, ED and ES are not recommended for children"),
      q(
        P.energyDrinks,
        "Diabetics and individuals with preexisting cardiovascular, metabolic, hepatorenal, and/or neurologic disease who are taking medications that may be affected by high glycemic load foods, caffeine, and/or other stimulants should exercise caution and consult with their physician prior to consuming ED and ES.",
      ),
      q(P.energyDrinks, "Indiscriminate use of ED or ES"),
    ],
  },
  {
    id: "multivitamin",
    label: "Multivitamins",
    aliases: /\bmulti-?vitamins?\b|\bmultis?\b|\bvitamin (and mineral )?supplements?\b/,
    reviewNames: [],
    verdict: [q(P.review, "Although daily vitamin and mineral supplementation has not been found to improve exercise capacity")],
    what: [],
    dose: [],
    timing: [],
    safety: [q(P.review, "One countering argument against higher doses is the potential for these to interfere")],
  },
  {
    id: "vitamin-d",
    label: "Vitamin D",
    aliases: /\bvitamin d3?\b|\bvit d\b/,
    reviewNames: [],
    verdict: [
      q(P.review, "Vitamin D is often recommended to athletes"),
      q(P.review, "Although direct evidence linking vitamin D with performance is equivocal"),
    ],
    what: [],
    dose: [],
    timing: [],
    safety: [],
    plantBased: [q(P.vegan, "The AND have indicated that attention should be paid to achieving adequacy in vitamin B12")],
  },
  {
    id: "vitamin-b12",
    label: "Vitamin B12",
    aliases: /\b(vitamin )?b-?12\b|\bcobalamin\b/,
    reviewNames: [],
    verdict: [q(P.vegan, "Due to an absence of animal and dairy products, vegans are at an increased risk")],
    what: [q(P.vegan, "Data from the EPIC-Oxford cohort study")],
    dose: [],
    timing: [],
    safety: [],
  },
  {
    id: "probiotics",
    label: "Probiotics",
    aliases: /\bprobiotics?\b/,
    reviewNames: [],
    verdict: [q(P.review, "Probiotics have been shown to reduce the number, duration and severity")],
    what: [],
    dose: [],
    timing: [],
    safety: [q(P.review, "Health benefits of probiotics are strain specific and dose dependent")],
  },
  {
    id: "joint",
    label: "Joint supplements (glucosamine, chondroitin, collagen)",
    aliases: /\bglucosamine\b|\bchondroitin\b|\bcollagen\b|\bjoint supplements?\b/,
    reviewNames: [],
    verdict: [
      q(P.review, "Glucosamine and chondroitin have been reported to slow cartilage degeneration"),
      q(P.review, "Meanwhile, other ingredients including undenatured type II collagen"),
    ],
    what: [],
    dose: [],
    timing: [],
    safety: [],
  },
];

/** What people call a supplement → its heading in the ISSN review. */
const CATALOGUE_ALIASES: Array<[RegExp, string]> = [
  [/\bbcaas?\b|branched[- ]chain/, "Branched chain amino acids (BCAA)"],
  [/\beaas?\b|essential amino/, "Essential amino acids (EAA)"],
  [/\bglutamine\b/, "Glutamine"],
  [/\bcitrulline\b/, "Citrulline"],
  [/\bnitrates?\b|\bbeet(root)?( juice)?\b/, "Nitrates"],
  [/\barginine\b/, "Arginine"],
  [/\bcarnitine\b/, "Carnitine"],
  [/\btaurine\b/, "Taurine"],
  [/\bcla\b|conjugated linoleic/, "Conjugated linoleic acids (CLA)"],
  [/\bchromium\b/, "Chromium"],
  [/\bboron\b/, "Boron"],
  [/\bzma\b/, "Zinc/magnesium aspartate (ZMA)"],
  [/\btribulus\b/, "Tribulus terrestris"],
  [/\bd-?aspartic\b|\bdaa\b/, "D-aspartic acid"],
  [/\bfenugreek\b/, "Fenugreek extract"],
  [/\becdyster\w*/, "Ecdysterones"],
  [/\bmct( oil)?\b|medium[- ]chain/, "Medium chain triglycerides"],
  [/\bribose\b/, "Ribose"],
  [/\bglycerol\b/, "Glycerol"],
  [/\bquercetin\b/, "Quercetin"],
  [/\bsodium phosphate\b/, "Sodium phosphate"],
  [/\bsports? drinks?\b|\belectrolytes?\b/, "Water and sports drinks"],
  [/\bprohormones?\b|\bsteroids?\b|\bsarms?\b/, "Prohormones and anabolic steroids"],
  [/\bisoflavones?\b/, "Isoflavones"],
  [/\bphosphatidic acid\b/, "Phosphatidic acid"],
  [/\bagmatine\b/, "Agmatine sulfate"],
  [/\binosine\b/, "Inosine"],
  [/\bvanad\w*/, "Vanadyl sulfate (vanadium)"],
];

/** Groups people buy as one product. */
const GROUPS: Record<string, { label: string; aliases: RegExp; cards: string[]; catalogue: string[] }> = {
  "pre-workout": {
    label: "Pre-workout",
    aliases: /\bpre[- ]?workouts?\b|\bpwo\b/,
    cards: ["caffeine", "beta-alanine", "creatine"],
    catalogue: ["Citrulline", "Nitrates"],
  },
  "test-boosters": {
    label: "Testosterone boosters",
    aliases: /\btest(osterone)?[- ]?boosters?\b|\b(boost|increase|raise) (my )?testosterone\b/,
    cards: [],
    catalogue: ["Tribulus terrestris", "D-aspartic acid", "Fenugreek extract", "Zinc/magnesium aspartate (ZMA)", "Boron"],
  },
  "fat-burners": {
    label: "Fat burners",
    aliases: /\bfat[- ]?burn(er|ers|ing)?\b|\bthermogenics?\b|\bweight[- ]loss (pills?|supplements?)\b/,
    cards: ["caffeine"],
    catalogue: ["Carnitine", "Conjugated linoleic acids (CLA)", "Chromium"],
  },
};

/** Popular supplements the library has nothing on — said plainly, never guessed at. */
const NOT_COVERED =
  /\b(ashwagandha|shilajit|melatonin|magnesium|l-?theanine|turmeric|curcumin|ginseng|maca|spirulina|chlorella|apple cider vinegar|biotin|tongkat|safed musli|moringa|ginkgo|kratom|cbd|zinc|iron|calcium|vitamin c|vitamin e|vitamin k|iodine|selenium|nmn|resveratrol|glutathione)\b/;

// ── reading the question ─────────────────────────────────────────────

export type SupplementGoal = "muscle" | "performance" | "fat-loss" | "health";

export type SupplementAsk =
  | { kind: "overview"; goal: SupplementGoal | null; plantBased: boolean }
  | { kind: "card"; id: string; aspect: Aspect }
  | { kind: "catalogue"; name: string; aspect: Aspect }
  | { kind: "group"; id: string }
  | { kind: "not-covered"; name: string };

const SUPPLEMENT_WORD = /\b(supplements?|supps?|stack|ergogenic aids?|what (should|do) i take)\b/;

export function goalIn(text: string): SupplementGoal | null {
  if (/\b(fat loss|lose (fat|weight)|losing (fat|weight)|weight loss|cut(ting)?|shred\w*|lean(er)? out|burn fat)\b/.test(text)) return "fat-loss";
  if (/\b(endurance|running|runners?|marathon|cycling|cyclists?|stamina|cardio|sports?|athletes?|performance|football|cricket|boxing|mma|swim\w*|sprint\w*)\b/.test(text)) return "performance";
  if (/\b(muscle|bulk\w*|mass|size|gains?|strength|strong(er)?|hypertroph\w*|build)\b/.test(text)) return "muscle";
  if (/\b(health|healthy|immune|immunity|general|wellness|joints?|longevity)\b/.test(text)) return "health";
  return null;
}

export const plantBasedIn = (text: string) => /\b(vegan|vegetarian|veggie|plant[- ]based|jain|eggetarian|no meat|don'?t eat meat)\b/.test(text);

export function aspectIn(text: string): Aspect {
  if (/\b(safe|safety|side ?effects?|harm\w*|danger\w*|risks?|kidneys?|liver|hair( loss)?|bald\w*|bloat\w*|water retention|acne|heart|cancer)\b/.test(text)) return "safety";
  if (/\b(how much|how many|dose|dosage|dosing|grams?|mg|scoops?|loading|load|per day|a day|daily)\b/.test(text)) return "dose";
  if (/\b(when|timing|before|after|morning|night|bedtime|pre|post|empty stomach)\b/.test(text)) return "timing";
  return "verdict";
}

export function readSupplementAsk(message: string): SupplementAsk | null {
  const text = message.toLowerCase().replace(/[’‘]/g, "'");
  for (const [id, g] of Object.entries(GROUPS)) if (g.aliases.test(text)) return { kind: "group", id };
  const card = CARDS.find((c) => c.aliases.test(text));
  if (card) return { kind: "card", id: card.id, aspect: aspectIn(text) };
  const cat = CATALOGUE_ALIASES.find(([re]) => re.test(text));
  if (cat) return { kind: "catalogue", name: cat[1], aspect: aspectIn(text) };
  const missing = text.match(NOT_COVERED);
  if (missing) return { kind: "not-covered", name: missing[1] };
  if (SUPPLEMENT_WORD.test(text)) return { kind: "overview", goal: goalIn(text), plantBased: plantBasedIn(text) };
  return null;
}

// ── the library, indexed ─────────────────────────────────────────────

export type Tier = "strong" | "mixed" | "none";
export interface CatalogueEntry {
  name: string;
  muscle?: Tier;
  performance?: Tier;
  passages: number[];
}

interface Library {
  kb: Pick<KbFile, "sources" | "passages">;
  bySource: Map<string, number>;
  catalogue: CatalogueEntry[];
}

let library: Library | null = null;

const tierOf = (heading: string): Tier | null =>
  /^strong evidence/i.test(heading) ? "strong" : /^limited or mixed/i.test(heading) ? "mixed" : /^little to no/i.test(heading) ? "none" : null;

/** The review's headings, read as "domain › tier › supplement". */
export function parseCatalogue(kb: Pick<KbFile, "sources" | "passages">): CatalogueEntry[] {
  const review = kb.sources.findIndex((s) => s.id === P.review);
  const entries = new Map<string, CatalogueEntry>();
  let domain: "muscle" | "performance" | null = null;
  kb.passages.forEach((p, i) => {
    if (p.source !== review) return;
    const parts = p.section.split(" › ");
    if (parts.includes("Muscle building supplements")) domain = "muscle";
    if (parts.includes("Performance enhancement supplements")) domain = "performance";
    if (parts.includes("Supplements to promote general health")) domain = null;
    const tierAt = parts.findIndex((x) => tierOf(x));
    if (!domain || tierAt < 0 || tierAt === parts.length - 1) return;
    const name = parts[parts.length - 1];
    const e = entries.get(name) ?? { name, passages: [] };
    e[domain] = tierOf(parts[tierAt])!;
    e.passages.push(i);
    entries.set(name, e);
  });
  return [...entries.values()];
}

export function useLibrary(kb: Pick<KbFile, "sources" | "passages">): Library {
  if (library?.kb === kb) return library;
  library = { kb, bySource: new Map(kb.sources.map((s, i) => [s.id, i])), catalogue: parseCatalogue(kb) };
  return library;
}

export function findQuote(lib: Library, ref: QuoteRef): string | null {
  const src = lib.bySource.get(ref.src);
  if (src == null) return null;
  for (const p of lib.kb.passages) {
    if (p.source !== src) continue;
    const s = p.sentences.find((x) => x.startsWith(ref.starts));
    if (s) return s;
  }
  return null;
}

export function catalogueEntry(lib: Library, name: string): CatalogueEntry | undefined {
  const n = name.toLowerCase();
  return lib.catalogue.find((e) => e.name.toLowerCase() === n || e.name.toLowerCase().startsWith(n));
}

// ── writing the reply ───────────────────────────────────────────────

export interface SupplementContext {
  weightKg: number | null;
  /** Where the weight came from, so the reply can say. */
  weightFrom: "log" | "message" | null;
  plantBased: boolean;
  goal: SupplementGoal | null;
  /** Under 18, from the Fuel profile. */
  minor: boolean;
  proteinTargetG: number | null;
}

/** Collects citations in order of first use, so [1] is the first paper quoted. */
class Quoter {
  private order: KbSource[] = [];
  constructor(private lib: Library) {}

  cite(src: string): number {
    const source = this.lib.kb.sources[this.lib.bySource.get(src)!];
    let n = this.order.indexOf(source);
    if (n < 0) n = this.order.push(source) - 1;
    return n + 1;
  }

  /** A full quoted sentence with its citation, or null if the library doesn't have it. */
  line(ref: QuoteRef): string | null {
    const s = findQuote(this.lib, ref);
    if (!s) return null;
    // "7. Daily HMB…" — the paper's own list numbering means nothing here
    return `${s.replace(/^\(?\d+[.)]\s+/, "")} [${this.cite(ref.src)}]`;
  }

  bullets(refs: QuoteRef[], seen: Set<string>): string[] {
    const out: string[] = [];
    for (const r of refs) {
      const key = `${r.src}|${r.starts}`;
      if (seen.has(key)) continue;
      const l = this.line(r);
      if (l) {
        seen.add(key);
        out.push(`- ${l}`);
      }
    }
    return out;
  }

  sources(): string[] {
    const citations: Citation[] = this.order.map((source, i) => ({ n: i + 1, source }));
    return ["", "### Sources", ...sourceLines(citations)];
  }
}

const TIER_TEXT: Record<Tier, string> = {
  strong: "**strong evidence, apparently safe**",
  mixed: "**limited or mixed evidence**",
  none: "**little to no evidence**",
};

function tierLine(entry: CatalogueEntry | undefined, quoter: Quoter): string | null {
  if (!entry) return null;
  const parts: string[] = [];
  if (entry.muscle) parts.push(`${TIER_TEXT[entry.muscle]} for building muscle`);
  if (entry.performance) parts.push(`${TIER_TEXT[entry.performance]} for performance`);
  if (!parts.length) return null;
  return `The ISSN's evidence review rates it ${parts.join(", and ")} [${quoter.cite(P.review)}].`;
}

function bestTier(entry: CatalogueEntry | undefined): Tier | null {
  if (!entry) return null;
  const tiers = [entry.muscle, entry.performance].filter(Boolean) as Tier[];
  return tiers.includes("strong") ? "strong" : tiers.includes("mixed") ? "mixed" : tiers.includes("none") ? "none" : null;
}

const BOTTOM: Record<Tier, QuoteRef> = {
  strong: q(P.review, "Following this, we suggest that they generally only recommend supplements in category I"),
  mixed: q(P.review, "If an athlete is interested in trying supplements in category II"),
  none: q(P.review, "Obviously, the ISSN does not support athletes taking supplements in category III"),
};

const fmtAmount = (v: number, unit: "mg" | "g") =>
  unit === "mg" ? `${Math.round(v / 5) * 5} mg` : v >= 20 ? `${Math.round(v)} g` : `${Math.round(v * 10) / 10} g`;

/** "0.1 g/kg × your 72 kg ≈ 7.2 g creatine a day". */
export function personalDose(d: PerKg, weightKg: number): string {
  const range = d.high != null ? `${d.low}–${d.high}` : `${d.low}`;
  const amount = d.high != null ? `${fmtAmount(d.low * weightKg, d.unit).replace(/ (mg|g)$/, "")}–${fmtAmount(d.high * weightKg, d.unit)}` : fmtAmount(d.low * weightKg, d.unit);
  return `${range} ${d.unit}/kg × your ${Math.round(weightKg * 10) / 10} kg ≈ **${amount}** ${d.label}`;
}

function personalLines(card: SupplementCard, ctx: SupplementContext, quoter: Quoter): string[] {
  const lines: string[] = [];
  if (!card.perKg?.length) return lines;
  if (!ctx.weightKg) return [`- *Tell me your weight (e.g. "I weigh 70 kg") and I'll work these out for you.*`];
  const cutting = ctx.goal === "fat-loss";
  for (const d of card.perKg) {
    if (card.id === "protein" && /cutting/.test(d.label) !== cutting && /a day/.test(d.label)) continue;
    lines.push(`- For you: ${personalDose(d, ctx.weightKg)} [${quoter.cite(d.quote.src)}]`);
  }
  if (ctx.weightFrom === "log") lines.push("- *Using your latest weigh-in from Fuel.*");
  if (card.id === "protein" && ctx.proteinTargetG) lines.push(`- Your Fuel target is **${Math.round(ctx.proteinTargetG)} g** protein a day.`);
  return lines;
}

const SAFETY_NOTE =
  "*Check with a doctor first if you take medication, are pregnant, or have a heart, kidney or liver condition — and buy products tested by a third party for what's on the label.*";

/** One supplement, in depth. The question's focus (dose, safety, timing) goes first. */
export function cardReply(card: SupplementCard, aspect: Aspect, ctx: SupplementContext, kb: Pick<KbFile, "sources" | "passages">): string {
  const lib = useLibrary(kb);
  const quoter = new Quoter(lib);
  const seen = new Set<string>();
  const entry = card.reviewNames.map((n) => catalogueEntry(lib, n)).find(Boolean);
  const out: string[] = [`### ${card.label}`];

  const tier = tierLine(entry, quoter);
  const verdict = quoter.bullets(card.verdict, seen);
  out.push("", "**Verdict**");
  if (tier) out.push(`- ${tier}`);
  out.push(...verdict);

  const sections: Array<[Aspect | "what", string, string[]]> = [
    ["what", "What it does", quoter.bullets(card.what, seen)],
    ["dose", "How much", [...quoter.bullets(card.dose, seen), ...personalLines(card, ctx, quoter)]],
    ["timing", "When", quoter.bullets(card.timing, seen)],
    ["safety", "Safety", quoter.bullets(card.safety, seen)],
  ];
  // the asked-about aspect right after the verdict
  sections.sort((a, b) => Number(b[0] === aspect) - Number(a[0] === aspect));
  for (const [, title, lines] of sections) if (lines.length) out.push("", `**${title}**`, ...lines);

  const food = card.foodFirst ? quoter.bullets(card.foodFirst, seen) : [];
  if (food.length) out.push("", "**Food first**", ...food);
  const plant = ctx.plantBased && card.plantBased ? quoter.bullets(card.plantBased, seen) : [];
  if (plant.length) out.push("", "**If you're vegetarian or vegan**", ...plant);

  const best = bestTier(entry);
  if (best) {
    const bottom = quoter.line(BOTTOM[best]);
    if (bottom) out.push("", `**Bottom line:** ${bottom}`);
  }
  out.push("", SAFETY_NOTE, ...quoter.sources());
  return out.join("\n");
}

/** Sentences from the review's own paragraphs about one supplement. */
function reviewSentences(lib: Library, entry: CatalogueEntry, max: number): string[] {
  const all = entry.passages.flatMap((i) => lib.kb.passages[i].sentences);
  const score = (s: string) =>
    (/\b(evidence|effective|no (effect|impact|benefit)|not|limited|improve[sd]?|increase[sd]?|reduce[sd]?|appears?|shown|conclude[sd]?|support)\b/i.test(s) ? 2 : 0) +
    (/\b(et al\.|and colleagues|and co-workers|investigated|examined|randomi[sz]ed|participants)\b/i.test(s) ? -2 : 0) +
    (s.length > 320 ? -1 : 0);
  const picked = all
    .map((s, i) => ({ s, i, v: score(s) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i);
  return picked.map((x) => x.s);
}

/** A supplement the review files but no position stand covers. */
export function catalogueReply(name: string, ctx: SupplementContext, kb: Pick<KbFile, "sources" | "passages">): string | null {
  const lib = useLibrary(kb);
  const entry = catalogueEntry(lib, name);
  if (!entry) return null;
  const quoter = new Quoter(lib);
  const n = quoter.cite(P.review);
  const out = [`### ${entry.name}`, "", "**Verdict**", `- ${tierLine(entry, quoter)}`];
  const said = reviewSentences(lib, entry, 3);
  if (said.length) out.push("", "**What the review says**", ...said.map((s) => `- ${s} [${n}]`));
  const best = bestTier(entry);
  if (best) {
    const bottom = quoter.line(BOTTOM[best]);
    if (bottom) out.push("", `**Bottom line:** ${bottom}`);
  }
  out.push("", SAFETY_NOTE, ...quoter.sources());
  return out.join("\n");
}

/** Products sold as a category: what's in them and what each part is worth. */
export function groupReply(id: string, ctx: SupplementContext, kb: Pick<KbFile, "sources" | "passages">): string {
  const lib = useLibrary(kb);
  const quoter = new Quoter(lib);
  const seen = new Set<string>();
  const g = GROUPS[id];
  const out = [`### ${g.label}: what's in them, and what's worth it`];
  for (const cid of g.cards) {
    const card = CARDS.find((c) => c.id === cid)!;
    const entry = card.reviewNames.map((x) => catalogueEntry(lib, x)).find(Boolean);
    out.push("", `**${card.label}**`);
    const t = tierLine(entry, quoter);
    if (t) out.push(`- ${t}`);
    out.push(...quoter.bullets([...card.dose.slice(0, 1), ...card.timing.slice(0, 1)], seen));
    if (ctx.weightKg && card.perKg?.[0]) out.push(`- For you: ${personalDose(card.perKg[0], ctx.weightKg)} [${quoter.cite(card.perKg[0].quote.src)}]`);
  }
  for (const name of g.catalogue) {
    const entry = catalogueEntry(lib, name);
    if (!entry) continue;
    out.push("", `**${entry.name}**`, `- ${tierLine(entry, quoter)}`);
    const s = reviewSentences(lib, entry, 1)[0];
    if (s) out.push(`- ${s} [${quoter.cite(P.review)}]`);
  }
  if (id === "test-boosters") {
    const l = quoter.line(BOTTOM.none);
    if (l) out.push("", `**Bottom line:** ${l}`);
  }
  if (id === "fat-burners") {
    const l = quoter.line(q(P.protein, "Higher protein intakes (2.3"));
    if (l) out.push("", "**What does help in a calorie deficit**", `- ${l}`);
  }
  out.push("", SAFETY_NOTE, ...quoter.sources());
  return out.join("\n");
}

/**
 * "What supplements should I take?" — the strong-evidence picks for the goal,
 * the situational ones, what to skip, and what to check before buying.
 */
export function overviewReply(ctx: SupplementContext, kb: Pick<KbFile, "sources" | "passages">): string {
  const lib = useLibrary(kb);
  const quoter = new Quoter(lib);
  const seen = new Set<string>();
  const goal = ctx.goal ?? "muscle";
  const card = (id: string) => CARDS.find((c) => c.id === id)!;
  const goalText: Record<SupplementGoal, string> = {
    muscle: "building muscle and strength",
    performance: "sport and endurance performance",
    "fat-loss": "losing fat while keeping muscle",
    health: "general health",
  };

  const out = [`### Supplements for ${goalText[goal]}`];
  const rule = quoter.line(BOTTOM.strong);
  if (rule) out.push(`*How these are chosen: ${rule}*`);

  const pick = (id: string, why: string, refs: QuoteRef[]) => {
    const c = card(id);
    const entry = c.reviewNames.map((x) => catalogueEntry(lib, x)).find(Boolean);
    out.push("", `**${c.label}** — ${why}`);
    const t = tierLine(entry, quoter);
    if (t) out.push(`- ${t}`);
    out.push(...quoter.bullets(refs, seen));
    out.push(...personalLines(c, { ...ctx, goal }, quoter).filter((l) => !/Tell me your weight/.test(l)));
  };

  const top: Record<SupplementGoal, Array<[string, string, (c: SupplementCard) => QuoteRef[]]>> = {
    muscle: [
      ["creatine", "the first one to buy", (c) => [c.verdict[0], c.dose[0], c.safety[0]]],
      ["protein", "only if food doesn't get you there", (c) => [c.dose[0], c.timing[0]]],
      ["caffeine", "for harder sessions", (c) => [c.dose[0], c.timing[0], c.safety[0]]],
    ],
    performance: [
      ["caffeine", "the most reliable performance aid", (c) => [c.dose[0], c.timing[0], c.safety[0]]],
      ["creatine", "for repeated hard efforts", (c) => [c.what[1], c.dose[0]]],
      ["beta-alanine", "for efforts of about one to four minutes", (c) => [c.verdict[0], c.dose[0], c.safety[0]]],
      ["sodium-bicarbonate", "for high-intensity efforts, if your stomach tolerates it", (c) => [c.verdict[0], c.dose[0], c.safety[1]]],
    ],
    "fat-loss": [
      ["protein", "keeps muscle while you cut", (c) => [c.dose[1], c.dose[0]]],
      ["creatine", "keeps your strength up in a deficit", (c) => [c.verdict[0], c.dose[0]]],
      ["caffeine", "for energy in training", (c) => [c.dose[0], c.safety[0]]],
    ],
    health: [
      ["omega-3", "if you don't eat oily fish", (c) => [c.verdict[0], c.what[1], ...(c.foodFirst ?? [])]],
      ["vitamin-d", "if you get little sun", (c) => c.verdict],
      ["multivitamin", "as insurance, not a performance aid", (c) => c.verdict],
    ],
  };
  for (const [id, why, refs] of top[goal]) pick(id, why, refs(card(id)));

  if (!ctx.weightKg && goal !== "health") out.push("", `*Tell me your weight (e.g. "I weigh 70 kg") and I'll turn the per-kg doses into amounts for you.*`);

  if (ctx.plantBased) {
    const lines = quoter.bullets(
      [card("beta-alanine").plantBased![0], card("vitamin-b12").verdict[0], card("omega-3").plantBased![0], card("protein").plantBased![1]],
      seen,
    );
    if (lines.length) out.push("", "**If you're vegetarian or vegan**", ...lines);
  }

  if (goal !== "health") {
    const situational = goal === "performance" ? ["omega-3", "hmb"] : ["beta-alanine", "omega-3", "hmb"];
    const lines: string[] = [];
    for (const id of situational) {
      const c = card(id);
      const l = quoter.line(c.verdict[0]);
      if (l) lines.push(`- **${c.label}:** ${l}`);
    }
    if (lines.length) out.push("", "**Situational — only if it fits you**", ...lines);
  }

  const skip = lib.catalogue.filter((e) => bestTier(e) === "none").map((e) => e.name.replace(/\s*\(.*\)$/, ""));
  const mixed = lib.catalogue.filter((e) => bestTier(e) === "mixed").map((e) => e.name.replace(/\s*\(.*\)$/, ""));
  out.push("", "**Skip these**");
  out.push(`- Little to no evidence: ${skip.join(", ")} [${quoter.cite(P.review)}].`);
  out.push(`- Limited or mixed evidence, so optional at best: ${mixed.join(", ")} [${quoter.cite(P.review)}].`);
  const none = quoter.line(BOTTOM.none);
  if (none) out.push(`- ${none}`);

  out.push("", "**Before you buy**");
  const quality = quoter.line(q(P.review, "In Fiscal Year 2017, it was reported that approximately"));
  if (quality) out.push(`- ${quality} Buy products tested by a third party.`);
  if (ctx.minor) {
    const teen = quoter.line(card("energy-drinks").safety[0]);
    if (teen) out.push(`- ${teen}`);
  }
  out.push(`- ${SAFETY_NOTE.replace(/^\*|\*$/g, "")}`);
  out.push("", "Ask me about any one of them — *how much creatine*, *is caffeine safe*, *are BCAAs worth it* — for the full detail.");
  out.push(...quoter.sources());
  return out.join("\n");
}

export function notCoveredReply(name: string, kb: Pick<KbFile, "sources" | "passages">): string {
  const lib = useLibrary(kb);
  const covered = [...CARDS.map((c) => c.label.replace(/\s*\(.*\)$/, "")), ...lib.catalogue.map((e) => e.name.replace(/\s*\(.*\)$/, ""))];
  const unique = [...new Set(covered.map((c) => c.toLowerCase()))].map((l) => covered.find((c) => c.toLowerCase() === l)!);
  return [
    `My research library has nothing on **${name}**, so I won't guess whether it works or how much to take.`,
    "",
    `What it does cover: ${unique.join(", ")}.`,
    "",
    "Ask me about any of those, or *what supplements should I take?* for the shortlist.",
  ].join("\n");
}

/** The reply for a supplement question, whatever kind it is. */
export function supplementReply(ask: SupplementAsk, ctx: SupplementContext, kb: Pick<KbFile, "sources" | "passages">): string {
  switch (ask.kind) {
    case "overview":
      return overviewReply({ ...ctx, goal: ask.goal ?? ctx.goal, plantBased: ask.plantBased || ctx.plantBased }, kb);
    case "card":
      return cardReply(CARDS.find((c) => c.id === ask.id)!, ask.aspect, ctx, kb);
    case "catalogue":
      return catalogueReply(ask.name, ctx, kb) ?? notCoveredReply(ask.name, kb);
    case "group":
      return groupReply(ask.id, ctx, kb);
    case "not-covered":
      return notCoveredReply(ask.name, kb);
  }
}

/** Weight stated in the conversation: "I weigh 72 kg", "I'm 80kg", "my weight is 165 lbs". */
export function weightIn(texts: string[]): number | null {
  for (let i = texts.length - 1; i >= 0; i--) {
    const m = texts[i]
      .toLowerCase()
      .match(/\b(?:i\s*(?:'m|am)|im|my (?:body ?)?weight(?: is)?|weigh(?:ing)?|bodyweight(?: is| of)?)\s*(?:about|around|roughly|~)?\s*(\d{2,3}(?:\.\d)?)\s*(kg|kgs|kilos?|lbs?|pounds)\b/);
    if (m) {
      const v = Number(m[1]) * (/^(lb|pound)/.test(m[2]) ? 0.4536 : 1);
      if (v >= 30 && v <= 250) return Math.round(v * 10) / 10;
    }
  }
  return null;
}
