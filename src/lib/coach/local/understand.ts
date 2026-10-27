import { readFileSync } from "node:fs";
import path from "node:path";
import { MODEL_DIR } from "@/lib/coach/rag/embedder";
import settings from "../../../../shared/coach/retrieval.json";

/**
 * Can the coach tell what was said at all?
 *
 * "asdkjh", "lkj lkj lkj" or a stray keypress should get "what are you trying
 * to ask?", not a confident paragraph about whatever the research library
 * happened to rank first. And "protien" should get "did you mean protein?"
 * rather than nothing.
 *
 * The test is lexical: a word is known if it is in the embedding model's own
 * WordPiece vocabulary (about 22,000 whole English words), in the gym and
 * nutrition vocabulary below, or in the Hinglish people actually type. A
 * message that is mostly unknown words is unclear. Food names the lexicon
 * misses are not a problem in practice — the agent tries the food database
 * before it ever asks this question.
 */

/** Training, nutrition and food words the coach must recognise, and may suggest as corrections. */
const DOMAIN = `
workout workouts training train trained gym exercise exercises set sets rep reps squat squats deadlift deadlifts
bench press overhead ohp row rows pullup pullups chinup chinups pushup pushups dip dips lunge lunges curl curls
plank planks crunch crunches hiit cardio running jogging cycling swimming walking steps stretching stretch mobility
warmup cooldown deload failure volume frequency intensity hypertrophy strength power endurance muscle muscles abs
core chest back lats shoulders delts biceps triceps forearms traps glutes quads hamstrings calves legs arms split
ppl routine program programme plan beginner intermediate advanced dumbbell dumbbells barbell kettlebell machine
cable bodyweight calisthenics recovery rest sleep soreness doms progressive overload pr prs max bulk bulking cut
cutting recomp lean shredded physique bodybuilding powerlifting gains
protein proteins carbs carb carbohydrate carbohydrates fat fats fibre fiber calorie calories kcal cals macros macro
micronutrients vitamin vitamins mineral minerals supplement supplements creatine caffeine coffee whey casein bcaa
bcaas eaa glutamine preworkout electrolytes hydration water diet diets dieting keto ketogenic vegan vegetarian veg
nonveg fasting intermittent deficit surplus maintenance tdee bmr metabolism meal meals snack snacks breakfast lunch
dinner nutrition intake sugar sodium salt omega
roti rotis chapati chapatis chapatti paratha parathas naan rice chawal dal daal dhal rajma chole chana paneer tofu
soya soybean curd dahi yogurt yoghurt lassi chaas buttermilk milk doodh ghee butter egg eggs omelette chicken mutton
fish prawns idli idlis dosa dosas uttapam upma poha khichdi biryani pulao sambar sabzi sabji aloo gobi bhindi palak
methi samosa samosas pakora pakode vada dhokla thepla oats muesli cornflakes bread toast banana bananas apple apples
mango orange papaya guava grapes watermelon dates almonds badam cashews kaju walnuts peanuts peanut sprouts makhana
chikki jaggery gur honey juice tea chai pizza burger pasta noodles maggi sandwich salad nuts seeds quinoa potato
potatoes broccoli spinach
`;

/** Hinglish and chat shorthand — understood, never suggested as a correction. */
const CHAT = `
bhai bro yaar kya kitna kitni kitne kaise kaisa kab kyu kyun kyon kaun khana khaana khaya khaa pina peena chahiye
hai hain ho hoga tha thi mera meri mere mujhe muje tum aap apna aur ya nahi nahin haan accha acha theek thik din roz
subah shaam raat abhi kal aaj wala wali karna karu karun karo kar se ke ka ki ko me mein par bhi toh sirf bahut
zyada kam thoda
u ur r pls plz thx ty k ok okay bruh lol lmao idk wanna gonna gotta wat wht hw abt coz cuz bcoz nd n y hmm hm
`;

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const DOMAIN_WORDS = words(DOMAIN);

let lexicon: Set<string> | null = null;

function loadLexicon(): Set<string> {
  if (lexicon) return lexicon;
  const set = new Set<string>([...DOMAIN_WORDS, ...words(CHAT), ...settings.stopwords]);
  for (const [, expansion] of settings.gymTerms as Array<[string, string]>) {
    for (const w of expansion.split(/[^a-z]+/)) if (w) set.add(w);
  }
  try {
    const vocab = readFileSync(path.join(MODEL_DIR, "vocab.txt"), "utf8");
    for (const line of vocab.split("\n")) {
      const w = line.trim();
      // whole words only: no "##ing" pieces, no [unused] slots, no one-letter tokens
      if (/^[a-z]{2,}$/.test(w)) set.add(w);
    }
  } catch (err) {
    // Without the vocabulary the domain lists still work; the check just gets
    // stricter about everyday words, which errs towards asking.
    console.warn("[coach] vocabulary unavailable for the clarity check:", err);
  }
  lexicon = set;
  return set;
}

/** Plural, past and -ing forms of a known word count as known. */
function variants(w: string): string[] {
  const out = [w];
  if (w.endsWith("ies")) out.push(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) out.push(w.slice(0, -2));
  if (w.endsWith("s")) out.push(w.slice(0, -1));
  if (w.endsWith("ed")) out.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith("ing")) out.push(w.slice(0, -3), `${w.slice(0, -3)}e`);
  if (w.endsWith("ly")) out.push(w.slice(0, -2));
  // "sooo", "pleeease"
  const squeezed = w.replace(/(.)\1{2,}/g, "$1");
  if (squeezed !== w) out.push(squeezed, w.replace(/(.)\1{2,}/g, "$1$1"));
  return out;
}

export function isKnownWord(w: string): boolean {
  const lex = loadLexicon();
  if (w.length === 1) return w === "a" || w === "i";
  return variants(w).some((v) => lex.has(v));
}

/**
 * Optimal string alignment distance: Levenshtein plus adjacent swaps, so
 * "protien" is one edit from "protein", not two.
 */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** The gym or nutrition word an unknown word was probably meant to be — only when exactly one is close. */
export function suggestWord(w: string): string | null {
  if (w.length < 4) return null;
  const budget = w.length >= 7 ? 2 : 1;
  let best: string | null = null;
  let bestD = budget + 1;
  let tie = false;
  for (const cand of DOMAIN_WORDS) {
    if (Math.abs(cand.length - w.length) > budget) continue;
    const dist = editDistance(w, cand);
    if (dist < bestD) {
      best = cand;
      bestD = dist;
      tie = false;
    } else if (dist === bestD && cand !== best) {
      tie = true;
    }
  }
  return best && !tie ? best : null;
}

export interface Clarity {
  /** Too little of the message is recognisable to answer it. */
  unclear: boolean;
  /** Typed in a script the coach cannot read (Devanagari, say). */
  otherScript: boolean;
  unknown: string[];
  /** unknown word → likely intended word */
  suggestions: Record<string, string>;
  /** The message with every confident correction applied. */
  corrected: string;
}

export function assessClarity(message: string): Clarity {
  const lower = message.toLowerCase().replace(/[’‘]/g, "'");
  const tokens = (lower.match(/[a-z]+(?:'[a-z]+)?/g) ?? []).map((t) => t.replace(/'(s|t|re|ve|ll|d|m)$/, ""));
  const otherScript = tokens.length === 0 && /\p{L}/u.test(message);

  const unknown = [...new Set(tokens.filter((t) => !isKnownWord(t)))];
  const suggestions: Record<string, string> = {};
  for (const u of unknown) {
    const s = suggestWord(u);
    if (s) suggestions[u] = s;
  }

  const unknownCount = tokens.filter((t) => !isKnownWord(t)).length;
  const ratio = tokens.length ? unknownCount / tokens.length : 1;
  // Nothing readable at all; mostly unreadable; or a one- or two-word message
  // with a word nobody can place. Longer messages get the benefit of the
  // doubt — one odd word in a real sentence is a typo or a name.
  const unclear = tokens.length === 0 || ratio >= 0.6 || (tokens.length <= 2 && unknownCount >= 1);

  let corrected = message;
  for (const [from, to] of Object.entries(suggestions)) {
    corrected = corrected.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
  }

  return { unclear, otherScript, unknown, suggestions, corrected };
}
