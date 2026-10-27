import { Types } from "mongoose";
import { FuelFood } from "@/models/FuelFood";
import { tokenize } from "@/lib/fuel/search";

/**
 * Stage 1 of food search: narrow the whole database to a candidate pool that
 * the in-memory ranker (lib/fuel/search.ts) can afford to score.
 *
 * Shared by the search box and the keyless "describe your meal" parser, so a
 * phrase like "1 katori dal" finds exactly what typing "dal" would.
 *
 * Mongo's text index plus a word-anchored prefix regex. Fast, indexed, and
 * unable to find "paneer" from "panner" — so when it comes back nearly empty
 * the pool is widened to foods sharing the query's opening letters, which is
 * where a typo usually still agrees with the word it meant.
 */

const FUZZY_POOL_SIZE = 300;

export type Visible = { $or: Array<Record<string, unknown>> };

/** Public foods, plus the user's own custom foods when someone is signed in. */
export function visibleTo(userId: string | null): Visible {
  if (!userId) return { $or: [{ ownerUserId: null }] };
  return { $or: [{ ownerUserId: null }, { ownerUserId: new Types.ObjectId(userId) }] };
}

export async function candidatePool(
  q: string,
  visible: Visible,
): Promise<{ pool: Array<Record<string, unknown>>; narrowHits: number }> {
  if (tokenize(q).length === 0) return { pool: [], narrowHits: 0 };
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Two queries, not one `$or` over both: MongoDB cannot build an execution
  // plan for a $text clause nested inside $or, so it must sit at the top
  // level. Merging here costs one extra round trip and keeps the text index
  // doing the work it is for.
  //
  // The regex is word-anchored. An unanchored one matches substrings buried
  // mid-word — `/lassi/` hits "classic" — which put an Arby's sandwich at the
  // top of a search for lassi.
  const [textHits, regexHits] = await Promise.all([
    FuelFood.find({ $text: { $search: q }, ...visible }).limit(60).lean(),
    FuelFood.find({ searchText: { $regex: `\\b${escaped}`, $options: "i" }, ...visible })
      .limit(60)
      .lean(),
  ]);

  const seen = new Set<string>();
  const pool = [...textHits, ...regexHits].filter((f) => {
    const id = String(f._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }) as Array<Record<string, unknown>>;
  const narrowHits = pool.length;

  // Few hits — possibly a typo. Widen the pool, but ADD to it rather than
  // replace: a rare exact match ("paneer" matches two rows out of 13,000)
  // would otherwise be thrown away in favour of foods that don't match at all.
  // The widening is anchored on the query's first few characters rather than
  // "most popular", because a blind sample of 300 out of 13,000 almost never
  // contains the word the user meant.
  if (pool.length < 5) {
    const stem = escaped.slice(0, Math.min(3, Math.max(2, escaped.length - 1)));
    const widened = await FuelFood.find({
      searchText: { $regex: `\\b${stem}`, $options: "i" },
      ...visible,
    })
      .limit(FUZZY_POOL_SIZE)
      .lean();
    for (const f of widened) {
      if (!seen.has(String(f._id))) {
        seen.add(String(f._id));
        pool.push(f as Record<string, unknown>);
      }
    }
  }

  return { pool, narrowHits };
}

/** A pooled Mongo document in the shape the ranker scores. */
export function toCandidate(f: Record<string, unknown>) {
  return {
    id: String(f._id),
    name: String(f.name),
    brand: (f.brand as string | null) ?? null,
    searchText: String(f.searchText ?? ""),
    aliases: (f.aliases as string[]) ?? [],
    isVerified: Boolean(f.isVerified),
    popularity: Number(f.popularity ?? 0),
    per100g: f.per100g as { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG?: number; sodiumMg?: number },
    vegFlag: f.vegFlag as string,
    source: f.source as string,
  };
}
