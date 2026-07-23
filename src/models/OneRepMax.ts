import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import { MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";

const MUSCLE_SLUGS = MUSCLE_GROUPS.map((g) => g.slug);

/**
 * A user's *recorded* one-rep max for a main lift — an actual tested single,
 * distinct from the Epley e1RM estimate. Upserted per (user, exercise): one
 * standing record, updated when they hit (or manually enter) a heavier max.
 */
const OneRepMaxSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    exercise: { type: String, required: true, trim: true },
    muscleGroup: { type: String, required: true, enum: MUSCLE_SLUGS },
    oneRepMax: { type: Number, required: true, min: 0, max: 2000 }, // kg
    /** how it was set: an actual 1-rep lift, or a manual entry */
    source: { type: String, enum: ["logged", "manual"], default: "manual" },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

OneRepMaxSchema.index({ userId: 1, exercise: 1 }, { unique: true });

export type OneRepMaxDoc = InferSchemaType<typeof OneRepMaxSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const OneRepMax: Model<OneRepMaxDoc> =
  (models.OneRepMax as Model<OneRepMaxDoc>) || model<OneRepMaxDoc>("OneRepMax", OneRepMaxSchema);
