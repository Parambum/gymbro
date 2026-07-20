import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import { MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";

const MUSCLE_SLUGS = MUSCLE_GROUPS.map((g) => g.slug);

/**
 * A user-created custom exercise. The 180-entry base library lives in code
 * (exercise-catalog.ts) — only user additions are persisted here, tied to
 * their userId. The API merges the two when populating a muscle's picker.
 */
const ExerciseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    muscleGroup: { type: String, required: true, enum: MUSCLE_SLUGS },
  },
  { timestamps: true },
);

// one custom name per muscle per user — blocks accidental duplicates
ExerciseSchema.index({ userId: 1, muscleGroup: 1, name: 1 }, { unique: true });

export type ExerciseDoc = InferSchemaType<typeof ExerciseSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Exercise: Model<ExerciseDoc> =
  (models.Exercise as Model<ExerciseDoc>) || model<ExerciseDoc>("Exercise", ExerciseSchema);
