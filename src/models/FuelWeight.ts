import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * One bodyweight reading per day.
 *
 * Raw only — the exponentially-weighted trend (§5.5) is computed on read by
 * `lib/fuel/trend.ts`, never stored. Storing a smoothed value would make the
 * series unfixable the moment the smoothing constant changed, and the raw dots
 * are shown on the chart anyway.
 *
 * This collection is also the answer to "what does the user weigh": the
 * calorie engine reads the latest row rather than a field on the profile.
 */
const FuelWeightSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    weightKg: { type: Number, required: true, min: 20, max: 400 },
    note: { type: String, default: null, maxlength: 200 },
  },
  { timestamps: true },
);

// one reading per day; re-weighing updates rather than appends
FuelWeightSchema.index({ userId: 1, localDate: 1 }, { unique: true });

export type FuelWeightDoc = InferSchemaType<typeof FuelWeightSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelWeight: Model<FuelWeightDoc> =
  (models.FuelWeight as Model<FuelWeightDoc>) ||
  model<FuelWeightDoc>("FuelWeight", FuelWeightSchema);
