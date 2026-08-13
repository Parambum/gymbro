import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import { MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";

const MUSCLE_SLUGS = MUSCLE_GROUPS.map((g) => g.slug);

export const SET_TYPES = ["WARMUP", "WORKING", "DROP", "FAILURE"] as const;
export type SetType = (typeof SET_TYPES)[number];

export const LOGGING_MODES = ["weight-reps", "reps", "time"] as const;
export type SetMode = (typeof LOGGING_MODES)[number];

/**
 * One logged set, embedded in a day's Workout. `_id` is kept so a single
 * set can be addressed for edit/delete. `e1rm` is the Epley estimate,
 * denormalized at write time so analytics never recompute on read.
 *
 * `mode` records how the set was measured: weight × reps, reps only
 * (bodyweight), or a timed hold. weight/reps carry sensible zero defaults so
 * a reps-only or timed set never trips a "required" validation.
 */
const SetSchema = new Schema(
  {
    exercise: { type: String, required: true, trim: true },
    muscleGroup: { type: String, required: true, enum: MUSCLE_SLUGS },
    mode: { type: String, enum: LOGGING_MODES, default: "weight-reps" },
    weight: { type: Number, default: 0, min: 0, max: 2000 }, // kg
    reps: { type: Number, default: 0, min: 0, max: 1000 },
    durationSec: { type: Number, default: null, min: 0, max: 86_400 }, // timed holds
    setType: { type: String, enum: SET_TYPES, default: "WORKING" },
    /** optional superset label ("A", "B", …) grouping sets across exercises */
    supersetGroup: { type: String, default: null },
    e1rm: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

/**
 * A training day. Deliberately NOT bound to a predefined split — a Workout
 * is just the bag of sets a user performed on `date`, spanning whatever
 * muscle groups they chose. One document per (user, calendar day); `date`
 * is a 'yyyy-mm-dd' string in the user's local zone to keep "which day"
 * unambiguous across timezones.
 */
const WorkoutSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    sets: { type: [SetSchema], default: [] },
  },
  { timestamps: true },
);

// one container per day per user; also the index the day-view query rides
WorkoutSchema.index({ userId: 1, date: 1 }, { unique: true });

export type SetEntry = InferSchemaType<typeof SetSchema> & { _id: mongoose.Types.ObjectId };
export type WorkoutDoc = InferSchemaType<typeof WorkoutSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Workout: Model<WorkoutDoc> =
  (models.Workout as Model<WorkoutDoc>) || model<WorkoutDoc>("Workout", WorkoutSchema);
