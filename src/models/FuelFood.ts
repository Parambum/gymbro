import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import { FOOD_SOURCES, VEG_FLAGS } from "@/lib/fuel/types";

/**
 * One food, stored per 100 g so every portion is a multiplication.
 *
 * Global rows (`ownerUserId: null`) are the seeded database, fetched from USDA
 * and Open Food Facts by `scripts/import-usda.mjs`. Per-user rows are
 * custom foods and saved recipes, visible only to their owner.
 *
 * `isVerified` is the honesty flag from §12: it is true only when the numbers
 * came out of a published composition database, and the UI badges everything
 * else as unverified. Nothing in this collection is ever hand-written from
 * memory.
 */
const Per100gSchema = new Schema(
  {
    kcal: { type: Number, required: true, min: 0, max: 900 },
    proteinG: { type: Number, required: true, min: 0, max: 100 },
    carbsG: { type: Number, required: true, min: 0, max: 100 },
    fatG: { type: Number, required: true, min: 0, max: 100 },
    fiberG: { type: Number, default: 0, min: 0, max: 100 },
    sugarG: { type: Number, default: 0, min: 0, max: 100 },
    sodiumMg: { type: Number, default: 0, min: 0, max: 40_000 },
  },
  { _id: false },
);

const FuelFoodSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    brand: { type: String, default: null, trim: true, maxlength: 120 },

    source: { type: String, enum: FOOD_SOURCES, required: true },
    /** USDA fdcId, OFF barcode, or the recipe's _id — whatever identifies it upstream. */
    sourceRef: { type: String, default: null },
    isVerified: { type: Boolean, default: false },

    per100g: { type: Per100gSchema, required: true },

    vegFlag: { type: String, enum: VEG_FLAGS, default: "unknown" },
    /** null = global, visible to everyone. Otherwise scoped to one user. */
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    /**
     * Lower-cased name + brand + aliases, joined. The text index rides this;
     * the in-process ranker fuzzy-matches against it too.
     */
    searchText: { type: String, required: true },
    /**
     * Spelling and language variants so "dhal", "daal" and "dal" all hit, and
     * so "curd" finds dahi (§6). Curated per seed item, never generated.
     */
    aliases: { type: [String], default: [] },

    /** Set for anything that came in from a barcode scan. */
    barcode: { type: String, default: null },

    /** How often this food gets logged across all users — a search ranking input. */
    popularity: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// full-text search over name + aliases
FuelFoodSchema.index({ searchText: "text", aliases: "text" });
// the owner's own foods, alphabetical
FuelFoodSchema.index({ ownerUserId: 1, name: 1 });
// idempotent seeding: one row per upstream record
FuelFoodSchema.index({ source: 1, sourceRef: 1 }, { unique: true, sparse: true });
// barcode lookups
FuelFoodSchema.index({ barcode: 1 }, { sparse: true });

export type FuelFoodDoc = InferSchemaType<typeof FuelFoodSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelFood: Model<FuelFoodDoc> =
  (models.FuelFood as Model<FuelFoodDoc>) || model<FuelFoodDoc>("FuelFood", FuelFoodSchema);
