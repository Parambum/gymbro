/**
 * Seed the Fuel collections into MongoDB, and create their indexes.
 *
 *   node scripts/seed-fuel.mjs           # create indexes + upsert the food database
 *   node scripts/seed-fuel.mjs --prune   # also delete seeded foods dropped from the JSON
 *   node scripts/seed-fuel.mjs --indexes # indexes only, no data
 *
 * Mongo has no migration files, so this script *is* the migration: it is the
 * one place that declares every Fuel index, and it is safe to run repeatedly —
 * `createIndex` and the upserts are both idempotent.
 *
 * It never touches a user's own rows: only global foods (`ownerUserId: null`)
 * sourced from USDA are written, and `--prune` only ever removes those.
 * Custom foods, recipes and logs are out of its reach by construction.
 *
 * Run `node scripts/fetch-fuel-foods.mjs` first to produce the JSON.
 */
import { readFileSync, existsSync } from "node:fs";
import mongoose from "mongoose";
import { portionsFor } from "./fuel/portion-sets.mjs";

const FOODS_JSON = "src/lib/data/fuel-foods.json";
const args = process.argv.slice(2);
const prune = args.includes("--prune");
const indexesOnly = args.includes("--indexes");

const MONGODB_URI = readEnv("MONGODB_URI");
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Copy .env.example to .env and add your Atlas string.");
  process.exit(1);
}

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  if (existsSync(".env")) {
    const m = readFileSync(".env", "utf8").match(
      new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"),
    );
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Every index the Fuel module relies on, mirroring the `schema.index(...)`
 * declarations in src/models/Fuel*.ts. Kept here as well because Mongoose only
 * builds indexes lazily on first model use, and a cold production deploy
 * should not be the thing that discovers a missing unique constraint.
 */
const INDEXES = [
  ["fuelprofiles", { userId: 1 }, { unique: true }],

  ["fueltargets", { userId: 1, effectiveFrom: -1 }, {}],

  ["fuelfoods", { searchText: "text", aliases: "text" }, { name: "fuel_food_text" }],
  ["fuelfoods", { ownerUserId: 1, name: 1 }, {}],
  ["fuelfoods", { source: 1, sourceRef: 1 }, { unique: true, sparse: true }],
  ["fuelfoods", { barcode: 1 }, { sparse: true }],

  ["fuelportions", { foodId: 1, sortOrder: 1 }, {}],
  ["fuelportions", { foodId: 1, label: 1 }, { unique: true }],

  ["fuellogs", { userId: 1, localDate: 1 }, {}],
  ["fuellogs", { userId: 1, loggedAt: -1 }, {}],
  ["fuellogs", { userId: 1, clientId: 1 }, { unique: true, sparse: true }],

  ["fuelrecipes", { userId: 1, name: 1 }, {}],

  ["fuelweights", { userId: 1, localDate: 1 }, { unique: true }],
  ["fuelwaters", { userId: 1, localDate: 1 }, { unique: true }],
  ["fuelstreaks", { userId: 1 }, { unique: true }],
  ["fuelfavorites", { userId: 1, foodId: 1, portionId: 1 }, { unique: true }],
  ["fuelbarcodecaches", { barcode: 1 }, { unique: true }],
];

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;
  console.log(`connected to ${mongoose.connection.name}`);

  // ── indexes ────────────────────────────────────────────────────────
  let made = 0;
  for (const [collection, spec, options] of INDEXES) {
    try {
      await db.collection(collection).createIndex(spec, options);
      made += 1;
    } catch (err) {
      console.error(`  ! index on ${collection} ${JSON.stringify(spec)}: ${err.message}`);
    }
  }
  console.log(`indexes ensured: ${made}/${INDEXES.length}`);

  if (indexesOnly) return;

  // ── food database ──────────────────────────────────────────────────
  if (!existsSync(FOODS_JSON)) {
    console.error(
      `\n${FOODS_JSON} not found.\n` +
        "Run `node scripts/fetch-fuel-foods.mjs` first — it fetches real composition\n" +
        "data from USDA. Nothing in the food database is written by hand.",
    );
    process.exitCode = 1;
    return;
  }

  const { foods } = JSON.parse(readFileSync(FOODS_JSON, "utf8"));
  if (!Array.isArray(foods) || foods.length === 0) {
    console.error(`${FOODS_JSON} contains no foods — nothing to seed.`);
    process.exitCode = 1;
    return;
  }

  const now = new Date();

  /**
   * Write in batches. A single bulkWrite of 13,000 upserts plus ~50,000
   * portions builds one enormous command and, on a small Atlas tier, times
   * out. Batching also means a failure part-way leaves a usable database
   * rather than nothing.
   */
  const BATCH = 500;
  async function inBatches(label, ops, collection) {
    let inserted = 0;
    let modified = 0;
    for (let i = 0; i < ops.length; i += BATCH) {
      const res = await db.collection(collection).bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
      inserted += res.upsertedCount;
      modified += res.modifiedCount;
      process.stdout.write(`\r  ${label}: ${Math.min(i + BATCH, ops.length)}/${ops.length}`);
    }
    process.stdout.write("\r".padEnd(60) + "\r");
    return { inserted, modified };
  }

  const foodOps = foods.map((f) => ({
    updateOne: {
      filter: { source: "usda", sourceRef: f.sourceRef },
      update: {
        $set: {
          name: f.name,
          brand: null,
          isVerified: Boolean(f.isVerified),
          per100g: f.per100g,
          vegFlag: f.vegFlag,
          ownerUserId: null,
          aliases: f.aliases ?? [],
          searchText: [f.name, ...(f.aliases ?? [])].join(" ").toLowerCase(),
          updatedAt: now,
        },
        $setOnInsert: { popularity: 0, barcode: null, createdAt: now },
      },
      upsert: true,
    },
  }));

  const foodRes = await inBatches("foods", foodOps, "fuelfoods");
  console.log(
    `foods: ${foodRes.inserted} inserted, ${foodRes.modified} updated, ${foods.length} in manifest`,
  );

  // ── portions (need the food _ids, so this is a second pass) ─────────
  const refs = foods.map((f) => f.sourceRef);
  const saved = await db
    .collection("fuelfoods")
    .find({ source: "usda", sourceRef: { $in: refs } }, { projection: { sourceRef: 1 } })
    .toArray();
  const idByRef = new Map(saved.map((d) => [d.sourceRef, d._id]));

  const portionOps = [];
  for (const f of foods) {
    const foodId = idByRef.get(f.sourceRef);
    if (!foodId) continue;
    // `portionSet` is a name; expand it here so the gram conventions have one
    // home. Older manifests inlined `portions`, so both are accepted.
    const rows = f.portions ?? (f.portionSet ? portionsFor(f.portionSet) : []);
    for (const p of rows) {
      portionOps.push({
        updateOne: {
          filter: { foodId, label: p.label },
          update: {
            $set: {
              grams: p.grams,
              unit: p.unit,
              isDefault: Boolean(p.isDefault),
              sortOrder: p.sortOrder,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      });
    }
  }

  if (portionOps.length > 0) {
    const portionRes = await inBatches("portions", portionOps, "fuelportions");
    console.log(
      `portions: ${portionRes.inserted} inserted, ${portionRes.modified} updated, ` +
        `${portionOps.length} in manifest`,
    );
  }

  // ── prune foods that left the manifest ─────────────────────────────
  if (prune) {
    const stale = await db
      .collection("fuelfoods")
      .find(
        { source: "usda", ownerUserId: null, sourceRef: { $nin: refs } },
        { projection: { _id: 1 } },
      )
      .toArray();
    if (stale.length > 0) {
      const ids = stale.map((d) => d._id);
      await db.collection("fuelportions").deleteMany({ foodId: { $in: ids } });
      await db.collection("fuelfoods").deleteMany({ _id: { $in: ids } });
      console.log(`pruned ${stale.length} seeded food(s) no longer in the manifest`);
    } else {
      console.log("prune: nothing stale");
    }
  }
}

main()
  .catch((err) => {
    console.error(`\nseed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
