/**
 * Diet plan generation.
 *
 * Composes a day of meals from the food database that lands near the user's
 * macro targets, respecting their diet preference and Indian household
 * portions.
 *
 * Two things this deliberately is not:
 *
 * It is not a prescription. The output is a worked example of what hitting
 * the target looks like with foods the user actually eats — something to copy
 * on a blank Monday, not a regime. Every item is a normal log entry they can
 * swap or delete.
 *
 * It is not smarter than its ingredients. A plan can only be built from the
 * seeded food database, so a thin database produces a repetitive plan. That is
 * a data problem with a known fix (`npm run fuel:fetch`), not something to
 * paper over by inventing foods.
 *
 * The algorithm is a protein-first greedy fill, which is explainable and good
 * enough: protein is the hardest macro to hit and the one that matters most
 * for someone who lifts, so it leads. Carbs and fat then fill the remaining
 * energy. An exact-fit search would be a knapsack solver returning meals
 * nobody would eat.
 */

import { ATWATER, MEALS, round, type DietPref, type MacroTotals, type Meal, type Per100g } from "./types";

export interface PlannableFood {
  id: string;
  name: string;
  per100g: Per100g;
  vegFlag: "veg" | "nonveg" | "egg" | "unknown";
  /** Household servings, smallest first. Grams-only foods still work. */
  portions: Array<{ id: string; label: string; grams: number }>;
  /** Rough role in a meal, inferred by the caller. */
  role: FoodRole;
}

/**
 * What a food is *for* in a meal. Composing by role is what stops the planner
 * returning "700 g of paneer" — a plate needs a base, something with protein,
 * and something green, not just numbers that add up.
 */
export type FoodRole = "protein" | "staple" | "vegetable" | "dairy" | "fat" | "fruit" | "other";

/** How the day's energy splits across meals. Conventional, and editable. */
export const MEAL_SHARE: Record<Meal, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  snack: 0.1,
  dinner: 0.3,
};

/** Which roles each meal wants, in the order they should be chosen. */
const MEAL_SHAPE: Record<Meal, FoodRole[]> = {
  breakfast: ["protein", "staple", "dairy", "fruit"],
  lunch: ["staple", "protein", "vegetable", "dairy"],
  snack: ["protein", "fruit"],
  dinner: ["protein", "staple", "vegetable"],
};

export interface PlannedItem {
  foodId: string;
  name: string;
  portionId: string | null;
  portionLabel: string;
  quantity: number;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PlannedMeal {
  meal: Meal;
  items: PlannedItem[];
  totals: MacroTotals;
}

export interface MealPlan {
  meals: PlannedMeal[];
  totals: MacroTotals;
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  /** How close the plan landed, as signed differences. */
  gap: { kcal: number; proteinG: number };
  notes: string[];
}

/** Root vegetables a Jain diet excludes. */
const JAIN_EXCLUDED = /potato|aloo|onion|pyaz|garlic|lehsun|ginger|adrak|carrot|gajar|radish|beetroot|turnip|yam/;

/**
 * Does this food fit the user's diet?
 *
 * Ordered widest to narrowest. Egg is its own flag rather than a shade of
 * vegetarian, because eggetarian is a real and common position in India and
 * collapsing it into "veg" gets a third of the audience wrong.
 */
export function allowedFor(food: PlannableFood, diet: DietPref): boolean {
  if (diet === "nonveg") return true; // eats everything

  if (food.vegFlag === "nonveg") return false; // nobody else does
  if (food.vegFlag === "egg") return diet === "egg"; // only eggetarians

  if (diet === "vegan" && food.role === "dairy") return false;
  if (diet === "jain" && JAIN_EXCLUDED.test(food.name.toLowerCase())) return false;

  return true;
}

/** Portion nearest a gram goal, so plans read "1 katori", not "173 g". */
function bestPortion(food: PlannableFood, targetGrams: number) {
  if (food.portions.length === 0) {
    return { id: null, label: `${Math.round(targetGrams)} g`, grams: targetGrams, quantity: 1 };
  }

  let best = food.portions[0];
  let bestQty = 1;
  let bestError = Infinity;

  for (const portion of food.portions) {
    // Whole and half servings only — nobody measures 1.37 katoris.
    for (const qty of [0.5, 1, 1.5, 2, 2.5, 3]) {
      const grams = portion.grams * qty;
      const error = Math.abs(grams - targetGrams);
      if (error < bestError) {
        bestError = error;
        best = portion;
        bestQty = qty;
      }
    }
  }

  return { id: best.id, label: best.label, grams: round(best.grams * bestQty, 1), quantity: bestQty };
}

function macrosFor(food: PlannableFood, grams: number) {
  const f = grams / 100;
  return {
    kcal: Math.round(food.per100g.kcal * f),
    proteinG: round(food.per100g.proteinG * f, 1),
    carbsG: round(food.per100g.carbsG * f, 1),
    fatG: round(food.per100g.fatG * f, 1),
  };
}

/**
 * Build a day.
 *
 * `seed` rotates the choices so a week of plans isn't the same breakfast seven
 * times, while staying deterministic for a given day.
 */
export function generateMealPlan(
  foods: readonly PlannableFood[],
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number },
  diet: DietPref,
  seed = 0,
): MealPlan {
  const notes: string[] = [];
  const usable = foods.filter((f) => allowedFor(f, diet) && f.per100g.kcal > 0);

  if (usable.length < 4) {
    return {
      meals: MEALS.map((meal) => ({ meal, items: [], totals: zero() })),
      totals: zero(),
      target,
      gap: { kcal: -target.kcal, proteinG: -target.proteinG },
      notes: [
        "There aren't enough foods in the database yet to build a plan. Seed the food database and this fills in.",
      ],
    };
  }

  const byRole = (role: FoodRole) => usable.filter((f) => f.role === role);
  const meals: PlannedMeal[] = [];

  for (const [mealIndex, meal] of MEALS.entries()) {
    const share = MEAL_SHARE[meal];
    const mealTarget = {
      kcal: target.kcal * share,
      proteinG: target.proteinG * share,
    };

    const items: PlannedItem[] = [];
    const running = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

    for (const [roleIndex, role] of MEAL_SHAPE[meal].entries()) {
      const candidates = byRole(role);
      if (candidates.length === 0) continue;

      // Rotate deterministically so the week varies.
      const food = candidates[(seed + mealIndex * 3 + roleIndex) % candidates.length];

      // Protein roles chase the protein number; everything else fills energy.
      const remainingKcal = Math.max(0, mealTarget.kcal - running.kcal);
      const remainingProtein = Math.max(0, mealTarget.proteinG - running.proteinG);

      let grams: number;
      if (role === "protein" && food.per100g.proteinG > 5) {
        grams = (remainingProtein / food.per100g.proteinG) * 100;
      } else {
        // Leave room for the roles still to come.
        const rolesLeft = MEAL_SHAPE[meal].length - roleIndex;
        grams = ((remainingKcal / rolesLeft) / Math.max(food.per100g.kcal, 1)) * 100;
      }

      if (!Number.isFinite(grams) || grams <= 5) continue;
      grams = Math.min(grams, 500); // nobody eats half a kilo of one thing

      const portion = bestPortion(food, grams);
      const macros = macrosFor(food, portion.grams);
      if (macros.kcal <= 0) continue;

      items.push({
        foodId: food.id,
        name: food.name,
        portionId: portion.id,
        portionLabel: portion.label,
        quantity: portion.quantity,
        grams: portion.grams,
        ...macros,
      });

      running.kcal += macros.kcal;
      running.proteinG += macros.proteinG;
      running.carbsG += macros.carbsG;
      running.fatG += macros.fatG;
    }

    meals.push({
      meal,
      items,
      totals: {
        kcal: Math.round(running.kcal),
        proteinG: round(running.proteinG, 1),
        carbsG: round(running.carbsG, 1),
        fatG: round(running.fatG, 1),
        fiberG: 0,
      },
    });
  }

  const totals = meals.reduce<MacroTotals>(
    (sum, m) => ({
      kcal: sum.kcal + m.totals.kcal,
      proteinG: sum.proteinG + m.totals.proteinG,
      carbsG: sum.carbsG + m.totals.carbsG,
      fatG: sum.fatG + m.totals.fatG,
      fiberG: 0,
    }),
    zero(),
  );
  totals.proteinG = round(totals.proteinG, 1);
  totals.carbsG = round(totals.carbsG, 1);
  totals.fatG = round(totals.fatG, 1);

  const gap = {
    kcal: Math.round(totals.kcal - target.kcal),
    proteinG: Math.round(totals.proteinG - target.proteinG),
  };

  // Report the miss rather than quietly presenting an off-target plan as the answer.
  if (Math.abs(gap.kcal) > target.kcal * 0.1) {
    notes.push(
      `This lands ${Math.abs(gap.kcal)} kcal ${gap.kcal > 0 ? "over" : "under"} target — a bigger food database gives the planner more to work with.`,
    );
  }
  if (gap.proteinG < -15) {
    notes.push(
      `Protein comes out ${Math.abs(gap.proteinG)} g short. Worth adding a shake or extra curd rather than more of the same.`,
    );
  }
  notes.push("A worked example, not a prescription — swap anything you don't fancy.");

  return { meals, totals, target, gap, notes };
}

function zero(): MacroTotals {
  return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
}

/**
 * Guess a food's role from its composition and name.
 *
 * Composition leads because it is objective: a food that is 25 % protein is a
 * protein source whatever it is called. The name is only consulted for the
 * categories macros cannot separate — a fruit and a starchy vegetable look
 * identical on paper.
 */
export function inferRole(name: string, per100g: Per100g): FoodRole {
  const n = name.toLowerCase();

  // Name first, composition last. Protein *share* on its own is a trap: at 23
  // kcal per 100 g, spinach is 50 % protein by energy and would be classified
  // as a protein source — which would put a bowl of greens where the dal
  // should be. Categories macros cannot separate are decided by name, and the
  // composition rule that remains carries an absolute floor as well as a share.
  if (/oil|ghee|butter(?! chicken)|almond|cashew|walnut|peanut butter|nuts/.test(n)) return "fat";
  if (/milk|curd|dahi|yogurt|yoghurt|paneer|cheese|lassi|buttermilk|chaas/.test(n)) return "dairy";
  if (/banana|apple|mango|orange|papaya|watermelon|grape|guava|pomegranate|dates|kela|seb/.test(n)) {
    return "fruit";
  }
  if (/rice|roti|chapati|bread|oats|poha|upma|idli|dosa|paratha|pasta|quinoa|atta|suji|naan|puri|khichdi|biryani|pulao|vermicelli|cornflakes|muesli/.test(n)) {
    return "staple";
  }
  if (/dal|daal|dhal|lentil|chana|rajma|bean|sprout|soya|soy|tofu|whey|protein|egg|chicken|mutton|fish|prawn|salmon|tuna/.test(n)) {
    return "protein";
  }
  if (/spinach|palak|bhindi|okra|cabbage|cauliflower|gobi|carrot|tomato|cucumber|mushroom|capsicum|baingan|brinjal|sabzi|vegetable|peas|matar|onion|potato|aloo/.test(n)) {
    return "vegetable";
  }

  const proteinShare =
    per100g.kcal > 0 ? (per100g.proteinG * ATWATER.protein) / per100g.kcal : 0;
  if (per100g.proteinG >= 10 && proteinShare >= 0.25) return "protein";

  return "other";
}
