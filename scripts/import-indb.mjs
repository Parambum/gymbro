/**
 * Build src/lib/data/fuel-foods-indb.json from the Indian Nutrient Databank.
 *
 *   node scripts/import-indb.mjs            # import everything that passes the checks
 *   node scripts/import-indb.mjs --stats    # report what would be kept and why, write nothing
 *
 * WHAT INDB IS: 1,014 commonly eaten Indian recipes with nutrients per 100 g
 * and per serving, computed by Anuvaad Solutions from IFCT 2017 ingredient
 * data with nutrient retention factors (Vijayakumar et al., Current
 * Developments in Nutrition, 2024). It is the home-cooked half of Indian food
 * that USDA and Open Food Facts both miss: rajma, kadhi, dhokla, poha, sabzis.
 *
 * Download (no key, no login) and place it under scripts-tmp/indb/:
 *   https://www.anuvaad.org.in/wp-content/uploads/2020/07/Anuvaad_INDB_2024.11.xlsx
 *
 * WHAT THIS IMPORTER REFUSES, AND WHY. INDB is calculated from recipes, not
 * analysed in a lab, and the calculation has one large, systematic flaw: for
 * anything deep-fried, all the oil in the karahi is counted as eaten. Its
 * potato samosa comes out at 577 kcal and 59 g fat per 100 g; a lab-analysed
 * samosa (USDA FNDDS 2708730) is 310 kcal and 17 g. Showing the first number
 * to someone logging lunch would be worse than showing nothing, so rows are
 * dropped — not corrected, since correcting them would be inventing data:
 *
 *   - fat above 35 g/100 g (the fried-in-full-oil signature — this also drops a
 *     handful of genuinely fatty items like mayonnaise, all of which USDA has);
 *   - energy that disagrees with its own macros by more than 20% (4/4/9);
 *   - missing or impossible macros.
 *
 * Every kept row keeps its INDB food code, so any figure in the app can be
 * traced back to the spreadsheet.
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFirstSheet } from "./fuel/xlsx.mjs";
import { classifyFood, inferVegFlag } from "./fuel/portion-rules.mjs";
import { portionsFor } from "./fuel/portion-sets.mjs";

const ROOT = "scripts-tmp/indb";
const OUT = "src/lib/data/fuel-foods-indb.json";
const statsOnly = process.argv.includes("--stats");

const MAX_FAT_G = 35;
const MAX_ATWATER_DRIFT = 0.2;

/**
 * INDB's per-serving figures imply a serving weight. Recipe yields are not
 * always sensible ("1 piece" of rasmalai at 317 g is the whole pan), so a
 * serving is only offered when its weight is plausible for the vessel it is
 * named after. Otherwise the food keeps the household set its name implies.
 */
const SERVING_RANGES = [
  { unit: /^(bowl|small bowl|curry bowl|soup bowl|katori)$/, min: 80, max: 400, label: (u) => `1 ${u}` },
  { unit: /^plate$/, min: 120, max: 500, label: () => "1 plate" },
  { unit: /^(glass|tall glass|cup|tea cup)$/, min: 80, max: 450, label: (u) => `1 ${u}` },
  { unit: /^(tablespoon|tbsp)$/, min: 5, max: 40, label: () => "1 tbsp" },
  {
    unit: /^(piece|idli|dosa|chapati|roti|naan|parantha|poori|cheela|pancake|dhokla|vada|ladoo|burfi|slice|sandwich|triangle|cutlet|egg|kebab|kabab|roll|kaathi roll|frankie|wrap)$/,
    min: 10,
    max: 250,
    label: (u) => `1 ${u}`,
  },
];

function findXlsx() {
  if (!existsSync(ROOT)) return null;
  const f = readdirSync(ROOT).find((n) => /^Anuvaad_INDB.*\.xlsx$/i.test(n));
  return f ? join(ROOT, f) : null;
}

const path = findXlsx();
if (!path) {
  console.error(
    `No INDB spreadsheet under ${ROOT}/.\n\n` +
      "Download it (no key needed) into that folder:\n" +
      "  https://www.anuvaad.org.in/wp-content/uploads/2020/07/Anuvaad_INDB_2024.11.xlsx",
  );
  process.exit(1);
}

const [header, ...rows] = readFirstSheet(path);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
for (const need of ["food_code", "food_name", "energy_kcal", "protein_g", "carb_g", "fat_g", "fibre_g", "freesugar_g", "sodium_mg", "servings_unit", "unit_serving_energy_kcal"]) {
  if (!(need in col)) {
    console.error(`INDB column "${need}" is missing — the spreadsheet format has changed.`);
    process.exit(1);
  }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

/** "Kidney bean curry (Rajmah curry)" -> ["kidney bean curry", "rajmah curry", "rajma curry"] */
function aliasesFor(name) {
  const out = new Set();
  const inside = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const outside = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  for (const chunk of [outside, ...inside]) {
    for (const part of chunk.split(/[\/,]/)) {
      const p = part.trim().toLowerCase();
      if (p.length >= 3) out.add(p);
    }
  }
  // Hindi spellings the ranker's own normaliser does not fold together.
  for (const a of [...out]) {
    out.add(a.replace(/rajmah/g, "rajma").replace(/channa/g, "chana").replace(/gobhi/g, "gobi").replace(/parantha/g, "paratha"));
  }
  return [...out];
}

function servingFor(unitRaw, grams) {
  const unit = String(unitRaw ?? "").trim().toLowerCase();
  if (!unit || !grams) return null;
  const rule = SERVING_RANGES.find((r) => r.unit.test(unit));
  if (!rule || grams < rule.min || grams > rule.max) return null;
  return { label: rule.label(unit), grams: Math.round(grams), unit: "household" };
}

const reasons = { kept: 0, missingMacros: 0, friedOil: 0, atwater: 0 };
const foods = [];

for (const r of rows) {
  const code = r[col.food_code];
  const name = String(r[col.food_name] ?? "").replace(/\s+/g, " ").trim();
  if (!code || !name) continue;

  const kcal = num(r[col.energy_kcal]);
  const protein = num(r[col.protein_g]);
  const carbs = num(r[col.carb_g]);
  const fat = num(r[col.fat_g]);
  if (kcal == null || protein == null || carbs == null || fat == null || kcal <= 0 || kcal > 900) {
    reasons.missingMacros++;
    continue;
  }
  if (fat > MAX_FAT_G) {
    reasons.friedOil++;
    continue;
  }
  const atwater = 4 * protein + 4 * carbs + 9 * fat;
  if (Math.abs(atwater - kcal) / kcal > MAX_ATWATER_DRIFT) {
    reasons.atwater++;
    continue;
  }

  const per100g = {
    kcal: Math.round(kcal),
    proteinG: round(protein),
    carbsG: round(carbs),
    fatG: round(fat),
    fiberG: round(num(r[col.fibre_g]) ?? 0),
    sugarG: round(num(r[col.freesugar_g]) ?? 0),
    sodiumMg: Math.round(num(r[col.sodium_mg]) ?? 0),
  };

  const servingKcal = num(r[col.unit_serving_energy_kcal]);
  const serving = servingFor(r[col.servings_unit], servingKcal ? (100 * servingKcal) / kcal : null);
  const rule = classifyFood(name);

  // INDB's own serving first when it is plausible, then the household set the
  // dish's name implies, then grams — the same ordering every other source
  // gets from portionsFor().
  const household = portionsFor(rule.portions).filter((p) => !serving || p.label !== serving.label);
  const portions = (serving ? [serving, ...household] : household).map((p, i) => ({
    label: p.label,
    grams: p.grams,
    unit: p.unit,
    isDefault: i === 0,
    sortOrder: i,
  }));

  foods.push({
    key: `indb-${code}`,
    name,
    brand: null,
    aliases: [...new Set([...aliasesFor(name), ...rule.aliases])],
    vegFlag: inferVegFlag(name.replace(/\bvegeterian\b/i, "vegetarian")),
    source: "indb",
    sourceRef: String(code),
    isVerified: true,
    per100g,
    portions,
  });
  reasons.kept++;
}

console.log(`INDB rows: ${rows.length}`);
console.log(`  kept:                   ${reasons.kept}`);
console.log(`  dropped, fried in oil:  ${reasons.friedOil}  (fat > ${MAX_FAT_G} g/100 g)`);
console.log(`  dropped, energy drift:  ${reasons.atwater}  (kcal vs 4/4/9 > ${MAX_ATWATER_DRIFT * 100}%)`);
console.log(`  dropped, no macros:     ${reasons.missingMacros}`);

if (!statsOnly) {
  writeFileSync(
    OUT,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "Indian Nutrient Databank (INDB), Anuvaad Solutions, 2024.11",
      license:
        "Published open-access for research, government, private and third-sector use (Vijayakumar et al., Curr Dev Nutr 2024, CC BY 4.0). Attribution required.",
      count: foods.length,
      foods,
    }),
  );
  console.log(`wrote ${OUT}`);
}
