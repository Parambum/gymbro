/**
 * Build src/lib/data/food-vision-classes.json — what the app shows when the
 * food model recognises something.
 *
 *   node scripts/build-vision-classes.mjs
 *
 * Joins three things that live apart:
 *   - the model's class list (public/models/food-v1/model.json, written by
 *     ml/food-vision/export.py),
 *   - the curated class -> food mapping (scripts/fuel/vision-classes.mjs),
 *   - the food manifests (USDA, INDB, Open Food Facts) for composition, and
 *     USDA FNDDS's household portion table for serving weights.
 *
 * It fails rather than guesses: a class the model knows but the mapping does
 * not, or a ref that is not in any manifest, stops the build.
 *
 * Serving weights: for a USDA FNDDS food, the default is FNDDS's "Quantity not
 * specified" weight — the amount NHANES respondents typically ate when they
 * did not say how much — which is exactly the question a photo leaves open.
 * Its other household measures ("1 small", "1 cup") become the alternatives.
 * Those need the FNDDS bulk export under scripts-tmp/usda/ (see import-usda);
 * without it USDA foods fall back to their household portion set.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCsv } from "./fuel/csv.mjs";
import { portionsFor } from "./fuel/portion-sets.mjs";
import { VISION_CLASSES } from "./fuel/vision-classes.mjs";

const MODEL_META = "public/models/food-v1/model.json";
const OUT = "src/lib/data/food-vision-classes.json";
const MANIFESTS = [
  "src/lib/data/fuel-foods.json",
  "src/lib/data/fuel-foods-indb.json",
  "src/lib/data/fuel-foods-india.json",
];

const foods = new Map();
for (const path of MANIFESTS) {
  if (!existsSync(path)) {
    console.error(`missing ${path} — run its importer first`);
    process.exit(1);
  }
  for (const f of JSON.parse(readFileSync(path, "utf8")).foods) {
    foods.set(`${f.source ?? "usda"}:${f.sourceRef}`, { ...f, source: f.source ?? "usda" });
  }
}

// ── FNDDS household portions ──────────────────────────────────────────
function findFile(dir, name) {
  if (!existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === name) return p;
    }
  }
  return null;
}

const wanted = new Set();
for (const c of Object.values(VISION_CLASSES)) {
  for (const it of [...c.items, ...(c.alts ?? [])]) {
    const ref = typeof it === "string" ? it : it.ref;
    if (ref.startsWith("usda:")) wanted.add(ref.slice(5));
  }
}

const fndds = new Map(); // fdcId -> [{label, grams}]
const portionCsv = findFile("scripts-tmp/usda/survey", "food_portion.csv");
if (portionCsv) {
  await readCsv(portionCsv, (row) => {
    if (!wanted.has(row.fdc_id)) return;
    const grams = Number(row.gram_weight);
    const label = row.portion_description?.trim();
    if (!label || !(grams > 0) || /surface inch/i.test(label)) return;
    const list = fndds.get(row.fdc_id) ?? [];
    list.push({ label, grams, seq: Number(row.seq_num) || 0 });
    fndds.set(row.fdc_id, list);
  });
} else {
  console.warn("! FNDDS food_portion.csv not found under scripts-tmp/usda — USDA foods use household sets");
}

// SR Legacy describes its portions as amount + modifier ("1" + "burrito").
// "recipe yield" and whole-rack weights are not servings anyone eats.
const srLegacy = new Map();
const srCsv = findFile("scripts-tmp/usda/sr_legacy", "food_portion.csv");
if (srCsv) {
  await readCsv(srCsv, (row) => {
    if (!wanted.has(row.fdc_id)) return;
    const grams = Number(row.gram_weight);
    const modifier = row.modifier?.trim();
    if (!modifier || !(grams > 0) || grams > 1000 || /recipe yield/i.test(modifier)) return;
    const amount = Number(row.amount) || 1;
    const list = srLegacy.get(row.fdc_id) ?? [];
    list.push({ label: `${amount} ${modifier}`, grams, seq: Number(row.seq_num) || 0 });
    srLegacy.set(row.fdc_id, list);
  });
}

const round1 = (x) => Math.round(x * 10) / 10;

/** Ordered serving options for a food, typical serving first. */
function servingsFor(food) {
  const out = [];
  const ref = String(food.sourceRef);
  const usda = food.source === "usda" ? (fndds.get(ref) ?? srLegacy.get(ref)) : null;
  if (usda) {
    const typical = usda.find((p) => /quantity not specified/i.test(p.label));
    if (typical) out.push({ label: "Typical serving", grams: round1(typical.grams) });
    for (const p of usda.sort((a, b) => a.seq - b.seq)) {
      if (/quantity not specified/i.test(p.label)) continue;
      out.push({ label: p.label.replace(/""/g, '"'), grams: round1(p.grams) });
    }
  }
  const own = food.portions ?? (food.portionSet ? portionsFor(food.portionSet) : []);
  for (const p of own) out.push({ label: p.label, grams: round1(p.grams) });
  if (!out.some((p) => p.grams === 100 && /100 g/.test(p.label))) out.push({ label: "100 g", grams: 100 });

  const seen = new Set();
  return out.filter((p) => {
    const k = p.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Item spec: "source:ref", or { ref, pick?, qty?, grams?, label? }.
 *   pick  — choose a named measure from the food's own servings by
 *           case-insensitive substring ("cupcake", "katori (small)"), so the
 *           default is USDA's or the household table's weight, not one typed
 *           here;
 *   qty   — how many of that serving the dish usually is (2 pav, 2 eggs);
 *   grams — a fixed household serving for a part of a combination dish.
 */
function resolve(item, where) {
  const spec = typeof item === "string" ? { ref: item } : item;
  const food = foods.get(spec.ref);
  if (!food) throw new Error(`${where}: ${spec.ref} is not in any food manifest`);
  const servings = servingsFor(food);
  let serving = servings[0];
  if (spec.grams) serving = { label: spec.label, grams: spec.grams };
  else if (spec.pick) {
    const want = spec.pick.toLowerCase();
    const hit = servings.find((s) => s.label.toLowerCase().includes(want));
    if (!hit) throw new Error(`${where}: no serving of ${food.name} contains "${spec.pick}" — have ${servings.map((s) => s.label).join(" | ")}`);
    serving = hit;
  }
  return {
    source: food.source,
    sourceRef: String(food.sourceRef),
    name: food.name,
    brand: food.brand ?? null,
    isVerified: Boolean(food.isVerified),
    vegFlag: food.vegFlag ?? "unknown",
    per100g: food.per100g,
    serving,
    defaultQty: spec.qty ?? 1,
    servings: spec.grams ? [serving, ...servings] : [serving, ...servings.filter((s) => s !== serving)],
  };
}

// ── assemble ──────────────────────────────────────────────────────────
const modelClasses = existsSync(MODEL_META)
  ? JSON.parse(readFileSync(MODEL_META, "utf8")).classes
  : Object.keys(VISION_CLASSES).sort();
if (!existsSync(MODEL_META)) console.warn(`! ${MODEL_META} not found — using the mapping's own class list`);

const missing = modelClasses.filter((k) => !VISION_CLASSES[k]);
if (missing.length) {
  console.error(`the model knows classes with no mapping: ${missing.join(", ")}`);
  process.exit(1);
}

const classes = {};
let empty = 0;
let unverified = 0;
for (const key of modelClasses) {
  const c = VISION_CLASSES[key];
  const items = c.items.map((it) => resolve(it, key));
  const alts = (c.alts ?? []).map((it) => resolve(it, `${key} (alt)`));
  if (items.length === 0) empty++;
  if (items.some((i) => !i.isVerified)) unverified++;
  classes[key] = { label: c.label, items, alts };
}

writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: modelClasses.length, classes }),
);
console.log(
  `wrote ${OUT}: ${modelClasses.length} classes — ${empty} with no trustworthy composition (search instead), ` +
    `${unverified} using label data`,
);
for (const key of ["samosa", "idli", "biryani", "rajma_curry", "chole_bhature", "pav_bhaji", "omelette", "kaathi_rolls", "cup_cakes"]) {
  const c = classes[key];
  if (!c) continue;
  const parts = c.items.map((i) => {
    const kcal = Math.round((i.per100g.kcal * i.serving.grams * i.defaultQty) / 100);
    return `${i.name} ${i.defaultQty} × ${i.serving.label} (${i.serving.grams} g) = ${kcal} kcal`;
  });
  console.log(`  ${c.label}: ${parts.join(" + ")}`);
}
