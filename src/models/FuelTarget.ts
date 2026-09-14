import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * A calorie + macro target, effective from a date.
 *
 * **Append-only.** Recalculating never overwrites: it inserts a new row with a
 * later `effectiveFrom`, so a day in the past is always read against the target
 * that was actually in force at the time. Without this, a user who raises their
 * target in March would see every January day retroactively "under-eaten".
 *
 * The target for a given day is therefore: the newest row whose
 * `effectiveFrom <= thatDay`.
 */
const FuelTargetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    effectiveFrom: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

    kcal: { type: Number, required: true, min: 0 },
    proteinG: { type: Number, required: true, min: 0 },
    carbsG: { type: Number, required: true, min: 0 },
    fatG: { type: Number, required: true, min: 0 },
    fiberG: { type: Number, required: true, min: 0 },
    waterMl: { type: Number, required: true, min: 0 },

    source: { type: String, enum: ["auto", "manual"], default: "auto" },

    /**
     * True when the maths had to assume something — currently only when the
     * user declined to state sex and the BMR is the average of both formulas
     * (§5.1). The UI labels such a target "estimated".
     */
    isEstimate: { type: Boolean, default: false },

    /**
     * Plain-language notes the UI shows beneath the target, one line each:
     * why a rate was capped (§5.3), why a floor was applied (§5.6). Generated
     * by the engine, never free text from the client.
     */
    notes: { type: [String], default: [] },

    /** The inputs this target was computed from, kept for auditability. */
    basis: {
      weightKg: { type: Number, default: null },
      bmr: { type: Number, default: null },
      tdee: { type: Number, default: null },
    },
  },
  { timestamps: true },
);

// "the target in force on date X" — a reverse-ordered range scan per user
FuelTargetSchema.index({ userId: 1, effectiveFrom: -1 });

export type FuelTargetDoc = InferSchemaType<typeof FuelTargetSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelTarget: Model<FuelTargetDoc> =
  (models.FuelTarget as Model<FuelTargetDoc>) ||
  model<FuelTargetDoc>("FuelTarget", FuelTargetSchema);
