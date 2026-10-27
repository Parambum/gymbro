import { Types } from "mongoose";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { rankFoods } from "@/lib/fuel/search";
import { entryMacrosFor } from "@/lib/fuel/log";
import { candidatePool, toCandidate, visibleTo, type Visible } from "@/lib/fuel/food-pool";
import { gramsFor, parsePhrase, servesIn, splitMeal, type Phrase } from "@/lib/fuel/describe";
import type { DraftedItem } from "@/lib/fuel/ai/match";
import type { MacroTotals } from "@/lib/fuel/types";

/**
 * A described meal -> a draft, with no model and no key.
 *
 * Each phrase is searched exactly as if the user had typed it into the search
 * box, and its amount is read against that food's own household portions. The
 * result has the same shape as the AI path's draft, so it lands in the same
 * check-before-saving sheet. Anything that does not find a convincing match is
 * listed as unclear rather than guessed at.
 *
 * The coach's food lookups (lib/coach/local/food.ts) use the same matcher, so
 * "2 roti and dal" means the same food in the chat as in Fuel.
 */

/** Below this the ranker's best guess isn't a match (same floor as ai/match.ts). */
const MATCH_FLOOR = 55;
const MAX_PHRASES = 12;
/** How many close matches to consider when the stated unit has to fit. */
const SHORTLIST = 8;

export type FoodCandidate = ReturnType<typeof toCandidate>;

export interface PhraseMatch {
  phrase: Phrase;
  food: FoodCandidate;
  /** The ranker's score — how sure the *match* is, not a nutrition claim. */
  score: number;
  portions: Array<{ id: string; label: string; grams: number; isDefault: boolean }>;
  grams: number;
  /** "2 × 1 medium (182 g)", or "150 g" for a stated weight. */
  portion: string;
  macros: MacroTotals;
}

/**
 * How the coach narrows a match further than the search box does. Fuel's own
 * parser passes none of these and behaves exactly as before.
 */
export interface MatchOptions {
  /** An extra test a ranked food must pass — the coach is stricter, because nobody asked it to search ("car" must not come back as carrots). */
  accept?: (query: string, food: FoodCandidate) => boolean;
  /** Reorder the shortlist before the first that fits the unit is taken. */
  rerank?: <R extends { score: number; food: FoodCandidate }>(query: string, ranked: R[]) => R[];
  /** A reviewed food for this exact query, by name — put first when it exists. */
  pinned?: (query: string) => string | null;
  /** How many ranked foods to choose among. */
  shortlist?: number;
}

export async function matchDescription(
  text: string,
  visible: Visible,
  opts: MatchOptions = {},
): Promise<{ matches: PhraseMatch[]; unclear: string[] }> {
  const accept = opts.accept ?? (() => true);
  const phrases = splitMeal(text)
    .map(parsePhrase)
    .filter((p) => p.query.length > 0)
    .slice(0, MAX_PHRASES);

  const matches: PhraseMatch[] = [];
  const unclear: string[] = [];

  for (const p of phrases) {
    const { pool } = await candidatePool(p.query, visible);
    let ranked = rankFoods(p.query, pool.map(toCandidate), {}, opts.shortlist ?? SHORTLIST).filter(
      (r) => r.score >= MATCH_FLOOR && accept(p.query, r.food),
    );
    if (opts.rerank) ranked = opts.rerank(p.query, ranked);

    // A pinned food is looked up by name rather than hoped for in the pool:
    // the text index returns 60 matches in no useful order, and "Apple, raw"
    // is not reliably among the first 60 rows that say "apple".
    const pinnedName = opts.pinned?.(p.query);
    if (pinnedName) {
      const doc = await FuelFood.findOne({ name: pinnedName, ownerUserId: null, isVerified: true }).lean();
      if (doc) {
        const food = toCandidate(doc as unknown as Record<string, unknown>);
        ranked = [{ food, score: Math.max(100, ranked[0]?.score ?? 0), reason: "match" as const }, ...ranked.filter((r) => r.food.id !== food.id)];
      }
    }

    if (ranked.length === 0) {
      unclear.push(p.raw);
      continue;
    }

    // Among close matches, take the best one that comes in the unit the
    // phrase used — "ek glass doodh" is milk, not Doodh biscuits.
    const allPortions = await FuelPortion.find({
      foodId: { $in: ranked.map((r) => new Types.ObjectId(r.food.id)) },
    })
      .sort({ sortOrder: 1 })
      .lean();
    const portionsOf = (id: string) =>
      allPortions
        .filter((x) => String(x.foodId) === id)
        .map((x) => ({ id: String(x._id), label: x.label, grams: x.grams, isDefault: Boolean(x.isDefault) }));
    const best = ranked.find((r) => servesIn(p, portionsOf(r.food.id))) ?? ranked[0];

    const portions = portionsOf(best.food.id);
    const { grams, portion } = gramsFor(p, portions);
    matches.push({
      phrase: p,
      food: best.food,
      score: best.score,
      portions,
      grams,
      portion,
      macros: entryMacrosFor(best.food.per100g, grams),
    });
  }

  return { matches, unclear };
}

export async function draftFromDescription(
  text: string,
  userId: string,
): Promise<{ items: DraftedItem[]; plateNotes: string; unclear: string[] }> {
  const { matches, unclear } = await matchDescription(text, visibleTo(userId));

  const items: DraftedItem[] = matches.map(({ phrase: p, food, score, portions, grams, portion, macros: m }) => ({
    name: food.name,
    estimated_grams: grams,
    portion_description: portion,
    calories: m.kcal,
    protein_g: m.proteinG,
    carbs_g: m.carbsG,
    fat_g: m.fatG,
    // How sure the *match* is — the ranker's score, not a nutrition claim.
    confidence: score >= 100 ? 0.9 : score >= 80 ? 0.75 : 0.55,
    assumptions: p.unit || p.quantity !== 1 ? "" : "No amount given — one typical serving assumed.",
    match: {
      foodId: food.id,
      name: food.name,
      isVerified: food.isVerified,
      matchedMacros: m,
      portions,
    },
  }));

  return { items, plateNotes: "", unclear };
}
