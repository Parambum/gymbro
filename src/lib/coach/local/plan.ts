import { generateProgramme, type Programme } from "@/lib/training/program";
import { EQUIPMENT_LIST, EXPERIENCE_LIST, GOAL_LIST, experienceDef, goalDef } from "@/lib/fuel/goals";
import type { LiftTrend } from "@/lib/coach/training-log";
import { PLAN_MARKER, QUESTIONNAIRE_MARKER } from "./intent";
import type { PlanSlots } from "./slots";

/**
 * Plans for the keyless coach, written by the same generator the guided setup
 * uses (lib/training/program.ts) — one source of programming truth, so the
 * coach and the onboarding flow cannot hand the same person different weeks.
 * This file only writes the result in the widget's format: a `###` heading per
 * day, **bold** exercise names, sets × reps, rest, and a closing tip.
 */

function rest(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")}`;
}

function sessionsMarkdown(p: Programme, maxPerDay?: number): string[] {
  const lines: string[] = [];
  p.sessions.forEach((session, i) => {
    lines.push(`### Day ${i + 1} — ${session.name}`);
    for (const ex of session.exercises.slice(0, maxPerDay)) {
      lines.push(`- **${ex.exercise}** — ${ex.sets} × ${ex.repsLow}–${ex.repsHigh} · rest ${rest(ex.restSeconds)} · stop ${ex.rir} rep${ex.rir === 1 ? "" : "s"} short of failure`);
    }
  });
  return lines;
}

const label = <T extends { slug: string; label: string }>(list: T[], slug: string) =>
  list.find((x) => x.slug === slug)?.label.toLowerCase() ?? slug;

/** DEMO MODE: a short bodyweight sample, then the prompt's exact closing line. */
export function demoReply(): string {
  const p = generateProgramme({ goal: "maintain", experience: "beginner", equipment: "bodyweight", daysPerWeek: 3, sessionMinutes: 30 });
  return [
    "Here's a sample 3-day bodyweight week — all you need is a pull-up bar and something sturdy to dip on:",
    "",
    ...sessionsMarkdown(p, 4),
    "",
    "This is just a sample! Want me to build a custom A-Z plan just for you?",
  ].join("\n");
}

/** GATHERING_DATA MODE: one consolidated question, only for what is missing. */
export function questionnaireReply(slots: PlanSlots, missing: string[]): string {
  const lines = [`${QUESTIONNAIRE_MARKER}, tell me:`];
  if (missing.includes("goal")) {
    lines.push(`- **Goal** — ${GOAL_LIST.map((g) => g.label.toLowerCase()).join(", ")}`);
  }
  if (missing.includes("experience")) {
    lines.push(`- **Experience** — ${EXPERIENCE_LIST.map((e) => e.label.toLowerCase()).join(", ")}`);
  }
  if (missing.includes("equipment")) {
    lines.push(`- **Equipment** — ${EQUIPMENT_LIST.map((e) => e.label.toLowerCase()).join(", ")}`);
  }
  if (missing.includes("days")) {
    lines.push("- **Schedule** — days per week, and minutes per session if you have a limit");
  }

  const known: string[] = [];
  if (slots.goal) known.push(goalDef(slots.goal).label.toLowerCase());
  if (slots.experience) known.push(label(EXPERIENCE_LIST, slots.experience));
  if (slots.equipment) known.push(label(EQUIPMENT_LIST, slots.equipment));
  if (slots.daysPerWeek) known.push(`${slots.daysPerWeek} days a week`);
  if (known.length > 0) lines.push("", `Got so far: ${known.join(" · ")}.`);

  if (slots.unsupportedGoal === "endurance") {
    lines.push(
      "",
      "Heads up: I write strength-training plans, so I can't programme endurance work like running. Pick the closest of the goals above and I'll build around it.",
    );
  }
  return lines.join("\n");
}

/** Starting points from the user's own log, for exercises the plan shares with it. */
function startingPoints(p: Programme, lifts: LiftTrend[]): string[] {
  const inPlan = new Set(p.sessions.flatMap((s) => s.exercises.map((e) => e.exercise)));
  return lifts
    .filter((l) => inPlan.has(l.exercise))
    .slice(0, 5)
    .map((l) => `- **${l.exercise}**: you last did ${l.last.weight} kg × ${l.last.reps} — start there`);
}

/** GENERATING_PLAN MODE. */
export function planReply(slots: Required<Pick<PlanSlots, "goal" | "experience" | "equipment" | "daysPerWeek">> & PlanSlots, lifts: LiftTrend[] | null): string {
  const p = generateProgramme({
    goal: slots.goal,
    experience: slots.experience,
    equipment: slots.equipment,
    daysPerWeek: slots.daysPerWeek,
    sessionMinutes: slots.sessionMinutes,
  });
  const goal = goalDef(slots.goal);

  const header = `**${goal.label}** · ${label(EXPERIENCE_LIST, slots.experience)} · ${label(EQUIPMENT_LIST, slots.equipment)} · ${p.daysPerWeek} days a week${slots.sessionMinutes ? ` · ~${slots.sessionMinutes} min` : ""}`;
  const lines = [header];
  if (p.daysPerWeek !== slots.daysPerWeek) {
    lines.push(
      slots.daysPerWeek < p.daysPerWeek
        ? `You said ${slots.daysPerWeek} day${slots.daysPerWeek === 1 ? "" : "s"}; the shortest split I write is ${p.daysPerWeek}, so here it is.`
        : `You said ${slots.daysPerWeek} days; I cap plans at ${p.daysPerWeek} so muscles get a rest day.`,
    );
  }
  lines.push("", ...sessionsMarkdown(p));

  const starts = lifts ? startingPoints(p, lifts) : [];
  if (starts.length > 0) lines.push("", "### From your log", ...starts);

  // The same rule nextProgression() applies when the app suggests your next set.
  const stepPct = Math.round(experienceDef(slots.experience).progressionStep * 1000) / 10;
  lines.push("", PLAN_MARKER);
  lines.push(
    `- Double progression: once you hit the top of the rep range on every set, add about ${stepPct}% to the weight (never less than 2.5 kg) and drop back to the bottom of the range. Miss the bottom of the range? Hold the weight until you own it.`,
  );
  for (const note of p.notes) lines.push(`- ${note}`);
  lines.push(`- ${goal.expectation}`);
  return lines.join("\n");
}
