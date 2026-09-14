import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * Logging streak, maintained on write so the dashboard never has to scan the
 * whole log to render a number.
 *
 * Framing matters here (§5.6): a broken streak is reported as a fact and never
 * as a failure — there is no guilt copy anywhere downstream of this document.
 */
const FuelStreakSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    current: { type: Number, default: 0, min: 0 },
    longest: { type: Number, default: 0, min: 0 },
    lastLoggedDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { timestamps: true },
);

export type FuelStreakDoc = InferSchemaType<typeof FuelStreakSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelStreak: Model<FuelStreakDoc> =
  (models.FuelStreak as Model<FuelStreakDoc>) ||
  model<FuelStreakDoc>("FuelStreak", FuelStreakSchema);
