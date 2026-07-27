import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * Strava OAuth grant for one GymBro user.
 *
 * Deliberately its own collection rather than fields on `User`: the user doc
 * is read on every authenticated request, and access tokens have no business
 * riding along with it. One grant per user; disconnecting deletes the row,
 * which is the whole revocation story locally.
 */
const StravaAccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    stravaAthleteId: { type: Number, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    /** absolute expiry of `accessToken`; Strava tokens live ~6 hours */
    expiresAt: { type: Date, required: true },
    scope: { type: String, default: "" },
    athleteName: { type: String, default: "" },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type StravaAccountDoc = InferSchemaType<typeof StravaAccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const StravaAccount: Model<StravaAccountDoc> =
  (models.StravaAccount as Model<StravaAccountDoc>) ||
  model<StravaAccountDoc>("StravaAccount", StravaAccountSchema);
