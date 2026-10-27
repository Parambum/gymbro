import { remainingFor } from "@/lib/fuel/targets";
import { MEAL_LABELS, type MacroTotals, type Meal } from "@/lib/fuel/types";

/**
 * "How many calories have I got left?", "my protein today", "what's my
 * calorie target?" — answered from the user's own Fuel log and targets.
 *
 * Pure: the reply only. The day is loaded by nutrition-server.ts.
 */

export interface DayIntake {
  onboarded: boolean;
  eyesOff: boolean;
  date: string;
  consumed: MacroTotals;
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; waterMl: number; effectiveFrom: string } | null;
  notes: string[];
  items: number;
  meals: Meal[];
}

const n = (v: number) => Math.round(v).toLocaleString("en-IN");

/** Does the user want today's numbers, or the target itself? */
export function asksForTarget(message: string): boolean {
  return /\b(target|goal|should i (eat|have)|do i need|how many calories (do|should) i)\b/i.test(message);
}

export function intakeReply(d: DayIntake, focus: "today" | "target"): string {
  if (!d.onboarded) {
    return [
      "You haven't set up **Fuel** yet, so I don't have targets or a food log to read.",
      "",
      "Your calories depend on your weight, height, age, activity and goal. Fuel's setup (or the **guided setup**) works them out with the same safety limits the whole app uses: no faster than 0.75% of bodyweight a week, and never below your BMR. Once it's done, ask me **how many calories have I got left?**",
    ].join("\n");
  }

  const t = d.target;
  const lines: string[] = [];

  if (focus === "target" && t) {
    lines.push(
      d.eyesOff
        ? `Your daily target is **${n(t.proteinG)} g protein**, ${n(t.carbsG)} g carbs and ${n(t.fatG)} g fat. Calories are hidden because eyes-off mode is on.`
        : `Your daily target is **${n(t.kcal)} kcal** — ${n(t.proteinG)} g protein · ${n(t.carbsG)} g carbs · ${n(t.fatG)} g fat.`,
      `*Set on ${t.effectiveFrom}; recalculate it in **Fuel → Targets** if your weight or goal has changed.*`,
    );
  }

  if (d.items === 0) {
    if (focus === "today") {
      lines.push("Nothing logged yet today.");
      if (t) {
        lines.push(
          d.eyesOff
            ? `Today's target: **${n(t.proteinG)} g protein**.`
            : `Today's target: **${n(t.kcal)} kcal** · ${n(t.proteinG)} g protein · ${n(t.carbsG)} g carbs · ${n(t.fatG)} g fat.`,
        );
      }
    }
    lines.push("", "Log a meal in **Fuel**, or ask me what's in a food first, like **2 eggs and toast**.");
    return lines.join("\n");
  }

  const c = d.consumed;
  if (focus === "target") lines.push("");
  lines.push(`### Today so far (${d.items} item${d.items === 1 ? "" : "s"}: ${d.meals.map((m) => MEAL_LABELS[m].toLowerCase()).join(", ")})`);

  if (t) {
    const r = remainingFor(t, c);
    if (!d.eyesOff) {
      const pct = Math.round((c.kcal / t.kcal) * 100);
      lines.push(
        `- **${n(c.kcal)} kcal** of ${n(t.kcal)} (${pct}%) — ${r.overKcal ? `**${n(-r.kcal)} over**` : `**${n(r.kcal)} left**`}`,
      );
    }
    const left = (v: number) => (v >= 0 ? `${n(v)} g left` : `${n(-v)} g over`);
    lines.push(`- Protein ${n(c.proteinG)} / ${n(t.proteinG)} g (${left(r.proteinG)})`);
    lines.push(`- Carbs ${n(c.carbsG)} / ${n(t.carbsG)} g · Fat ${n(c.fatG)} / ${n(t.fatG)} g`);
    for (const note of d.notes) lines.push("", `*${note}*`);
    if (r.proteinG > 25) {
      lines.push("", `Protein is the one to chase: ${n(r.proteinG)} g to go. Ask me the protein in a food, like **protein in 200 g paneer**.`);
    }
  } else {
    if (!d.eyesOff) lines.push(`- **${n(c.kcal)} kcal**`);
    lines.push(`- Protein ${n(c.proteinG)} g · Carbs ${n(c.carbsG)} g · Fat ${n(c.fatG)} g`);
    lines.push("", "You have no target yet — finish **Fuel → Targets** and I'll show what's left.");
  }
  return lines.join("\n");
}
