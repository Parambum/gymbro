import type { Equipment, Experience, FitnessGoal } from "@/lib/fuel/goals";

/**
 * Read the four plan inputs out of what the user has said, in their words.
 *
 * The coach's questionnaire asks for goal, experience, equipment and schedule
 * (shared/coach/system-prompt.md, GATHERING_DATA MODE). People answer in one
 * message or across several, in any order, in gym slang — so every user turn
 * is scanned, oldest first, and a later answer overrides an earlier one ("3
 * days… actually make it 4").
 *
 * Every value maps onto the app's own taxonomy (lib/fuel/goals.ts), because
 * the plan comes from the same generator the guided setup uses. A goal the
 * generator does not programme — endurance — is reported, not mapped onto
 * something nearby: guessing would hand someone a plan for a different goal.
 */

export interface PlanSlots {
  goal?: FitnessGoal;
  experience?: Experience;
  equipment?: Equipment;
  daysPerWeek?: number;
  sessionMinutes?: number;
  /** They asked for something the generator cannot build. */
  unsupportedGoal?: "endurance";
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  once: 1, twice: 2, thrice: 3,
};

function num(token: string): number | null {
  const n = WORD_NUMBERS[token.toLowerCase()] ?? Number(token);
  return Number.isFinite(n) ? n : null;
}

/** Ordered: the first pattern that matches wins, so specific beats general. */
const GOALS: Array<[RegExp, FitnessGoal]> = [
  [/\b(get lean|lean out|leaner|shred\w*|definition|defined|six[- ]?pack|abs showing)\b/, "get-lean"],
  [/\b(tone|toned|tone up|toning|recomp\w*)\b/, "tone-up"],
  [/\b(lose fat|fat loss|lose weight|weight loss|burn fat|drop weight|slim\w*|cut|cutting|fat)\b/, "lose-fat"],
  [/\b(build muscle|muscle gain|gain muscle|put on muscle|hypertrophy|bulk\w*|bigger|size|mass|bodybuilding|muscle)\b/, "build-muscle"],
  [/\b(strength|stronger|strong|powerlift\w*|1rm|lift heavier)\b/, "get-strong"],
  [/\b(maintain|maintenance|stay fit|keep fit|general fitness|stay healthy|health)\b/, "maintain"],
];

const ENDURANCE = /\b(endurance|marathon|stamina|run(ning)? (faster|longer)|5k|10k|half marathon|cardio fitness)\b/;

function goalOf(t: string): Pick<PlanSlots, "goal" | "unsupportedGoal"> {
  for (const [re, goal] of GOALS) if (re.test(t)) return { goal };
  if (ENDURANCE.test(t)) return { unsupportedGoal: "endurance" };
  return {};
}

function experienceOf(t: string): Experience | undefined {
  // The app counts "starting again" as new to this (goals.ts), whatever the
  // history — so a layoff is checked before any claim of experience.
  if (/\b((haven'?t|have not|hadn'?t|not) (been )?(trained|training|lifted|lifting|worked out)|starting again|coming back|getting back into)\b/.test(t)) {
    return "beginner";
  }
  // the questionnaire offers the app's own labels, so those are matched next:
  // "new to this", "been training a while", "experienced"
  if (/\b(advanced|experienced|competitive|compete)\b/.test(t)) return "advanced";
  // not bare "a while" — "haven't trained in a while" is someone starting again
  if (/\b(intermediate|some experience|(training|lifting) (for )?a while)\b/.test(t)) return "intermediate";
  if (/\b(beginner|newbie|novice|new to (this|the gym|lifting|training)|just (started|starting)|never (lifted|trained|been)|first time|starting out|starting again)\b/.test(t)) {
    return "beginner";
  }
  const years = t.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven)\+?\s*(?:years?|yrs?)\b/);
  if (years) {
    const y = num(years[1]);
    if (y !== null) return y < 1 ? "beginner" : y < 4 ? "intermediate" : "advanced";
  }
  const months = t.match(/\b(\d+)\s*months?\b/);
  if (months) {
    const m = Number(months[1]);
    return m < 12 ? "beginner" : m < 48 ? "intermediate" : "advanced";
  }
  return undefined;
}

function equipmentOf(t: string): Equipment | undefined {
  if (/\b(no equipment|without equipment|bodyweight|body weight|calisthenics|nothing at home|no weights|no gym)\b/.test(t)) {
    return "bodyweight";
  }
  if (/\b(full gym|commercial gym|gym membership|the gym|a gym|my gym|barbells?|machines?|cables?)\b/.test(t)) return "full-gym";
  if (/\b(dumbbells?|dbs)\b/.test(t)) return "dumbbells";
  if (/\bgym\b/.test(t)) return "full-gym";
  return undefined;
}

function daysOf(t: string): number | undefined {
  if (/\b(every ?day|daily|7 days a week)\b/.test(t)) return 7;
  const m =
    t.match(/\b(\d|one|two|three|four|five|six|seven|once|twice|thrice)\s*(?:x|times|days?|sessions?|workouts?)\s*(?:a|per|\/|each|every)?\s*(?:week|wk)\b/) ??
    t.match(/\b(\d|one|two|three|four|five|six|seven)\s*(?:days?|sessions?)\b/) ??
    t.match(/\b(\d)\s*x\b/);
  if (!m) return undefined;
  const n = num(m[1]);
  return n !== null && n >= 1 && n <= 7 ? n : undefined;
}

function minutesOf(t: string): number | undefined {
  const mins = t.match(/\b(\d{2,3})\s*(?:-|to)?\s*(?:\d{2,3}\s*)?(?:min|mins|minutes)\b/);
  if (mins) return Number(mins[1]);
  if (/\bhalf an hour\b/.test(t)) return 30;
  if (/\b(an|one|1) hour\b/.test(t)) return 60;
  const hours = t.match(/\b(\d(?:\.\d)?)\s*(?:hours?|hrs?)\b/);
  if (hours) return Math.round(Number(hours[1]) * 60);
  return undefined;
}

export function extractSlots(userTurns: string[]): PlanSlots {
  const slots: PlanSlots = {};
  for (const turn of userTurns) {
    const t = turn.toLowerCase();
    const g = goalOf(t);
    if (g.goal) {
      slots.goal = g.goal;
      delete slots.unsupportedGoal;
    } else if (g.unsupportedGoal && !slots.goal) slots.unsupportedGoal = g.unsupportedGoal;
    slots.experience = experienceOf(t) ?? slots.experience;
    slots.equipment = equipmentOf(t) ?? slots.equipment;
    slots.daysPerWeek = daysOf(t) ?? slots.daysPerWeek;
    slots.sessionMinutes = minutesOf(t) ?? slots.sessionMinutes;
  }
  return slots;
}

export function missingSlots(s: PlanSlots): Array<"goal" | "experience" | "equipment" | "days"> {
  const out: Array<"goal" | "experience" | "equipment" | "days"> = [];
  if (!s.goal) out.push("goal");
  if (!s.experience) out.push("experience");
  if (!s.equipment) out.push("equipment");
  if (!s.daysPerWeek) out.push("days");
  return out;
}
