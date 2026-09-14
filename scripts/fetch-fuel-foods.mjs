/**
 * Build src/lib/data/fuel-foods.json from USDA FoodData Central.
 *
 *   node scripts/fetch-fuel-foods.mjs                 # fetch everything missing
 *   node scripts/fetch-fuel-foods.mjs --only=roti,idli # just these keys
 *   node scripts/fetch-fuel-foods.mjs --refetch        # ignore the cache
 *   node scripts/fetch-fuel-foods.mjs --audit          # print each match, don't write
 *
 * WHY THIS EXISTS: the app must never ship a nutrition figure someone typed
 * from memory. Every per-100g number in the seed database is fetched from a
 * published composition database and carries the fdcId it came from, so any
 * value in the app can be traced back to its source. A food that cannot be
 * matched is reported as a MISS and simply does not ship.
 *
 * API KEY: get a free one instantly at
 *   https://fdc.nal.usda.gov/api-key-signup.html
 * then put it in .env as USDA_FDC_API_KEY. Without a key the script falls back
 * to DEMO_KEY, which api.data.gov caps at 10 requests/hour — enough to try a
 * handful with --only, not enough for a full run.
 *
 * Responses are cached to scripts-tmp/usda/<key>.json (gitignored) so re-runs
 * and partial runs never re-spend quota.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { FUEL_SEED_LIST } from "./fuel/seed-list.mjs";
import { portionsFor } from "./fuel/portion-sets.mjs";

const OUT = "src/lib/data/fuel-foods.json";
const CACHE_DIR = "scripts-tmp/usda";
const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)"];

const args = process.argv.slice(2);
const audit = args.includes("--audit");
const refetch = args.includes("--refetch");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").map((s) => s.trim())) : null;

const API_KEY = readApiKey();

/**
 * The key, from the environment or straight out of .env — the repo has no
 * dotenv dependency and this script is the only thing that needs to read it.
 */
function readApiKey() {
  if (process.env.USDA_FDC_API_KEY) return process.env.USDA_FDC_API_KEY;
  if (existsSync(".env")) {
    const m = readFileSync(".env", "utf8").match(/^\s*USDA_FDC_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (m && m[1].trim()) return m[1].trim();
  }
  console.warn(
    "⚠  No USDA_FDC_API_KEY found — falling back to DEMO_KEY (10 requests/hour).\n" +
      "   Get a free key at https://fdc.nal.usda.gov/api-key-signup.html and add it to .env.\n",
  );
  return "DEMO_KEY";
}

// ── nutrient extraction ──────────────────────────────────────────────
// FDC nutrient ids. Values in search results are already per 100 g.
const N = {
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  kcal: 1008,
  kcalAtwater: 2047,
  kcalAtwaterSpecific: 2048,
  fiber: 1079,
  sugarTotal: 2000,
  sugarNLEA: 1063,
  sodium: 1093,
};

function nutrient(food, ...ids) {
  for (const id of ids) {
    const row = food.foodNutrients?.find((n) => n.nutrientId === id && n.value != null);
    if (row) return { value: Number(row.value), unit: String(row.unitName ?? "").toUpperCase() };
  }
  return null;
}

function kcalOf(food) {
  const direct = food.foodNutrients?.find(
    (n) => n.nutrientId === N.kcal && String(n.unitName).toUpperCase() === "KCAL" && n.value != null,
  );
  if (direct) return Number(direct.value);
  const atwater = nutrient(food, N.kcalAtwater, N.kcalAtwaterSpecific);
  if (atwater) return atwater.value;
  // Energy recorded only in kilojoules — convert rather than drop the food.
  const kj = food.foodNutrients?.find(
    (n) => n.nutrientId === N.kcal && String(n.unitName).toUpperCase() === "KJ" && n.value != null,
  );
  return kj ? Number(kj.value) / 4.184 : null;
}

/** Pull a complete per-100g block, or null if a macro is missing entirely. */
function per100gOf(food) {
  const kcal = kcalOf(food);
  const protein = nutrient(food, N.protein);
  const fat = nutrient(food, N.fat);
  const carbs = nutrient(food, N.carbs);
  if (kcal == null || !protein || !fat || !carbs) return null;

  const fiber = nutrient(food, N.fiber);
  const sugar = nutrient(food, N.sugarTotal, N.sugarNLEA);
  const sodium = nutrient(food, N.sodium);

  return {
    kcal: round(kcal, 1),
    proteinG: round(protein.value, 2),
    carbsG: round(carbs.value, 2),
    fatG: round(fat.value, 2),
    fiberG: round(fiber?.value ?? 0, 2),
    sugarG: round(sugar?.value ?? 0, 2),
    sodiumMg: round(sodium?.value ?? 0, 1),
  };
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * Reject composition that cannot be true, so a bad upstream row never reaches
 * the app. Atwater drift is tolerated generously — fibre, polyols and alcohol
 * all legitimately move the sum — but a 2× mismatch means we matched garbage.
 */
function plausible(p) {
  if (p.kcal < 0 || p.kcal > 900) return "kcal out of range";
  for (const k of ["proteinG", "carbsG", "fatG"]) {
    if (p[k] < 0 || p[k] > 100) return `${k} out of range`;
  }
  if (p.proteinG + p.carbsG + p.fatG > 105) return "macros exceed 100 g per 100 g";
  const atwater = 4 * p.proteinG + 4 * p.carbsG + 9 * p.fatG;
  if (p.kcal > 30 && atwater > 30 && (p.kcal / atwater > 2 || atwater / p.kcal > 2)) {
    return `kcal ${p.kcal} inconsistent with macros (~${Math.round(atwater)})`;
  }
  return null;
}

// ── candidate scoring ────────────────────────────────────────────────
const DATA_TYPE_SCORE = { Foundation: 6, "SR Legacy": 6, "Survey (FNDDS)": 4 };

function scoreCandidate(spec, food) {
  const desc = String(food.description ?? "").toLowerCase();
  if (spec.must && !spec.must.every((k) => desc.includes(k.toLowerCase()))) return -1;
  if (spec.avoid && spec.avoid.some((k) => desc.includes(k.toLowerCase()))) return -1;
  if (!per100gOf(food)) return -1;

  let score = DATA_TYPE_SCORE[food.dataType] ?? 0;

  // token overlap with the query
  const queryTokens = spec.query.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);
  for (const t of queryTokens) if (desc.includes(t)) score += 2;

  // a short description is usually the generic entry; a long one is a variant
  score -= Math.min(desc.length / 40, 4);

  // "Rice, white, cooked" beats "Beverage with rice" — reward a leading match
  if (queryTokens.length && desc.startsWith(queryTokens[0])) score += 3;

  return score;
}

// ── fetching ─────────────────────────────────────────────────────────
async function search(spec) {
  const cachePath = `${CACHE_DIR}/${spec.key}.json`;
  if (!refetch && existsSync(cachePath)) {
    return { foods: JSON.parse(readFileSync(cachePath, "utf8")), cached: true };
  }

  const res = await fetch(`${SEARCH_URL}?api_key=${encodeURIComponent(API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: spec.query, pageSize: 10, dataType: DATA_TYPES }),
  });

  if (res.status === 429) {
    const err = new Error("RATE_LIMIT");
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) throw new Error(`USDA ${res.status}: ${(await res.text()).slice(0, 160)}`);

  const json = await res.json();
  const foods = json.foods ?? [];
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(foods));
  return { foods, cached: false };
}

// ── main ─────────────────────────────────────────────────────────────
const specs = FUEL_SEED_LIST.filter((s) => !only || only.has(s.key));
if (specs.length === 0) {
  console.error("Nothing to do — --only matched no keys in the seed list.");
  process.exit(1);
}

// Keep whatever a previous (possibly partial) run already produced, so a
// quota-limited run adds to the database instead of replacing it.
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { foods: [] };
const byKey = new Map(existing.foods.map((f) => [f.key, f]));

const misses = [];
let fetched = 0;
let cachedCount = 0;
let rateLimited = false;

for (const spec of specs) {
  if (!refetch && byKey.has(spec.key) && !only) continue; // already have it

  let foods;
  try {
    const r = await search(spec);
    foods = r.foods;
    if (r.cached) cachedCount += 1;
    else {
      fetched += 1;
      await new Promise((r2) => setTimeout(r2, 150)); // be a good citizen
    }
  } catch (err) {
    if (err.rateLimited) {
      rateLimited = true;
      console.error(`\n⛔ USDA rate limit hit after ${fetched} live request(s).`);
      break;
    }
    misses.push({ key: spec.key, reason: err.message });
    continue;
  }

  const ranked = foods
    .map((f) => ({ food: f, score: scoreCandidate(spec, f) }))
    .filter((c) => c.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    misses.push({ key: spec.key, reason: `no acceptable match for "${spec.query}"` });
    continue;
  }

  const best = ranked[0].food;
  const per100g = per100gOf(best);
  const bad = plausible(per100g);
  if (bad) {
    misses.push({ key: spec.key, reason: `rejected "${best.description}": ${bad}` });
    continue;
  }

  byKey.set(spec.key, {
    key: spec.key,
    name: spec.name,
    aliases: spec.aliases,
    vegFlag: spec.vegFlag,
    source: "usda",
    sourceRef: String(best.fdcId),
    usdaDescription: best.description,
    usdaDataType: best.dataType,
    isVerified: true,
    per100g,
    portions: portionsFor(spec.portions),
  });

  if (audit) {
    console.log(
      `${spec.key.padEnd(20)} → [${best.dataType}] ${best.description}  ` +
        `(${per100g.kcal} kcal, P${per100g.proteinG} C${per100g.carbsG} F${per100g.fatG})`,
    );
  }
}

const foods = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));

if (!audit) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "USDA FoodData Central (Foundation, SR Legacy, Survey/FNDDS)",
    license: "Public domain (17 U.S.C. §105). Portion conventions are project-curated.",
    count: foods.length,
    foods,
  };
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
}

console.log(
  `\n${audit ? "AUDIT" : "WROTE"} ${audit ? "" : OUT} — ${foods.length} food(s) total ` +
    `(${fetched} fetched live, ${cachedCount} from cache, ${specs.length - fetched - cachedCount} skipped/already present)`,
);

if (misses.length > 0) {
  console.log(`\n${misses.length} miss(es) — these foods do NOT ship:`);
  for (const m of misses) console.log(`  ✗ ${m.key.padEnd(20)} ${m.reason}`);
  console.log("\nFix a miss by sharpening its `query`/`must` in scripts/fuel/seed-list.mjs, then re-run.");
}

if (rateLimited) {
  console.log(
    "\nRun stopped early on the API quota. Add USDA_FDC_API_KEY to .env " +
      "(free, instant: https://fdc.nal.usda.gov/api-key-signup.html) and re-run — " +
      "cached results are reused, so nothing already fetched is re-spent.",
  );
  process.exitCode = 1;
}
