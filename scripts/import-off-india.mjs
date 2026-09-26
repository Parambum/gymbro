/**
 * Build the Indian packaged-food database from Open Food Facts.
 *
 *   node scripts/import-off-india.mjs              # rebuild the India file
 *   node scripts/import-off-india.mjs --limit=300  # a small slice, for testing
 *
 * Why Open Food Facts and not a composition table: the gap this fills is
 * *brands*. Someone in India logging breakfast wants "Britannia Marie Gold"
 * and "Amul Masti Dahi", not "biscuit, plain" — and no government composition
 * table carries brands. OFF does, with barcodes, which is also what makes the
 * scanner worth having.
 *
 * What it deliberately does not do is mark any of this verified. OFF is
 * crowd-sourced from photographs of labels; the numbers are usually right and
 * occasionally nonsense, so every row lands with isVerified false and the UI
 * badges it. The USDA rows stay the verified ones.
 *
 * Licensing: OFF data is the Open Database License v1.0. That is share-alike
 * for the *database*, not for the application querying it, so a commercial app
 * is fine — but attribution is required, and src/lib/data/ATTRIBUTION.md
 * carries it. Do not delete that file.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { classifyFood, inferVegFlag } from "./fuel/portion-rules.mjs";

const OUT = "src/lib/data/fuel-foods-india.json";
const ENDPOINT = "https://search.openfoodfacts.org/search";
const PAGE_SIZE = 1000;
const UA = "GymBro/1.0 (nutrition tracker; adityaparam2006@gmail.com)";

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;

/**
 * Only products carrying all four macros are worth having. A row missing
 * protein cannot be logged against a macro target, and offering it is worse
 * than omitting it — someone picks it and silently under-counts all day.
 */
const QUERY = [
  'countries_tags:"en:india"',
  "nutriments.energy-kcal_100g:[0 TO *]",
  "nutriments.proteins_100g:[0 TO *]",
  "nutriments.carbohydrates_100g:[0 TO *]",
  "nutriments.fat_100g:[0 TO *]",
].join(" AND ");

const FIELDS = [
  "code",
  "product_name",
  "brands",
  "nutriments",
  "serving_size",
  "quantity",
  "categories_tags",
  "labels_tags",
].join(",");

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Sodium in mg, from whichever of the spellings OFF happens to carry. */
function sodiumMg(n) {
  const direct = num(n.sodium_100g);
  if (direct !== null) return Math.round(direct * 1000);
  const salt = num(n.salt_100g);
  // Salt is sodium chloride: 1 g of salt carries 0.4 g of sodium.
  if (salt !== null) return Math.round(salt * 400);
  return 0;
}

/**
 * Reject rows whose numbers cannot be true.
 *
 * The one that earns its keep is the Atwater check. OFF carries entries like
 * a beer at 1 kcal per 100 g sitting next to 0.5 g of carbohydrate, where
 * somebody typed a per-serving figure into the per-100 g box. Recomputing
 * energy from the macros catches those without knowing what the food is.
 */
function validate(name, p) {
  if (!name || name.length < 2 || name.length > 160) return "name";
  if (p.kcal === null || p.proteinG === null || p.carbsG === null || p.fatG === null) {
    return "macros-missing";
  }
  if (p.kcal < 0 || p.kcal > 900) return "kcal-range";
  for (const k of ["proteinG", "carbsG", "fatG", "fiberG", "sugarG"]) {
    if (p[k] < 0 || p[k] > 100) return "value-range";
  }
  if (p.proteinG + p.carbsG + p.fatG > 105) return "macros-sum";
  if (p.sodiumMg < 0 || p.sodiumMg > 40000) return "sodium-range";

  const atwater = 4 * p.proteinG + 4 * p.carbsG + 9 * p.fatG;
  // Fibre, polyols and label rounding all move the total, so the tolerance is
  // wide. It is here to catch order-of-magnitude errors, not to audit labels.
  const slack = Math.max(60, atwater * 0.35);
  if (Math.abs(p.kcal - atwater) > slack) return "atwater";
  return null;
}

/** India prints veg/non-veg on the pack, and OFF often records it. */
function vegFlagFor(name, labels) {
  const l = (labels ?? []).join(" ");
  if (l.includes("en:non-vegetarian")) return "nonveg";
  if (l.includes("en:vegan") || l.includes("en:vegetarian")) return "veg";
  return inferVegFlag(name);
}

/** Brands arrive lower-cased about half the time. */
function titleCaseBrand(b) {
  return b
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 2 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Drop a brand the product name already opens with.
 *
 * The UI renders brand and name together, so an OFF row named "Britannia
 * Marie Gold" under brand "Britannia" reads as "Britannia — Britannia Marie
 * Gold", and one simply named "Amul" reads as "Amul — Amul". Stripping the
 * prefix here keeps the fix in one place instead of in every component.
 */
function stripBrandPrefix(name, brand) {
  if (!brand) return name;
  const n = name.trim();
  const b = brand.trim();
  if (n.toLowerCase() === b.toLowerCase()) return n; // "Amul" alone: leave it
  const loose = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!loose(n).startsWith(loose(b))) return n;
  // Trim the brand plus whatever separator followed it.
  const rest = n.slice(b.length).replace(/^[\s\-–—:,.'"]+/, "").trim();
  return rest.length >= 2 ? rest : n;
}

/**
 * Collapse the same product listed under several barcodes.
 *
 * A biscuit sold in 50 g, 100 g and 250 g packs is three barcodes and three
 * OFF rows with byte-identical nutrition, which fills a picker with what looks
 * to the user like the same thing three times. Scanning still works for the
 * dropped codes: unknown barcodes fall through to the Open Food Facts lookup.
 */
function dedupeKey(f) {
  const macros = [f.per100g.kcal, f.per100g.proteinG, f.per100g.carbsG, f.per100g.fatG].join("/");
  return `${(f.brand ?? "").toLowerCase()}|${f.name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${macros}`;
}

async function fetchPage(page) {
  const url =
    ENDPOINT +
    "?q=" +
    encodeURIComponent(QUERY) +
    "&page_size=" +
    PAGE_SIZE +
    "&page=" +
    page +
    "&fields=" +
    encodeURIComponent(FIELDS);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("OFF search returned " + res.status + " on page " + page);
  return res.json();
}

async function main() {
  console.log("source : Open Food Facts (search-a-licious), country = India");

  const first = await fetchPage(1);
  const wanted = Math.min(first.count, limit);
  const pages = Math.ceil(wanted / PAGE_SIZE);
  console.log("found  : " + first.count + " products carrying all four macros");

  const raw = [...first.hits];
  for (let p = 2; p <= pages; p++) {
    process.stdout.write("\r  fetching page " + p + "/" + pages);
    const next = await fetchPage(p);
    raw.push(...next.hits);
  }
  process.stdout.write("\r".padEnd(40) + "\r");

  const foods = [];
  const seen = new Set();
  const rejected = {};

  for (const h of raw.slice(0, limit)) {
    const n = h.nutriments ?? {};
    const brandRaw = Array.isArray(h.brands) ? h.brands[0] : h.brands;
    const brand = brandRaw ? titleCaseBrand(String(brandRaw)) : null;
    const name = stripBrandPrefix(
      String(h.product_name ?? "").trim().replace(/\s+/g, " "),
      brand,
    );

    const per100g = {
      kcal: num(n["energy-kcal_100g"]),
      proteinG: num(n.proteins_100g),
      carbsG: num(n.carbohydrates_100g),
      fatG: num(n.fat_100g),
      fiberG: num(n.fiber_100g) ?? 0,
      sugarG: num(n.sugars_100g) ?? 0,
      sodiumMg: sodiumMg(n),
    };

    const bad = validate(name, per100g);
    if (bad) {
      rejected[bad] = (rejected[bad] ?? 0) + 1;
      continue;
    }

    // One row per barcode; OFF occasionally carries a code twice.
    const key = String(h.code);
    if (seen.has(key)) {
      rejected.duplicate = (rejected.duplicate ?? 0) + 1;
      continue;
    }
    seen.add(key);

    const { portions, aliases } = classifyFood(name + " " + (brand ?? ""));
    for (const k of ["proteinG", "carbsG", "fatG", "fiberG", "sugarG"]) {
      per100g[k] = round(per100g[k]);
    }
    per100g.kcal = Math.round(per100g.kcal);

    const candidate = { name, brand, per100g };
    const dk = dedupeKey(candidate);
    if (seen.has(dk)) {
      rejected["same-product-other-pack"] = (rejected["same-product-other-pack"] ?? 0) + 1;
      continue;
    }
    seen.add(dk);

    foods.push({
      key: "off-" + key,
      name,
      brand,
      aliases,
      vegFlag: vegFlagFor(name, h.labels_tags),
      source: "off",
      sourceRef: key,
      barcode: key,
      // Crowd-sourced from label photographs, not a published composition
      // table. The UI badges this; do not flip it to true.
      isVerified: false,
      per100g,
      portionSet: portions,
    });
  }

  mkdirSync("src/lib/data", { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "openfoodfacts",
      license: "ODbL-1.0",
      foods,
    }),
  );

  const dropped = Object.entries(rejected).sort((a, b) => b[1] - a[1]);
  console.log("kept   : " + foods.length);
  console.log("dropped: " + (dropped.map(([k, v]) => k + "=" + v).join(" ") || "none"));

  const brands = {};
  for (const f of foods) if (f.brand) brands[f.brand] = (brands[f.brand] ?? 0) + 1;
  const top = Object.entries(brands)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([b, c]) => b + "(" + c + ")")
    .join(", ");
  console.log("brands : " + Object.keys(brands).length + " distinct — top: " + top);
  console.log("wrote  : " + OUT);
}

main().catch((err) => {
  console.error("import failed: " + err.message);
  process.exitCode = 1;
});
