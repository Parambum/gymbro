import { Types } from "mongoose";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { rankFoods } from "@/lib/fuel/search";
import { entryMacrosFor } from "@/lib/fuel/log";
import type { AiDraft, AiItem } from "./schema";

/**
 * Map each drafted item onto a real food, through the same ranker ordinary
 * search uses (§7.1).
 *
 * A match matters for two reasons: it gives the row verified composition
 * instead of the model's guess, and it lets the user swap to a proper portion.
 * But a *miss* is not a failure — the item keeps the model's own numbers and
 * the confirm sheet offers to create it as a custom food, so an unrecognised
 * dish never blocks the log.
 */

export interface DraftedItem extends AiItem {
  /** Best database match, if the ranker found a convincing one. */
  match: {
    foodId: string;
    name: string;
    isVerified: boolean;
    /** Macros for the model's estimated grams, from the matched food's data. */
    matchedMacros: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
    portions: Array<{ id: string; label: string; grams: number; isDefault: boolean }>;
  } | null;
}

/** Below this the ranker's best guess isn't worth showing as a match. */
const MATCH_FLOOR = 55;

export async function matchDraftItems(
  draft: AiDraft,
  userId: string,
): Promise<DraftedItem[]> {
  const uid = new Types.ObjectId(userId);
  const visible = { $or: [{ ownerUserId: null }, { ownerUserId: uid }] };

  // One pooled read for the whole draft rather than a query per item — a plate
  // of five things should not cost five round trips.
  const pool = await FuelFood.find(visible)
    .sort({ isVerified: -1, popularity: -1 })
    .limit(400)
    .lean();

  const candidates = pool.map((f) => ({
    id: String(f._id),
    name: String(f.name),
    brand: (f.brand as string | null) ?? null,
    searchText: String(f.searchText ?? ""),
    aliases: (f.aliases as string[]) ?? [],
    isVerified: Boolean(f.isVerified),
    popularity: Number(f.popularity ?? 0),
    per100g: f.per100g,
  }));

  const matchedIds = new Map<string, (typeof candidates)[number]>();
  const picks = draft.items.map((item) => {
    const [best] = rankFoods(item.name, candidates, {}, 1);
    if (!best || best.score < MATCH_FLOOR) return null;
    matchedIds.set(best.food.id, best.food);
    return best.food;
  });

  const portions = matchedIds.size
    ? await FuelPortion.find({
        foodId: { $in: [...matchedIds.keys()].map((id) => new Types.ObjectId(id)) },
      })
        .sort({ sortOrder: 1 })
        .lean()
    : [];

  const portionsByFood = new Map<string, typeof portions>();
  for (const p of portions) {
    const key = String(p.foodId);
    const list = portionsByFood.get(key) ?? [];
    list.push(p);
    portionsByFood.set(key, list);
  }

  return draft.items.map((item, i) => {
    const food = picks[i];
    if (!food) return { ...item, match: null };

    return {
      ...item,
      match: {
        foodId: food.id,
        name: food.name,
        isVerified: food.isVerified,
        matchedMacros: entryMacrosFor(food.per100g, item.estimated_grams),
        portions: (portionsByFood.get(food.id) ?? []).map((p) => ({
          id: String(p._id),
          label: p.label,
          grams: p.grams,
          isDefault: Boolean(p.isDefault),
        })),
      },
    };
  });
}
