import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { FuelFood } from "@/models/FuelFood";
import { FuelPortion } from "@/models/FuelPortion";
import { FuelRecipe } from "@/models/FuelRecipe";
import { createFood, fuelGuard } from "@/lib/fuel/server";
import { FuelRecipeSchema } from "@/lib/validation";
import { recipePer100g } from "@/lib/fuel/recipe";

export const runtime = "nodejs";

/**
 * POST /api/fuel/recipes — build a food out of N ingredients.
 *
 * Saving a recipe writes two documents: the recipe itself (so it can be
 * edited later) and a companion FuelFood holding the finished dish's per-100g
 * composition. Logging then goes through the ordinary food path with no
 * special case anywhere — the portion picker offers "1 serving" because the
 * recipe knows its own serving weight.
 *
 * Ingredient names are snapshotted into the recipe for the same reason log
 * entries snapshot theirs: deleting an ingredient must not blank out a recipe
 * the user still cooks.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const parsed = FuelRecipeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const r = parsed.data;

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    // Only foods this user can actually see may go into a recipe.
    const ids = r.items.map((i) => new Types.ObjectId(i.foodId));
    const foods = await FuelFood.find({
      _id: { $in: ids },
      $or: [{ ownerUserId: null }, { ownerUserId: uid }],
    }).lean();

    if (foods.length !== new Set(r.items.map((i) => i.foodId)).size) {
      return NextResponse.json({ error: "One of those ingredients no longer exists." }, { status: 404 });
    }

    const byId = new Map(foods.map((f) => [String(f._id), f]));
    const ingredients = r.items.map((i) => ({
      foodId: new Types.ObjectId(i.foodId),
      foodName: byId.get(i.foodId)!.name,
      grams: i.grams,
      per100g: byId.get(i.foodId)!.per100g,
    }));

    const { per100g, totalGrams } = recipePer100g(ingredients);
    if (totalGrams <= 0) {
      return NextResponse.json({ error: "The ingredients add up to nothing." }, { status: 400 });
    }

    const servingGrams = Math.round((totalGrams / r.servings) * 10) / 10;

    const foodId = await createFood({
      name: r.name,
      brand: null,
      source: "recipe",
      sourceRef: null,
      per100g,
      // A recipe is only as trustworthy as its ingredients, and the user chose
      // the quantities — so it is never marked verified.
      isVerified: false,
      ownerUserId: uid,
      portions: [
        { label: `1 serving (${servingGrams} g)`, grams: servingGrams },
        { label: `Whole recipe (${Math.round(totalGrams)} g)`, grams: totalGrams },
      ],
    });

    const recipe = await FuelRecipe.create({
      userId: uid,
      name: r.name,
      servings: r.servings,
      totalGrams,
      items: ingredients.map((i) => ({ foodId: i.foodId, foodName: i.foodName, grams: i.grams })),
      foodId,
    });

    return NextResponse.json(
      {
        recipe: {
          id: String(recipe._id),
          name: recipe.name,
          servings: recipe.servings,
          totalGrams,
          servingGrams,
          foodId: String(foodId),
          per100g,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[fuel/recipes] create failed:", err);
    return NextResponse.json(
      { error: "Could not save. Check the database connection." },
      { status: 503 },
    );
  }
}

/** GET /api/fuel/recipes — the user's recipes. */
export async function GET() {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  try {
    await connectDB();
    const recipes = await FuelRecipe.find({ userId: new Types.ObjectId(guard.userId) })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      recipes: recipes.map((r) => ({
        id: String(r._id),
        name: r.name,
        servings: r.servings,
        totalGrams: r.totalGrams,
        servingGrams: Math.round((r.totalGrams / r.servings) * 10) / 10,
        foodId: r.foodId ? String(r.foodId) : null,
        items: (r.items ?? []).map((i) => ({ foodName: i.foodName, grams: i.grams })),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/** DELETE /api/fuel/recipes?id=… — removes the recipe and its companion food. */
export async function DELETE(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "A valid recipe id is required" }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);
    const recipe = await FuelRecipe.findOneAndDelete({ _id: new Types.ObjectId(id), userId: uid });
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    if (recipe.foodId) {
      await FuelFood.deleteOne({ _id: recipe.foodId, ownerUserId: uid });
      await FuelPortion.deleteMany({ foodId: recipe.foodId });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
