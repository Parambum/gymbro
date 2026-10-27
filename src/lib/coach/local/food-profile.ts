import type { FoodCandidate } from "@/lib/fuel/describe-server";
import { ATWATER } from "@/lib/fuel/types";

/**
 * What a food *is*, beyond its calories — worked out from its composition
 * against published thresholds rather than adjectives:
 *
 *  - Nutrition claims use the EU's legal thresholds (Regulation (EC) No
 *    1924/2006, Annex): "high protein" means at least 20% of energy from
 *    protein, "high fibre" at least 6 g/100 g or 3 g/100 kcal, and so on.
 *  - "High in" warnings use the UK front-of-pack red thresholds (per 100 g:
 *    fat > 17.5 g, sugars > 22.5 g, salt > 1.5 g; half that for drinks).
 *  - Energy density uses the CDC's bands (kcal per gram: very low < 0.6,
 *    low 0.6–1.5, medium 1.5–4, high above 4).
 *
 * Every figure shown is the food's own data or arithmetic on it.
 */

export type Band = "very low" | "low" | "medium" | "high";
export type FoodGoal = "lose" | "maintain" | "gain";

type Per100 = FoodCandidate["per100g"] & { sugarG?: number; sodiumMg?: number };

export interface FoodProfile {
  kcalPerGram: number;
  band: Band;
  /** Share of energy from protein, carbs and fat (Atwater), percent. */
  split: { protein: number; carbs: number; fat: number };
  proteinPer100kcal: number;
  fiberPer100kcal: number;
  claims: string[];
  warnings: string[];
  liquid: boolean;
}

const LIQUID = /\b(juice|milk|drink|beverage|lassi|tea|coffee|shake|smoothie|soda|cola|water|buttermilk|chaas|nectar|kombucha|soup)\b/i;

export function isLiquid(food: Pick<FoodCandidate, "name">, portions: Array<{ label: string }> = []): boolean {
  return LIQUID.test(food.name) || portions.some((p) => /\bglass\b|\bml\b/.test(p.label));
}

export function bandOf(kcalPerGram: number): Band {
  return kcalPerGram < 0.6 ? "very low" : kcalPerGram <= 1.5 ? "low" : kcalPerGram <= 4 ? "medium" : "high";
}

export function profileOf(food: Pick<FoodCandidate, "name" | "per100g">, portions: Array<{ label: string }> = []): FoodProfile {
  const p = food.per100g as Per100;
  const liquid = isLiquid(food, portions);
  const kcal = p.kcal;
  const fromP = p.proteinG * ATWATER.protein;
  const fromC = p.carbsG * ATWATER.carbs;
  const fromF = p.fatG * ATWATER.fat;
  const total = fromP + fromC + fromF || 1;
  const per100kcal = (g: number) => (kcal > 0 ? (g / kcal) * 100 : 0);

  const claims: string[] = [];
  const proteinEnergy = kcal > 0 ? (fromP / kcal) * 100 : 0;
  if (proteinEnergy >= 20) claims.push("High protein");
  else if (proteinEnergy >= 12) claims.push("Source of protein");

  const fiber = p.fiberG ?? 0;
  if (fiber >= 6 || per100kcal(fiber) >= 3) claims.push("High fibre");
  else if (fiber >= 3 || per100kcal(fiber) >= 1.5) claims.push("Source of fibre");

  if (p.sugarG != null) {
    if (p.sugarG <= 0.5) claims.push("Sugar-free");
    else if (p.sugarG <= (liquid ? 2.5 : 5)) claims.push("Low sugar");
  }
  if (p.fatG <= 0.5) claims.push("Fat-free");
  else if (p.fatG <= (liquid ? 1.5 : 3)) claims.push("Low fat");
  if (p.sodiumMg != null) {
    if (p.sodiumMg <= 5) claims.push("Sodium-free");
    else if (p.sodiumMg <= 40) claims.push("Very low sodium");
    else if (p.sodiumMg <= 120) claims.push("Low sodium");
  }
  if (kcal <= 4) claims.push("Energy-free");
  else if (kcal <= (liquid ? 20 : 40)) claims.push("Low energy");

  const warnings: string[] = [];
  const half = liquid ? 0.5 : 1;
  if (p.fatG > 17.5 * half) warnings.push("High fat");
  if (p.sugarG != null && p.sugarG > 22.5 * half) warnings.push("High sugar");
  // salt = sodium × 2.5
  if (p.sodiumMg != null && (p.sodiumMg * 2.5) / 1000 > 1.5 * half) warnings.push("High salt");

  const kcalPerGram = kcal / 100;
  return {
    kcalPerGram,
    band: bandOf(kcalPerGram),
    split: {
      protein: Math.round((fromP / total) * 100),
      carbs: Math.round((fromC / total) * 100),
      fat: Math.round((fromF / total) * 100),
    },
    proteinPer100kcal: Math.round(per100kcal(p.proteinG) * 10) / 10,
    fiberPer100kcal: Math.round(per100kcal(fiber) * 10) / 10,
    claims,
    warnings,
    liquid,
  };
}

const BAND_NOTE: Record<Band, string> = {
  "very low": "a lot of food for very few calories",
  low: "filling for its calories",
  medium: "moderate — portion size matters",
  high: "a lot of calories in a small amount",
};

/** Lines for the reply. Calories and energy density are hidden in eyes-off mode. */
export function profileLines(
  food: Pick<FoodCandidate, "name" | "per100g" | "vegFlag">,
  portions: Array<{ label: string }>,
  opts: { hideCalories: boolean; goal: FoodGoal | null },
): string[] {
  const pr = profileOf(food, portions);
  const lines: string[] = [];
  if (pr.claims.length) lines.push(`- **Qualifies as:** ${pr.claims.join(" · ")} *(EU nutrition-claim thresholds)*`);
  if (pr.warnings.length) lines.push(`- **Watch:** ${pr.warnings.join(" · ")} *(UK front-of-pack thresholds)*`);
  if (!opts.hideCalories) {
    lines.push(`- **Energy density:** ${pr.kcalPerGram.toFixed(2)} kcal/g — ${pr.band} *(CDC bands)*, ${BAND_NOTE[pr.band]}`);
    lines.push(`- **Calories come from:** ${pr.split.carbs}% carbs · ${pr.split.fat}% fat · ${pr.split.protein}% protein — ${pr.proteinPer100kcal} g protein per 100 kcal`);
  } else {
    lines.push(`- **Protein:** ${pr.split.protein}% of its energy`);
  }
  const veg: Record<string, string> = { veg: "Vegetarian", egg: "Contains egg", nonveg: "Non-vegetarian" };
  if (veg[food.vegFlag]) lines.push(`- ${veg[food.vegFlag]}`);

  const fit = goalFit(pr, opts.goal);
  if (fit) lines.push(`- **For your goal:** ${fit}`);
  return lines;
}

export function goalFit(pr: FoodProfile, goal: FoodGoal | null): string | null {
  const protein = pr.claims.includes("High protein");
  if (goal === "lose") {
    if (pr.band === "very low" || pr.band === "low")
      return `good on a cut — low energy density fills you up for few calories${protein ? ", and the protein helps you keep muscle" : ""}.`;
    if (pr.band === "high") return "energy-dense, so on a cut weigh it rather than eyeballing it.";
    return protein ? "the protein makes it a useful choice on a cut; watch the portion." : "fine on a cut in a measured portion.";
  }
  if (goal === "gain") {
    if (pr.band === "high" || pr.band === "medium") return `energy-dense — an easy way to add calories for a bulk${protein ? ", with protein to match" : ""}.`;
    return "filling for its calories, so you'd need a lot of it to bulk — pair it with something denser.";
  }
  return null;
}

/** Which nutrient or goal a comparison should be judged on. */
export function compareVerdict(
  a: { name: string; pr: FoodProfile },
  b: { name: string; pr: FoodProfile },
  goal: FoodGoal | "protein" | null,
): string[] {
  const lighter = a.pr.kcalPerGram <= b.pr.kcalPerGram ? a : b;
  const denser = lighter === a ? b : a;
  const moreProtein = a.pr.proteinPer100kcal >= b.pr.proteinPer100kcal ? a : b;
  const moreFibre = a.pr.fiberPer100kcal >= b.pr.fiberPer100kcal ? a : b;
  const lines: string[] = [];
  if (goal === "lose") lines.push(`**For a cut: ${lighter.name}** — fewer calories per gram${moreFibre === lighter ? " and more fibre for its calories" : ""}.`);
  else if (goal === "gain") lines.push(`**For a bulk: ${denser.name}** — more calories per gram.`);
  else if (goal === "protein") lines.push(`**For protein: ${moreProtein.name}** — more protein per 100 kcal.`);
  else {
    lines.push(`- Fewer calories per gram: **${lighter.name}**`);
    lines.push(`- More protein per 100 kcal: **${moreProtein.name}**`);
    lines.push(`- More fibre per 100 kcal: **${moreFibre.name}**`);
  }
  return lines;
}
