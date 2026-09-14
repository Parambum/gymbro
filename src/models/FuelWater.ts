import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * Water drunk on a day, in millilitres. One row per user per day; the glass
 * tap increments it with `$inc`, so a double tap adds two glasses — which is
 * the correct behaviour here, unlike food logging.
 */
const FuelWaterSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    ml: { type: Number, required: true, default: 0, min: 0, max: 20_000 },
  },
  { timestamps: true },
);

FuelWaterSchema.index({ userId: 1, localDate: 1 }, { unique: true });

export type FuelWaterDoc = InferSchemaType<typeof FuelWaterSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelWater: Model<FuelWaterDoc> =
  (models.FuelWater as Model<FuelWaterDoc>) || model<FuelWaterDoc>("FuelWater", FuelWaterSchema);
