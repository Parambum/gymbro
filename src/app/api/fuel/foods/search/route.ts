import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { FuelLog } from "@/models/FuelLog";
import { FuelFavorite } from "@/models/FuelFavorite";
import { fuelGuard } from "@/lib/fuel/server";
import { rankFoods, tokenize } from "@/lib/fuel/search";
import { entryMacrosFor } from "@/lib/fuel/log";

export const runtime = "nodejs";

/**
 * GET /api/fuel/foods/search?q=dhal
 *
 * Two stages, because neither alone is enough:
 *
 *  1. Mongo narrows to a candidate pool — the text index plus a prefix regex.
 *     Fast, indexed, and completely unable to find "paneer" from "panner".
 *  2. `lib/fuel/search.ts` ranks that pool in memory, where edit distance and
 *     the user's own history can be brought to bear.
 *
 * When stage 1 comes back nearly empty — which is exactly the typo case — the
 * pool is widened to a capped slice of verified foods so stage 2 has
 * something to be clever with. That cap is what keeps this O(1)-ish as the
 * database grows rather than degenerating into a collection scan.
 *
 * Every row carries the macros for its default portion, so the list answers
 * "how many calories is one katori of this" without a tap (§6).
 */
const FUZZY_POOL_SIZE = 300;

export async function GET(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 50);

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    // ── the user's own history, which outranks everything ───────────
    const [frequents, recents, favorites] = await Promise.all([
      FuelLog.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { userId: uid, foodId: { $ne: null } } },
        { $group: { _id: "$foodId", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 20 },
      ]),
      FuelLog.find({ userId: uid, foodId: { $ne: null } })
        .sort({ loggedAt: -1 })
        .limit(40)
        .select({ foodId: 1 })
        .lean(),
      FuelFavorite.find({ userId: uid }).select({ foodId: 1 }).lean(),
    ]);

    const frequentIds = frequents.map((f) => String(f._id));
    const recentIds = [...new Set(recents.map((r) => String(r.foodId)))];
    const favoriteIds = favorites.map((f) => String(f.foodId));

    // Only global foods, plus this user's own. Never another user's custom food.
    const visible = { $or: [{ ownerUserId: null }, { ownerUserId: uid }] };

    // ── stage 1: narrow ─────────────────────────────────────────────
    let pool: Array<Record<string, unknown>> = [];
    if (tokenize(q).length > 0) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Two queries, not one `$or` over both: MongoDB cannot build an
      // execution plan for a $text clause nested inside $or, so it must sit at
      // the top level. Merging here costs one extra round trip and keeps the
      // text index doing the work it is for.
      const [textHits, regexHits] = await Promise.all([
        FuelFood.find({ $text: { $search: q }, ...visible }).limit(60).lean(),
        FuelFood.find({ searchText: { $regex: escaped, $options: "i" }, ...visible }).limit(60).lean(),
      ]);

      const seen = new Set<string>();
      pool = [...textHits, ...regexHits].filter((f) => {
        const id = String(f._id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      // Nothing useful came back — this is the typo case. Widen, then let the
      // ranker decide; it will return nothing if nothing is genuinely close.
      if (pool.length < 5) {
        pool = await FuelFood.find(visible)
          .sort({ isVerified: -1, popularity: -1 })
          .limit(FUZZY_POOL_SIZE)
          .lean();
      }
    } else {
      // No query: show what they actually eat, so a repeat is three taps.
      const personal = [...new Set([...favoriteIds, ...frequentIds, ...recentIds])]
        .slice(0, 40)
        .map((id) => new Types.ObjectId(id));
      if (personal.length === 0) return NextResponse.json({ foods: [], personal: true });
      pool = await FuelFood.find({ _id: { $in: personal }, ...visible }).lean();
    }

    // ── stage 2: rank ───────────────────────────────────────────────
    const candidates = pool.map((f) => ({
      id: String(f._id),
      name: String(f.name),
      brand: (f.brand as string | null) ?? null,
      searchText: String(f.searchText ?? ""),
      aliases: (f.aliases as string[]) ?? [],
      isVerified: Boolean(f.isVerified),
      popularity: Number(f.popularity ?? 0),
      per100g: f.per100g as { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number },
      vegFlag: f.vegFlag as string,
      source: f.source as string,
    }));

    const ranked = rankFoods(q, candidates, { frequentIds, recentIds, favoriteIds }, limit);

    // ── attach each food's default portion + its macros ─────────────
    const ids = ranked.map((r) => new Types.ObjectId(r.food.id));
    const portions = await FuelPortion.find({ foodId: { $in: ids } })
      .sort({ sortOrder: 1 })
      .lean();

    const byFood = new Map<string, typeof portions>();
    for (const p of portions) {
      const key = String(p.foodId);
      const list = byFood.get(key) ?? [];
      list.push(p);
      byFood.set(key, list);
    }

    return NextResponse.json({
      foods: ranked.map((r) => {
        const list = byFood.get(r.food.id) ?? [];
        const def = list.find((p) => p.isDefault) ?? list[0] ?? null;
        return {
          id: r.food.id,
          name: r.food.name,
          brand: r.food.brand,
          isVerified: r.food.isVerified,
          vegFlag: r.food.vegFlag,
          source: r.food.source,
          reason: r.reason,
          per100g: r.food.per100g,
          portions: list.map((p) => ({
            id: String(p._id),
            label: p.label,
            grams: p.grams,
            unit: p.unit,
            isDefault: Boolean(p.isDefault),
          })),
          // what the list row shows: kcal for one default serving
          defaultPortion: def
            ? {
                id: String(def._id),
                label: def.label,
                grams: def.grams,
                ...entryMacrosFor(r.food.per100g, def.grams),
              }
            : null,
        };
      }),
      personal: tokenize(q).length === 0,
    });
  } catch (err) {
    // A silent 503 here cost an afternoon once. The user still gets a plain
    // sentence; the server log gets the reason.
    console.error("[fuel/search] failed:", err);
    return NextResponse.json({ error: "Search is unavailable right now." }, { status: 503 });
  }
}
