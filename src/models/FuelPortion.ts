import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import { PORTION_UNITS } from "@/lib/fuel/types";

/**
 * A named serving size for a food — "1 katori (medium)", "1 roti", "1 scoop".
 *
 * Separate from FuelFood because a single food has several, they are ordered,
 * and one of them is the default the picker opens on. The gram value is a
 * portion convention (how big a serving is), not nutrition data, so unlike
 * composition figures these are curated in `lib/fuel/portions.ts`.
 */
const FuelPortionSchema = new Schema(
  {
    foodId: { type: Schema.Types.ObjectId, ref: "FuelFood", required: true },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    grams: { type: Number, required: true, min: 0.1, max: 5000 },
    unit: { type: String, enum: PORTION_UNITS, default: "household" },
    /** Exactly one per food; what the portion sheet selects on open. */
    isDefault: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// the portion list for a food, already in display order
FuelPortionSchema.index({ foodId: 1, sortOrder: 1 });
// idempotent seeding: one row per (food, label)
FuelPortionSchema.index({ foodId: 1, label: 1 }, { unique: true });

export type FuelPortionDoc = InferSchemaType<typeof FuelPortionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelPortion: Model<FuelPortionDoc> =
  (models.FuelPortion as Model<FuelPortionDoc>) ||
  model<FuelPortionDoc>("FuelPortion", FuelPortionSchema);
