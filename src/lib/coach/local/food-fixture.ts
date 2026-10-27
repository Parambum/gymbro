/**
 * Test support: the real food database, in memory.
 *
 * matchDescription() needs Mongo; this does the same matching over the same
 * data — the three committed manifests the seed script loads, with the same
 * portion rules — so the coach's food answers are tested against the foods it
 * will actually find, without a database. Not used by the app.
 */
import usda from "@/lib/data/fuel-foods.json";
import india from "@/lib/data/fuel-foods-india.json";
import indb from "@/lib/data/fuel-foods-indb.json";
import { portionsFor } from "../../../../scripts/fuel/portion-sets.mjs";
import { rankFoods, tokenize } from "@/lib/fuel/search";
import { gramsFor, parsePhrase, servesIn, splitMeal } from "@/lib/fuel/describe";
import { entryMacrosFor } from "@/lib/fuel/log";
import type { FoodCandidate, MatchOptions, PhraseMatch } from "@/lib/fuel/describe-server";

type Raw = {
  key: string;
  name: string;
  brand?: string | null;
  aliases?: string[];
  isVerified?: boolean;
  per100g: FoodCandidate["per100g"];
  vegFlag?: string;
  source: string;
  portionSet?: string;
  portions?: Array<{ label: string; grams: number; isDefault?: boolean }>;
};

const RAW: Raw[] = [...(usda.foods as Raw[]), ...(india.foods as Raw[]), ...(indb.foods as Raw[])];

const FOODS = RAW.map((f) => ({
  candidate: {
    id: f.key,
    name: f.name,
    brand: f.brand ?? null,
    searchText: [f.name, f.brand ?? "", ...(f.aliases ?? [])].join(" ").toLowerCase(),
    aliases: f.aliases ?? [],
    isVerified: Boolean(f.isVerified),
    popularity: 0,
    per100g: f.per100g,
    vegFlag: f.vegFlag ?? "unknown",
    source: f.source,
  } satisfies FoodCandidate,
  portions: (f.portions ?? (f.portionSet ? portionsFor(f.portionSet) : [])).map((p, i) => ({
    id: `${f.key}-${i}`,
    label: p.label,
    grams: p.grams,
    isDefault: Boolean(p.isDefault),
  })),
}));

/** Stand-in for Mongo's candidate pool: any food with a word starting like a query word. */
function pool(query: string): FoodCandidate[] {
  const stems = tokenize(query).map((t) => t.slice(0, 3));
  return FOODS.filter((f) => stems.some((s) => new RegExp(`\\b${s}`).test(f.candidate.searchText))).map((f) => f.candidate);
}

/** The ranked shortlist the matcher chooses from, before any reordering — for inspecting a query. */
export function shortlist(query: string, opts: MatchOptions = {}) {
  const accept = opts.accept ?? (() => true);
  return rankFoods(query, pool(query), {}, opts.shortlist ?? 8).filter((r) => r.score >= 55 && accept(query, r.food));
}

/** matchDescription(), over the in-memory foods, with the same options. */
export async function matchInMemory(
  text: string,
  _visible: unknown,
  opts: MatchOptions = {},
): Promise<{ matches: PhraseMatch[]; unclear: string[] }> {
  const matches: PhraseMatch[] = [];
  const unclear: string[] = [];
  for (const p of splitMeal(text).map(parsePhrase).filter((x) => x.query)) {
    let ranked = shortlist(p.query, opts);
    if (opts.rerank) ranked = opts.rerank(p.query, ranked);
    const pinnedName = opts.pinned?.(p.query);
    const pinned = pinnedName ? FOODS.find((f) => f.candidate.name === pinnedName && f.candidate.isVerified) : undefined;
    if (pinned) {
      ranked = [{ food: pinned.candidate, score: Math.max(100, ranked[0]?.score ?? 0), reason: "match" as const }, ...ranked.filter((r) => r.food.id !== pinned.candidate.id)];
    }
    if (ranked.length === 0) {
      unclear.push(p.raw);
      continue;
    }
    const portionsOf = (id: string) => FOODS.find((f) => f.candidate.id === id)!.portions;
    const best = ranked.find((r) => servesIn(p, portionsOf(r.food.id))) ?? ranked[0];
    const portions = portionsOf(best.food.id);
    const { grams, portion } = gramsFor(p, portions);
    matches.push({ phrase: p, food: best.food, score: best.score, portions, grams, portion, macros: entryMacrosFor(best.food.per100g, grams) });
  }
  return { matches, unclear };
}
