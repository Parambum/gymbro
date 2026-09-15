/**
 * Build src/lib/data/fuel-foods.json from the USDA FoodData Central bulk
 * exports.
 *
 *   node scripts/import-usda.mjs            # import everything usable
 *   node scripts/import-usda.mjs --stats    # report coverage, write nothing
 *
 * WHY BULK RATHER THAN THE API: the API needs a key and is rate-limited to a
 * trickle; the bulk exports need neither, are the same data, and are about
 * 13 MB for the three generic datasets. One download gives thousands of foods
 * instead of a hundred.
 *
 * DATASETS (all public domain, 17 U.S.C. §105):
 *   SR Legacy   — ~7,800 generic foods, the gold-standard reference table
 *   FNDDS       — ~5,400 prepared dishes as actually eaten, many cuisines
 *   Foundation  — ~470 modern analyses, highest quality where they overlap
 *
 * Download and unzip them under scripts-tmp/usda/ first; see the README.
 *
 * Nothing here invents a number. Foods without a complete macro profile are
 * dropped, implausible composition is dropped, and every row keeps the fdcId
 * it came from so any figure in the app can be traced back.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCsv } from "./fuel/csv.mjs";
import { classifyFood, inferVegFlag, tidyName } from "./fuel/portion-rules.mjs";

const ROOT = "scripts-tmp/usda";
const OUT = "src/lib/data/fuel-foods.json";
const statsOnly = process.argv.includes("--stats");

// FDC nutrient ids. Values in these tables are per 100 g.
/**
 * Nutrients, canonicalised across two numbering schemes.
 *
 * SR Legacy and Foundation use FDC's modern nutrient ids (1003, 1008, …).
 * FNDDS still ships the legacy SR nutrient *numbers* (203, 208, …) in the
 * same column. Reading only the modern ids silently drops all 5,400 FNDDS
 * foods — which is precisely the prepared-dish and world-cuisine half of the
 * database. Both schemes map onto the same canonical keys here.
 *
 * `kcalAtwater*` matter for Foundation, which often carries energy only under
 * the Atwater ids.
 */
const NUTRIENT_KEY = new Map(
  Object.entries({
    // modern FDC ids
    1003: "protein", 1004: "fat", 1005: "carbs", 1008: "kcal",
    2047: "kcalAtwaterGeneral", 2048: "kcalAtwaterSpecific",
    1079: "fiber", 2000: "sugar", 1063: "sugarNLEA", 1093: "sodium",
    // legacy SR numbers, as used by FNDDS
    203: "protein", 204: "fat", 205: "carbs", 208: "kcal",
    291: "fiber", 269: "sugar", 307: "sodium",
  }),
);

/** Only these are real foods; the rest are sampling artefacts. */
const KEEP_TYPES = new Set(["sr_legacy_food", "survey_fndds_food", "foundation_food"]);

/** Higher wins when two datasets describe the same food. */
const TYPE_RANK = { foundation_food: 3, sr_legacy_food: 2, survey_fndds_food: 1 };

function findFile(dir, name) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.name === name) return p;
    }
  }
  return null;
}

if (!existsSync(ROOT)) {
  console.error(
    `${ROOT} not found.\n\n` +
      "Download the three bulk exports (no API key needed) and unzip them there:\n" +
      "  https://fdc.nal.usda.gov/download-datasets\n" +
      "    FoodData_Central_sr_legacy_food_csv_2018-04.zip   -> scripts-tmp/usda/sr_legacy/\n" +
      "    FoodData_Central_survey_food_csv_2024-10-31.zip   -> scripts-tmp/usda/survey/\n" +
      "    FoodData_Central_foundation_food_csv_2026-04-30.zip -> scripts-tmp/usda/foundation/\n",
  );
  process.exit(1);
}

// ── pass 1: descriptions ─────────────────────────────────────────────
/** fdcId -> { description, dataType } */
const foods = new Map();

for (const set of readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const foodCsv = findFile(join(ROOT, set.name), "food.csv");
  if (!foodCsv) continue;

  await readCsv(foodCsv, (row) => {
    if (!KEEP_TYPES.has(row.data_type)) return;
    const description = (row.description ?? "").trim();
    if (!description) return;
    foods.set(row.fdc_id, { description, dataType: row.data_type });
  });
  console.log(`  read ${set.name}/food.csv`);
}
console.log(`\n${foods.size} candidate foods across the three datasets`);

// ── pass 2: nutrients ────────────────────────────────────────────────
// Streamed: the three nutrient tables are ~60 MB and several million rows
// between them, and only eight nutrient ids matter.
/** fdcId -> { [canonicalKey]: amount } */
const nutrients = new Map();

for (const set of readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const nutrientCsv = findFile(join(ROOT, set.name), "food_nutrient.csv");
  if (!nutrientCsv) continue;

  let rows = 0;
  await readCsv(nutrientCsv, (row) => {
    rows++;
    const key = NUTRIENT_KEY.get(row.nutrient_id);
    if (!key) return;
    if (!foods.has(row.fdc_id)) return;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) return;

    const entry = nutrients.get(row.fdc_id) ?? {};
    // Modern ids win where a food somehow carries both.
    if (entry[key] == null) entry[key] = amount;
    nutrients.set(row.fdc_id, entry);
  });
  console.log(`  scanned ${set.name}/food_nutrient.csv (${rows.toLocaleString()} rows)`);
}

// ── build ────────────────────────────────────────────────────────────
/** Reject composition that cannot be true. */
function implausible(p) {
  if (p.kcal < 0 || p.kcal > 900) return "kcal out of range";
  for (const k of ["proteinG", "carbsG", "fatG"]) {
    if (p[k] < 0 || p[k] > 100) return `${k} out of range`;
  }
  if (p.proteinG + p.carbsG + p.fatG > 105) return "macros exceed 100 g";
  const atwater = 4 * p.proteinG + 4 * p.carbsG + 9 * p.fatG;
  if (p.kcal > 30 && atwater > 30 && (p.kcal / atwater > 2 || atwater / p.kcal > 2)) {
    return "kcal inconsistent with macros";
  }
  return null;
}

const round = (n, dp) => Math.round((n + Number.EPSILON) * 10 ** dp) / 10 ** dp;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** normalised name -> record, so duplicates collapse to the best source. */
const byName = new Map();
const dropped = { noMacros: 0, implausible: 0, duplicate: 0 };

for (const [fdcId, { description, dataType }] of foods) {
  const n = nutrients.get(fdcId);
  if (!n) {
    dropped.noMacros++;
    continue;
  }

  const kcal = n.kcal ?? n.kcalAtwaterGeneral ?? n.kcalAtwaterSpecific;
  const proteinG = n.protein;
  const carbsG = n.carbs;
  const fatG = n.fat;
  if ([kcal, proteinG, carbsG, fatG].some((v) => v == null)) {
    dropped.noMacros++;
    continue;
  }

  const per100g = {
    kcal: round(kcal, 1),
    proteinG: round(proteinG, 2),
    carbsG: round(carbsG, 2),
    fatG: round(fatG, 2),
    fiberG: round(n.fiber ?? 0, 2),
    sugarG: round(n.sugar ?? n.sugarNLEA ?? 0, 2),
    sodiumMg: round(n.sodium ?? 0, 1),
  };

  const bad = implausible(per100g);
  if (bad) {
    dropped.implausible++;
    continue;
  }

  const name = tidyName(description);
  // Dedupe on the FULL description, not the shortened name. Two different
  // cuts of beef shorten to the same display name and are not the same food;
  // collapsing on the tidy name threw away thousands of real entries.
  const key = norm(description);
  const { portions, aliases } = classifyFood(description);

  const record = {
    key: `usda-${fdcId}`,
    name,
    aliases,
    vegFlag: inferVegFlag(description),
    source: "usda",
    sourceRef: String(fdcId),
    usdaDescription: description,
    usdaDataType: dataType,
    isVerified: true,
    per100g,
    // The NAME of the portion set, not the expanded rows. Inlining the grams
    // 13,000 times tripled the file and gave the portion table two homes;
    // the seeder expands it from `portion-sets.mjs` at write time.
    portionSet: portions,
    rank: TYPE_RANK[dataType] ?? 0,
  };

  const existing = byName.get(key);
  if (existing) {
    dropped.duplicate++;
    if (record.rank > existing.rank) byName.set(key, record);
  } else {
    byName.set(key, record);
  }
}

const out = [...byName.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(({ rank, ...rest }) => rest);

// ── report ───────────────────────────────────────────────────────────
console.log(`\nkept        ${out.length.toLocaleString()} foods`);
console.log(`dropped     ${dropped.noMacros.toLocaleString()} without a complete macro profile`);
console.log(`            ${dropped.implausible.toLocaleString()} with implausible composition`);
console.log(`            ${dropped.duplicate.toLocaleString()} duplicate names (best source kept)`);

const withPortions = out.filter((f) => f.portionSet !== "weightOnly").length;
console.log(`\n${withPortions.toLocaleString()} foods have a household portion beyond plain grams`);

const CUISINES = {
  Indian: /dal|daal|paneer|chapati|roti|naan|dosa|idli|samosa|biryani|tandoori|masala|curry|korma|tikka|raita|paratha|pakora|chutney|saag|palak|rajma|chana|khichdi|lassi|vada|upma|poha|halwa|jalebi|gulab|kheer|sambar|rasam|ghee/i,
  Italian: /pasta|pizza|lasagna|risotto|spaghetti|ravioli|gnocchi|parmigiana|focaccia|minestrone|alfredo|pesto/i,
  Chinese: /chow mein|lo mein|fried rice|dumpling|wonton|egg roll|kung pao|szechuan|sweet and sour|spring roll/i,
  Mexican: /taco|burrito|enchilada|quesadilla|tamale|salsa|guacamole|nachos|tortilla|fajita/i,
  Thai: /pad thai|tom yum|thai|satay|massaman/i,
  Japanese: /sushi|teriyaki|tempura|miso|ramen|udon|sashimi/i,
  "Middle Eastern": /hummus|falafel|shawarma|kebab|tabbouleh|pita/i,
};
console.log("\ncuisine coverage:");
for (const [cuisine, re] of Object.entries(CUISINES)) {
  const n = out.filter((f) => re.test(f.usdaDescription)).length;
  console.log(`  ${cuisine.padEnd(16)} ${String(n).padStart(5)}`);
}

if (statsOnly) {
  console.log("\n--stats: nothing written");
  process.exit(0);
}

mkdirSync("src/lib/data", { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "USDA FoodData Central bulk exports (SR Legacy, FNDDS, Foundation)",
      license: "Public domain (17 U.S.C. §105). Portion conventions and aliases are project-curated.",
      count: out.length,
      foods: out,
    },
    null,
    0,
  )}\n`,
);
console.log(`\nwrote ${OUT}`);
