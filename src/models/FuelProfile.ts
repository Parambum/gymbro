import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import {
  ACTIVITY_SLUGS,
  DIET_PREFS,
  GOALS,
  MACRO_PRESET_SLUGS,
  SEXES,
  UNIT_SYSTEMS,
} from "@/lib/fuel/types";

/**
 * The answers onboarding collects, and the switches the module runs on.
 * One document per user.
 *
 * Deliberately NOT stored here: current bodyweight. That lives in FuelWeight,
 * one row per day, so there is exactly one source of truth for "what do they
 * weigh" and the trend line and the calorie engine can never disagree. The
 * engine reads the latest FuelWeight row; onboarding writes the first one.
 *
 * Also not stored here: the calorie target. See FuelTarget — targets are an
 * append-only history, never a mutable field.
 */
const FuelProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    sex: { type: String, enum: SEXES, required: true },
    /** yyyy-mm-dd. Stored rather than `age` so it never silently goes stale. */
    birthDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    heightCm: { type: Number, required: true, min: 80, max: 250 },

    activityLevel: { type: String, enum: ACTIVITY_SLUGS, required: true },
    goal: { type: String, enum: GOALS, required: true },
    /** Always positive; `goal` carries the direction. 0 for maintain. */
    rateKgPerWeek: { type: Number, default: 0, min: 0, max: 2 },
    targetWeightKg: { type: Number, default: null, min: 20, max: 400 },

    dietPref: { type: String, enum: DIET_PREFS, default: "veg" },
    macroPreset: { type: String, enum: MACRO_PRESET_SLUGS, default: "balanced" },
    units: { type: String, enum: UNIT_SYSTEMS, default: "metric" },
    /** IANA zone, e.g. "Asia/Kolkata". Only server-side rollovers need it — */
    /** every read path uses the client-supplied localDate, as /api/workouts does. */
    tz: { type: String, default: "Asia/Kolkata" },

    /**
     * §5.6 — hides calorie and weight numbers while keeping protein and habit
     * tracking. A real setting for people for whom a calorie count is harmful.
     */
    eyesOffMode: { type: Boolean, default: false },

    /**
     * §8.2 — adding exercise calories back is the single biggest source of
     * over-eating error, and the activity multiplier already covers training.
     * Offered for clone fidelity, off unless the user goes looking for it.
     */
    exerciseCaloriesEnabled: { type: Boolean, default: false },
    /** §8.1 — shift the deficit to rest days. Off by default. */
    calorieCyclingEnabled: { type: Boolean, default: false },

    onboardedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export type FuelProfileDoc = InferSchemaType<typeof FuelProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelProfile: Model<FuelProfileDoc> =
  (models.FuelProfile as Model<FuelProfileDoc>) ||
  model<FuelProfileDoc>("FuelProfile", FuelProfileSchema);
