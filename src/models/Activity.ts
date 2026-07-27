import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import { ACTIVITY_TYPES, ACTIVITY_SOURCES } from "@/lib/activity-types";

// The enums live in @/lib/activity-types so client components can import them
// without pulling Mongoose into the browser bundle. Re-exported here purely as
// a convenience for server code that already has the model in scope.
export { ACTIVITY_TYPES, ACTIVITY_SOURCES };
export type { ActivityType, ActivitySource } from "@/lib/activity-types";

/** One kilometre of the effort, precomputed at write time. */
const SplitSchema = new Schema(
  {
    km: { type: Number, required: true },
    timeS: { type: Number, required: true, min: 0 },
    paceSPerKm: { type: Number, required: true, min: 0 },
    elevGainM: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * A cardio session — Phase 2's counterpart to `Workout`.
 *
 * Strength lives in Workout (one doc per calendar day, many sets); cardio is
 * one doc per effort, because a run is a single continuous thing with its own
 * route and clock. `date` is kept as the same 'yyyy-mm-dd' local-day string
 * the strength side uses, so a combined calendar can join on it without
 * timezone gymnastics.
 *
 * `route` is stored simplified (see simplifyRoute) — full 1 Hz tracks are
 * needlessly heavy for a line that renders a few hundred pixels wide.
 */
const ActivitySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true, enum: ACTIVITY_TYPES, default: "RUN" },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    startedAt: { type: Date, required: true },

    distanceM: { type: Number, required: true, min: 0, max: 1_000_000 },
    movingTimeS: { type: Number, required: true, min: 0, max: 604_800 },
    elapsedTimeS: { type: Number, required: true, min: 0, max: 604_800 },
    elevationGainM: { type: Number, default: 0, min: 0 },

    /** denormalised so feed + analytics never recompute on read */
    avgPaceSPerKm: { type: Number, default: 0, min: 0 },
    avgHeartRate: { type: Number, default: null, min: 0, max: 260 },

    /** [[lat, lng], …] — empty for manually logged efforts with no GPS */
    route: { type: [[Number]], default: [] },
    splits: { type: [SplitSchema], default: [] },

    source: { type: String, required: true, enum: ACTIVITY_SOURCES, default: "MANUAL" },
    /** Strava's activity id — present only for imported efforts */
    stravaId: { type: Number, default: null },
    notes: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true },
);

// the feed query: newest-first for one athlete
ActivitySchema.index({ userId: 1, startedAt: -1 });
// makes re-syncing Strava idempotent — partial so manual logs (null) don't collide
ActivitySchema.index(
  { userId: 1, stravaId: 1 },
  { unique: true, partialFilterExpression: { stravaId: { $type: "number" } } },
);

export type SplitEntry = InferSchemaType<typeof SplitSchema>;
export type ActivityDoc = InferSchemaType<typeof ActivitySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Activity: Model<ActivityDoc> =
  (models.Activity as Model<ActivityDoc>) || model<ActivityDoc>("Activity", ActivitySchema);
