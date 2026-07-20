import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * Account record. `passwordHash` is absent for OAuth-only users;
 * `provider` records how the account was created so the UI can, e.g.,
 * hide the password-reset affordance for Google accounts.
 */
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, select: false }, // never returned unless explicitly requested
    image: { type: String },
    provider: { type: String, enum: ["credentials", "google"], default: "credentials" },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) || model<UserDoc>("User", UserSchema);
