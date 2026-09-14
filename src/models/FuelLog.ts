import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";
import { ENTRY_METHODS, MEALS } from "@/lib/fuel/types";

/**
 * One logged item. The centre of the module.
 *
 * **Snapshot rule (§4, critical).** Every macro is frozen into the row at the
 * moment of logging, along with the food's name. A food's composition can be
 * corrected upstream, a custom food can be renamed or deleted — and a day from
 * last March still reads exactly as it did. `foodId` is a pointer for "log this
 * again", never the source of the numbers on a past day.
 *
 * **Day identity.** `localDate` is the yyyy-mm-dd of the user's own calendar,
 * computed client-side by `localIso()` and posted, exactly as the strength
 * tracker does it; `loggedAt` is the UTC instant. Every "today" query uses
 * `localDate`, so a 1 a.m. snack in IST never lands on the previous UTC day.
 *
 * **Idempotency (§9).** The client mints a `clientId` per save attempt; a
 * unique sparse index makes the double-tap a no-op rather than a double log.
 */
const FuelLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    loggedAt: { type: Date, default: Date.now },
    meal: { type: String, enum: MEALS, required: true },

    /** null for a quick-add: raw macros with no food behind them. */
    foodId: { type: Schema.Types.ObjectId, ref: "FuelFood", default: null },
    recipeId: { type: Schema.Types.ObjectId, ref: "FuelRecipe", default: null },
    portionId: { type: Schema.Types.ObjectId, ref: "FuelPortion", default: null },

    /** Denormalised so history survives a renamed or deleted food. */
    foodName: { type: String, required: true, trim: true, maxlength: 160 },
    portionLabel: { type: String, default: null, maxlength: 60 },

    quantity: { type: Number, required: true, min: 0, max: 1000 },
    unit: { type: String, default: "household", maxlength: 20 },
    gramsResolved: { type: Number, required: true, min: 0, max: 10_000 },

    // ── the snapshot ──────────────────────────────────────────────────
    kcal: { type: Number, required: true, min: 0, max: 20_000 },
    proteinG: { type: Number, required: true, min: 0, max: 2000 },
    carbsG: { type: Number, required: true, min: 0, max: 2000 },
    fatG: { type: Number, required: true, min: 0, max: 2000 },
    fiberG: { type: Number, default: 0, min: 0, max: 500 },

    entryMethod: { type: String, enum: ENTRY_METHODS, required: true },

    // ── AI provenance (photo / natural-language paths) ────────────────
    /** 0–1 from the vision or parsing model; null for anything human-entered. */
    confidence: { type: Number, default: null, min: 0, max: 1 },
    /** The model's own uncertainty band on calories, [low, high]. */
    calorieRange: { type: [Number], default: undefined },
    /** e.g. "assumed cooked in 1 tsp oil" — shown on the row, never hidden. */
    assumptions: { type: String, default: null, maxlength: 400 },
    /**
     * Did the user change the model's guess before saving? The signal that
     * makes vision accuracy measurable later. Always false on manual paths.
     */
    wasEdited: { type: Boolean, default: false },
    /**
     * Reserved for a future private blob store. v1 never persists the photo:
     * the image is sent to the vision API in memory and dropped (see README).
     */
    photoUrl: { type: String, default: null },

    /** Client-minted idempotency key; see the unique index below. */
    clientId: { type: String, default: null },
  },
  { timestamps: true },
);

// the day view, and every rolling-window aggregate
FuelLogSchema.index({ userId: 1, localDate: 1 });
// "log it again" — the recents list
FuelLogSchema.index({ userId: 1, loggedAt: -1 });
// double-tap protection: the second write of the same attempt is rejected
FuelLogSchema.index({ userId: 1, clientId: 1 }, { unique: true, sparse: true });

export type FuelLogDoc = InferSchemaType<typeof FuelLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelLog: Model<FuelLogDoc> =
  (models.FuelLog as Model<FuelLogDoc>) || model<FuelLogDoc>("FuelLog", FuelLogSchema);
