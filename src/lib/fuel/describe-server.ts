import { Types } from "mongoose";
import { FuelPortion } from "@/models/FuelPortion";
import { rankFoods } from "@/lib/fuel/search";
import { entryMacrosFor } from "@/lib/fuel/log";
import { candidatePool, toCandidate, visibleTo } from "@/lib/fuel/food-pool";
import { gramsFor, parsePhrase, servesIn, splitMeal } from "@/lib/fuel/describe";
import type { DraftedItem } from "@/lib/fuel/ai/match";

/**
 * A described meal -> a draft, with no model and no key.
 *
 * Each phrase is searched exactly as if the user had typed it into the search
 * box, and its amount is read against that food's own household portions. The
 * result has the same shape as the AI path's draft, so it lands in the same
 * check-before-saving sheet. Anything that does not find a convincing match is
 * listed as unclear rather than guessed at.
 */

/** Below this the ranker's best guess isn't a match (same floor as ai/match.ts). */
const MATCH_FLOOR = 55;
const MAX_PHRASES = 12;
/** How many close matches to consider when the stated unit has to fit. */
const SHORTLIST = 8;

export async function draftFromDescription(
  text: string,
  userId: string,
): Promise<{ items: DraftedItem[]; plateNotes: string; unclear: string[] }> {
  const phrases = splitMeal(text)
    .map(parsePhrase)
    .filter((p) => p.query.length > 0)
    .slice(0, MAX_PHRASES);
  const visible = visibleTo(userId);

  const items: DraftedItem[] = [];
  const unclear: string[] = [];

  for (const p of phrases) {
    const { pool } = await candidatePool(p.query, visible);
    const ranked = rankFoods(p.query, pool.map(toCandidate), {}, SHORTLIST).filter((r) => r.score >= MATCH_FLOOR);
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
    const portionsOf = (id: string) => allPortions.filter((x) => String(x.foodId) === id);
    const optionsOf = (id: string) =>
      portionsOf(id).map((x) => ({ label: x.label, grams: x.grams, isDefault: Boolean(x.isDefault) }));
    const best = ranked.find((r) => servesIn(p, optionsOf(r.food.id))) ?? ranked[0];

    const portions = portionsOf(best.food.id);
    const options = optionsOf(best.food.id);
    const { grams, portion } = gramsFor(p, options);
    const m = entryMacrosFor(best.food.per100g, grams);

    items.push({
      name: best.food.name,
      estimated_grams: grams,
      portion_description: portion,
      calories: m.kcal,
      protein_g: m.proteinG,
      carbs_g: m.carbsG,
      fat_g: m.fatG,
      // How sure the *match* is — the ranker's score, not a nutrition claim.
      confidence: best.score >= 100 ? 0.9 : best.score >= 80 ? 0.75 : 0.55,
      assumptions: p.unit || p.quantity !== 1 ? "" : "No amount given — one typical serving assumed.",
      match: {
        foodId: best.food.id,
        name: best.food.name,
        isVerified: best.food.isVerified,
        matchedMacros: m,
        portions: portions.map((x) => ({
          id: String(x._id),
          label: x.label,
          grams: x.grams,
          isDefault: Boolean(x.isDefault),
        })),
      },
    });
  }

  return { items, plateNotes: "", unclear };
}
