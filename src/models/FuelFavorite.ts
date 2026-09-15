import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * A one-tap re-log: a food, a portion and a quantity the user saved.
 *
 * This is what makes the "repeat meal in ≤ 3 taps" requirement achievable —
 * open Fuel, tap the favourite, tap the meal. Recents are derived from FuelLog
 * instead (a query, not a table), because a recent is a fact about history
 * while a favourite is a deliberate choice.
 */
const FuelFavoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    foodId: { type: Schema.Types.ObjectId, ref: "FuelFood", required: true },
    portionId: { type: Schema.Types.ObjectId, ref: "FuelPortion", default: null },
    quantity: { type: Number, default: 1, min: 0.01, max: 1000 },
    /** Optional nickname, e.g. "post-gym shake". Falls back to the food name. */
    label: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { timestamps: true },
);

FuelFavoriteSchema.index({ userId: 1, foodId: 1, portionId: 1 }, { unique: true });

export type FuelFavoriteDoc = InferSchemaType<typeof FuelFavoriteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelFavorite: Model<FuelFavoriteDoc> =
  (models.FuelFavorite as Model<FuelFavoriteDoc>) ||
  model<FuelFavoriteDoc>("FuelFavorite", FuelFavoriteSchema);
