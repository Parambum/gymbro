/**
 * Food search ranking (§6).
 *
 * The database lookup is deliberately dumb — a text index plus a regex, which
 * Mongo is good at — and all the judgement happens here, in memory, on a
 * capped candidate pool. That split is what makes typo tolerance possible at
 * all: "panner" does not regex-match "paneer", so no query can find it, but a
 * bounded edit distance can.
 *
 * Ranking order, from the spec: what you log often → what you logged recently
 * → verified data → how well the text actually matches. A food you eat every
 * morning should be the first row before you finish the second letter.
 *
 * Pure, so it is tested without a database.
 */

export interface SearchCandidate {
  id: string;
  name: string;
  brand?: string | null;
  /** name + aliases, lower-cased, as stored on the document */
  searchText: string;
  aliases?: string[];
  isVerified?: boolean;
  /** how often this food is logged across all users */
  popularity?: number;
}

export interface RankContext {
  /** Food ids the user logs most often, most-logged first. */
  frequentIds?: string[];
  /** Food ids the user logged most recently, newest first. */
  recentIds?: string[];
  /** Food ids the user saved as favourites. */
  favoriteIds?: string[];
}

export interface RankedFood<T extends SearchCandidate> {
  food: T;
  score: number;
  /** Why this row is here — the UI badges "often" and "recent". */
  reason: "frequent" | "recent" | "favorite" | "match";
}

/**
 * Fold to a comparable form: lower case, strip accents, drop punctuation.
 * "Dal (toor, cooked)" and "dal toor cooked" have to land in the same place.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(" ") : [];
}

/**
 * Levenshtein distance, abandoned as soon as it exceeds `max`.
 *
 * The early exit matters: this runs over every candidate token for every
 * query token on each keystroke, and the answer "further away than 2" is all
 * the caller ever needs.
 */
export function editDistanceWithin(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1; // no path back under the budget
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * How well one query token matches one candidate token, 0..1.
 *
 * The edit-distance budget scales with length because a one-character slip in
 * "dal" changes the word entirely, while one in "cauliflower" is a typo.
 */
function tokenScore(query: string, candidate: string): number {
  if (query === candidate) return 1;
  if (candidate.startsWith(query)) return query.length >= 2 ? 0.85 : 0.6;

  // A substring buried mid-word is usually a coincidence, not a match:
  // "classic".includes("lassi") is true, and that put an Arby's sandwich at
  // the top of a search for lassi. Scored well below a prefix so it can only
  // win when nothing better exists.
  if (candidate.includes(query)) return query.length >= 4 ? 0.4 : 0.2;

  const budget = query.length >= 6 ? 2 : query.length >= 4 ? 1 : 0;
  if (budget > 0) {
    const d = editDistanceWithin(query, candidate, budget);
    if (d <= budget) return 0.55 - (d - 1) * 0.15;
  }
  return 0;
}

/**
 * Text-match quality for a whole query, 0..1.
 *
 * Every query token has to find *something* — "chicken biryani" must not
 * match plain "chicken" as strongly as it matches the biryani. A token that
 * matches nothing at all disqualifies the candidate outright.
 */
export function matchScore(query: string, candidate: SearchCandidate): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;

  const haystack = normalize(
    [candidate.name, candidate.brand ?? "", ...(candidate.aliases ?? [])].join(" "),
  );
  const cTokens = haystack.split(" ").filter(Boolean);
  if (cTokens.length === 0) return 0;

  let total = 0;
  for (const q of qTokens) {
    let best = 0;
    for (const c of cTokens) {
      const s = tokenScore(q, c);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (best === 0) return 0; // an unmatched token kills the candidate
    total += best;
  }

  let score = total / qTokens.length;

  // A whole-name hit beats a scattered one: "milk" should rank plain milk
  // above "Sweet Lassi (yogurt drink)" that merely mentions it.
  const name = normalize(candidate.name);
  const q = normalize(query);
  if (name === q) score += 0.5;
  else if (name.startsWith(q)) score += 0.25;

  // Prefer the base food over an elaborate variant. With 13,000 rows, an
  // alias like "chawal" is attached to every rice entry, and without this the
  // winner is arbitrary — "Baby Toddler cereal, rice, dry" beat plain rice.
  // Someone searching a bare ingredient almost always wants the simple one.
  const wordCount = name.split(" ").length;
  score -= Math.min(wordCount, 10) * 0.03;

  return score;
}

const FREQUENT_BONUS = 60;
const RECENT_BONUS = 40;
const FAVORITE_BONUS = 50;
const VERIFIED_BONUS = 8;

/**
 * Rank a candidate pool for a query.
 *
 * With an empty query this is the "before you type anything" list: your
 * favourites and the things you always eat, which is how a repeat meal gets
 * logged in three taps.
 */
export function rankFoods<T extends SearchCandidate>(
  query: string,
  candidates: T[],
  ctx: RankContext = {},
  limit = 25,
): Array<RankedFood<T>> {
  const frequent = new Map((ctx.frequentIds ?? []).map((id, i) => [id, i]));
  const recent = new Map((ctx.recentIds ?? []).map((id, i) => [id, i]));
  const favorite = new Set(ctx.favoriteIds ?? []);
  const hasQuery = tokenize(query).length > 0;

  const ranked: Array<RankedFood<T>> = [];

  for (const food of candidates) {
    const text = hasQuery ? matchScore(query, food) : 0;
    if (hasQuery && text === 0) continue;

    const freqRank = frequent.get(food.id);
    const recRank = recent.get(food.id);
    const isFav = favorite.has(food.id);

    // Personal history decays down the list: your top food outranks your
    // tenth, but both outrank a stranger's popular one.
    let score = text * 100;
    if (freqRank != null) score += FREQUENT_BONUS / (1 + freqRank * 0.5);
    if (recRank != null) score += RECENT_BONUS / (1 + recRank * 0.5);
    if (isFav) score += FAVORITE_BONUS;
    if (food.isVerified) score += VERIFIED_BONUS;
    score += Math.min(food.popularity ?? 0, 50) * 0.1;

    // With no query at all, only personal rows are worth showing.
    if (!hasQuery && freqRank == null && recRank == null && !isFav) continue;

    const reason: RankedFood<T>["reason"] =
      isFav && !hasQuery ? "favorite" : freqRank != null ? "frequent" : recRank != null ? "recent" : "match";

    ranked.push({ food, score, reason });
  }

  ranked.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return ranked.slice(0, limit);
}
