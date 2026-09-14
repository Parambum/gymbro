import mongoose, { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * A user-built food: N ingredients, divided into servings.
 *
 * Saving a recipe also writes a companion FuelFood (source `recipe`, owned by
 * the same user) holding the per-100g composition of the finished dish — so a
 * recipe is searchable and loggable through exactly the same path as any other
 * food, with no special case in the logging flow. `foodId` links the two.
 *
 * Ingredients keep a name snapshot for the same reason FuelLog does: deleting
 * an ingredient food must not blank out a recipe the user still cooks.
 */
const RecipeItemSchema = new Schema(
  {
    foodId: { type: Schema.Types.ObjectId, ref: "FuelFood", required: true },
    foodName: { type: String, required: true, trim: true, maxlength: 160 },
    grams: { type: Number, required: true, min: 0.1, max: 20_000 },
  },
  { _id: true },
);

const FuelRecipeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    servings: { type: Number, required: true, min: 1, max: 100 },
    /** Sum of ingredient grams; cooking loss is the user's to adjust. */
    totalGrams: { type: Number, required: true, min: 1 },
    items: { type: [RecipeItemSchema], default: [] },
    /** The generated FuelFood this recipe is logged through. */
    foodId: { type: Schema.Types.ObjectId, ref: "FuelFood", default: null },
  },
  { timestamps: true },
);

FuelRecipeSchema.index({ userId: 1, name: 1 });

export type FuelRecipeDoc = InferSchemaType<typeof FuelRecipeSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FuelRecipe: Model<FuelRecipeDoc> =
  (models.FuelRecipe as Model<FuelRecipeDoc>) ||
  model<FuelRecipeDoc>("FuelRecipe", FuelRecipeSchema);
