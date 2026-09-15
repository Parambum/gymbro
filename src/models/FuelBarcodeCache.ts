import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * Barcode → food, so the second person to scan a packet of biscuits never
 * waits on Open Food Facts. Also the record of a *miss*: `foodId: null` with a
 * recent `fetchedAt` means OFF genuinely does not know this barcode, and the
 * UI can say "not in the database — create it?" instantly instead of making
 * every scan pay the round trip.
 */
const FuelBarcodeCacheSchema = new Schema(
  {
    barcode: { type: String, required: true, unique: true, trim: true },
    foodId: { type: Schema.Types.ObjectId, ref: "FuelFood", default: null },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export type FuelBarcodeCacheDoc = InferSchemaType<typeof FuelBarcodeCacheSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelBarcodeCache: Model<FuelBarcodeCacheDoc> =
  (models.FuelBarcodeCache as Model<FuelBarcodeCacheDoc>) ||
  model<FuelBarcodeCacheDoc>("FuelBarcodeCache", FuelBarcodeCacheSchema);
