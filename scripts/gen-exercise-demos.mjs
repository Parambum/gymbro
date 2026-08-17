/**
 * Generate src/lib/data/exercise-demos.ts by matching our exercise catalog
 * to the public-domain yuhonas/free-exercise-db.
 *
 *   node scripts/gen-exercise-demos.mjs          # regenerate the demo map
 *   node scripts/gen-exercise-demos.mjs --audit  # also print name → matched DB entry
 *
 * FIXING A WRONG DEMO: add a line to OVERRIDES below mapping our exercise
 * name to the exact free-exercise-db name (see the --audit list for the
 * available names), then re-run. Overrides always win over fuzzy matching.
 *
 * The dataset (~1 MB) is cached to scripts-tmp/exercises.json (gitignored)
 * and downloaded on first run.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const DATASET_URL = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json";
const CACHE = "scripts-tmp/exercises.json";
const audit = process.argv.includes("--audit");

async function loadDataset() {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, "utf8"));
  mkdirSync("scripts-tmp", { recursive: true });
  const res = await fetch(DATASET_URL);
  if (!res.ok) throw new Error(`dataset download failed: ${res.status}`);
  const text = await res.text();
  writeFileSync(CACHE, text);
  return JSON.parse(text);
}

const db = await loadDataset();
const byExactName = new Map(db.map((e) => [e.name, e]));
const catalog = readFileSync("src/lib/data/exercise-catalog.ts", "utf8");

// pull { slug, exercises[] } groups out of the catalog source
const ours = [];
for (const m of catalog.matchAll(/slug:\s*"([^"]+)"[\s\S]*?exercises:\s*\[([\s\S]*?)\]/g)) {
  for (const s of m[2].matchAll(/"([^"]+)"/g)) ours.push({ name: s[1], slug: m[1] });
}

const norm = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").map((t) => t.replace(/s$/, "")).filter(Boolean);

// our muscle slug → their muscle vocabulary (match tie-break bonus)
const MUSCLE_MAP = {
  chest: ["chest"], back: ["lats", "middle back", "lower back", "traps"],
  shoulders: ["shoulders"], traps: ["traps"], biceps: ["biceps"], triceps: ["triceps"],
  forearms: ["forearms"], quads: ["quadriceps"], "hams-glutes": ["hamstrings", "glutes"],
  calves: ["calves"], abs: ["abdominals"],
};

// Distinguishing modifiers: if our name has one and a candidate doesn't (or
// vice-versa) they are almost certainly different exercises. "flat"/"standing"
// are excluded because the dataset usually leaves them implicit. Note tokens
// are singularised by norm() (e.g. "dips"→"dip", "ups"→"up").
const MODIFIERS = new Set([
  "incline", "decline", "close", "wide", "narrow", "neutral", "reverse", "seated",
  "bent", "lying", "kneeling", "prone", "sumo", "front", "hack", "goblet", "zercher",
  "bulgarian", "pendlay", "arnold", "spider", "preacher", "concentration", "hammer",
  "drag", "zottman", "romanian", "stiff", "deficit", "landmine", "meadow", "pendulum",
  "sissy", "nordic", "frog", "curtsy", "single", "one", "behind", "cross", "diamond",
  "smith", "machine", "cable", "barbell", "dumbbell", "ez", "chin", "push", "pull", "dip",
]);

const OVERRIDES = {
  "Flat Barbell Bench Press": "Barbell Bench Press - Medium Grip",
  "Incline Barbell Bench Press": "Barbell Incline Bench Press - Medium Grip",
  "Flat Dumbbell Bench Press": "Dumbbell Bench Press",
  "Incline Dumbbell Bench Press": "Incline Dumbbell Press",
  "Conventional Deadlift": "Barbell Deadlift",
  "Push-ups": "Pushups",
  "Pull-up": "Pullups",
  "Weighted Pull-up": "Pullups",
  "Chin-up": "Chin-Up",
  "Chin-up (Bicep Focus)": "Chin-Up",
  "Side Plank": "Side Bridge",
  "Barbell Back Squat": "Barbell Full Squat",
  "Front Squat": "Front Barbell Squat",
  "Standing Overhead Barbell Press": "Standing Military Press",
  "Seated Barbell Shoulder Press": "Barbell Shoulder Press",
  "Barbell Bent-Over Row": "Bent Over Barbell Row",
  "Seated Cable Row": "Seated Cable Rows",
  "Lat Pulldown (Wide Grip)": "Wide-Grip Lat Pulldown",
  "Standing Dumbbell Curl": "Dumbbell Bicep Curl",

  // cross-muscle / wrong-variant fixes found via --audit
  "Cable Chest Fly (High-to-Low)": "Cable Crossover",
  "Cable Chest Fly (Low-to-High)": "Incline Cable Flye",
  "Weighted Push-ups": "Pushups",
  "Single-Arm Lat Pulldown": "One Arm Lat Pulldown",
  "Chest-Supported Row": "Dumbbell Incline Row",
  "Machine High Row": "Leverage High Row",
  "Smith Machine Row": "Smith Machine Bent Over Row",
  "Machine Lateral Raise": "Lateral Raise - With Bands",
  "Rear Delt Dumbbell Fly": "Cable Rear Delt Fly",
  "Trap Bar Shrug": "Barbell Shrug",
  "Smith Machine Shrug": "Barbell Shrug",
  "Preacher Curl (EZ-Bar)": "Preacher Curl",
  "Cable Rope Pushdown": "Triceps Pushdown - Rope Attachment",
  "Cable Straight-Bar Pushdown": "Triceps Pushdown",
  "Single-Arm Cable Pushdown": "Triceps Pushdown",
  "Cable Kickback": "Tricep Dumbbell Kickback",
  "Glute Bridge": "Butt Lift (Bridge)",
  "Single-Leg Standing Calf Raise": "Standing Calf Raises",
  "Bent-Knee Calf Raise": "Seated Calf Raise",
  "Cable Woodchopper": "Standing Cable Wood Chop",
  "Bicycle Crunch": "Air Bike",
  "Toes-to-Bar": "Hanging Leg Raise",
  "Pendlay Row": "Bent Over Barbell Row",
  "Diamond Push-up": "Pushups",
};

// No honest match in the dataset → force the clean "No demo" fallback rather
// than show a misleading clip.
const NO_DEMO = new Set([
  "Weighted Wall Sit",
  "Jump Rope (Calf Focus)",
  "L-Sit Hold",
  "V-Up",
]);

const dbTokens = db.map((e) => ({ e, toks: new Set(norm(e.name)) }));

let matched = 0;
const missing = [];
const auditRows = [];
const out = {};

for (const { name, slug } of ours) {
  if (out[name]) continue;

  if (NO_DEMO.has(name)) {
    missing.push(`${name} (${slug}) [forced]`);
    auditRows.push([name, "— NO DEMO (forced) —"]);
    continue;
  }

  const ov = OVERRIDES[name] && byExactName.get(OVERRIDES[name]);
  if (ov?.images?.length) {
    out[name] = { images: ov.images, primary: ov.primaryMuscles ?? [], secondary: ov.secondaryMuscles ?? [] };
    auditRows.push([name, `${ov.name}  (override)`]);
    matched++;
    continue;
  }

  const ourSet = new Set(norm(name));
  const wantMuscles = new Set(MUSCLE_MAP[slug] ?? []);
  let best = null;
  let bestScore = 0;
  let bestShared = 0;

  for (const { e, toks } of dbTokens) {
    let shared = 0;
    for (const t of ourSet) if (toks.has(t)) shared++;
    if (shared === 0) continue;

    // hard penalty for every distinguishing modifier that only one side has
    let modPenalty = 0;
    for (const m of MODIFIERS) if (ourSet.has(m) !== toks.has(m)) modPenalty += 4;

    const extra = toks.size - shared;
    const muscleBonus = (e.primaryMuscles ?? []).some((mm) => wantMuscles.has(mm)) ? 1.5 : 0;
    const score = shared * 2 + muscleBonus - extra * 0.15 - modPenalty;
    if (score > bestScore) { bestScore = score; best = e; bestShared = shared; }
  }

  const muscleOk = best && (best.primaryMuscles ?? []).some((mm) => wantMuscles.has(mm));
  if (best?.images?.length && (bestShared >= 2 || (bestShared >= 1 && muscleOk))) {
    out[name] = { images: best.images, primary: best.primaryMuscles ?? [], secondary: best.secondaryMuscles ?? [] };
    auditRows.push([name, best.name]);
    matched++;
  } else {
    missing.push(`${name} (${slug})`);
    auditRows.push([name, "— NO MATCH —"]);
  }
}

const entries = Object.entries(out)
  .map(([k, v]) => `  ${JSON.stringify(k)}: { images: ${JSON.stringify(v.images)}, primary: ${JSON.stringify(v.primary)}, secondary: ${JSON.stringify(v.secondary)} },`)
  .join("\n");

writeFileSync(
  "src/lib/data/exercise-demos.ts",
  `// AUTO-GENERATED from yuhonas/free-exercise-db (public domain / Unlicense).
// Regenerate with: node scripts/gen-exercise-demos.mjs
// Fix a wrong demo by adding to OVERRIDES in that script, then re-run.
export const DEMO_CDN = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/";

export interface ExerciseDemo {
  /** relative image paths under DEMO_CDN — [start, end] frames of the movement */
  images: string[];
  primary: string[];
  secondary: string[];
}

export const EXERCISE_DEMOS: Record<string, ExerciseDemo> = {
${entries}
};

export function exerciseDemo(name: string): ExerciseDemo | undefined {
  return EXERCISE_DEMOS[name];
}
`,
);

console.log(`matched ${matched}/${ours.length}; ${missing.length} unmatched`);
if (audit) {
  writeFileSync("scripts-tmp/demo-audit.txt", auditRows.map(([a, b]) => `${a.padEnd(34)} → ${b}`).join("\n"));
  console.log("\n" + auditRows.map(([a, b]) => `${a.padEnd(34)} → ${b}`).join("\n"));
}
