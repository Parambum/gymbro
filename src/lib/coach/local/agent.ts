import { composeAnswer, sourceLines, type ComposedAnswer } from "@/lib/coach/rag/compose";
import { retrieve } from "@/lib/coach/rag/retrieve";
import { loadKnowledgeBase } from "@/lib/coach/rag/store";
import { trainingLogSummary, type TrainingLogSummary } from "@/lib/coach/training-log";
import type { CoachReply, CoachTurn } from "@/lib/coach/types";
import { connectDB } from "@/lib/db/mongoose";
import { matchDescription } from "@/lib/fuel/describe-server";
import { visibleTo } from "@/lib/fuel/food-pool";
import { isFuelEnabled } from "@/lib/fuel/flag";
import { todayIso } from "@/lib/date-utils";
import { classify, isFollowUp, wantsMore, PLAN_MARKER, QUESTIONNAIRE_MARKER } from "./intent";
import {
  FOOD_MATCHING,
  FOOD_MARKER,
  compareReply,
  foodReply,
  noFoodReply,
  readFoodAsk,
  readFoodCompare,
  type FoodAsk,
  type FoodCompare,
  type FoodReplyOptions,
} from "./food";
import { asksForTarget, intakeReply, type DayIntake } from "./nutrition";
import { loadDayIntake } from "./nutrition-server";
import { goalIn, plantBasedIn, readSupplementAsk, supplementReply, weightIn, type SupplementContext } from "./supplements";
import { assessClarity, type Clarity } from "./understand";
import { reviewLog } from "./log-review";
import { ollamaEnabled, polishWithOllama } from "./ollama";
import { demoReply, planReply, questionnaireReply } from "./plan";
import { extractSlots, missingSlots } from "./slots";

/**
 * The coach that needs no API key.
 *
 * Same request and reply shape as the Anthropic and Groq engines, and the same
 * behaviours the shared system prompt asks of them — safety first, demo,
 * questionnaire, plan, a read on the real training log, and research — but
 * every one is carried out by code the app already trusts:
 *
 *   plans        lib/training/program.ts (the guided setup's generator)
 *   your log     lib/coach/training-log.ts (real sets from Mongo)
 *   foods        lib/fuel/describe-server.ts (the food database, as Fuel searches it)
 *   your eating  lib/coach/local/nutrition-server.ts (the Fuel log, today's target)
 *   research     lib/coach/rag (hybrid retrieval over CC BY papers, quoted)
 *
 * A message it can't read gets a question back, not a guess. Optionally a
 * local Ollama model rephrases research answers; its draft is kept only if
 * every number in it is in the quoted evidence.
 */

export const SAFETY_LINE =
  "Please talk to a doctor or physical therapist before you keep training with this — pain, injury and medical conditions need someone who can examine you, and I won't program around them.";

const ABILITIES = [
  "- **Any food, in depth** — *apple*, *calories in 2 eggs*, *is paneer good for bulking?*, *rice vs roti for a cut*",
  "- **Supplements** — *what supplements should I take?*, *how much creatine?*, *are BCAAs worth it?*",
  "- **Training and nutrition questions** from research — *how long should I rest between sets?*",
  "- **A plan built for you** — *build my plan*",
  "- **Your logs** — *how am I doing?* or *how many calories have I got left?*",
].join("\n");

const NO_RESEARCH = [
  "I don't have research on that in my library, and I won't guess. It covers training (sets, reps, failure, rest, frequency, deloads, cardio, stretching, sleep) and nutrition (protein, creatine, caffeine, fasting, diets, supplements).",
  "",
  "Or I can:",
  ABILITIES,
].join("\n");

const GREETING = ["Hey! I'm your GymBro coach. I can:", ABILITIES].join("\n");

const RESEARCH_DOWN =
  "My research library isn't loading right now, so I can't quote papers for this one — and I won't answer from memory. I can still look up foods, build plans and read your logs; try the question again in a minute.";

/** Shown when a message can't be read. Asks instead of guessing. */
function clarifyReply(message: string, c: Clarity | null): string {
  if (c?.otherScript) {
    return [
      "I can only read English for now — Hinglish in English letters works too, like *kitna protein in paneer*. What would you like to know?",
      "",
      ABILITIES,
    ].join("\n");
  }
  const said = message.trim().length > 40 ? `${message.trim().slice(0, 40)}…` : message.trim();
  const hints = c ? Object.entries(c.suggestions).map(([from, to]) => `Did you mean **${to}** (not “${from}”)?`) : [];
  return [
    said ? `I'm not sure what you mean by “${said}”. What are you trying to find out?` : "What are you trying to find out?",
    ...(hints.length ? ["", ...hints] : []),
    "",
    "I can:",
    ABILITIES,
  ].join("\n");
}

/** The user message just before the most recent food reply — what "it" refers to. */
function lastFoodQuestion(messages: CoachTurn[], before: number): string | null {
  for (let i = before - 1; i > 0; i--) {
    if (messages[i].role === "assistant" && messages[i].content.includes(FOOD_MARKER) && messages[i - 1].role === "user") {
      return readFoodAsk(messages[i - 1].content)?.text ?? messages[i - 1].content;
    }
  }
  return null;
}

/**
 * The signed-in user's day and profile, or null. A failure here only costs the
 * personal lines of a reply, never the reply.
 */
async function userDay(userId: string | null, date: string, toolsUsed: string[]): Promise<DayIntake | null> {
  if (!userId || !isFuelEnabled()) return null;
  try {
    const day = await loadDayIntake(userId, date);
    toolsUsed.push("fuel_log");
    return day;
  } catch (err) {
    console.error("[coach] fuel profile read failed:", err);
    return null;
  }
}

function foodOptions(day: DayIntake | null, signedIn: boolean): FoodReplyOptions {
  const t = day?.target ?? null;
  return {
    hideCalories: Boolean(day?.eyesOff),
    signedIn,
    goal: day?.about?.goal ?? null,
    target: t ? { kcal: t.kcal, proteinG: t.proteinG } : null,
    remainingKcal: t && day && day.items > 0 ? t.kcal - day.consumed.kcal : null,
  };
}

/**
 * Answer a food question from the database, or null to let the message go on
 * to research — an implicit ask ("car") that matches nothing was probably
 * not about food.
 */
async function foodAnswer(ask: FoodAsk, userId: string | null, date: string, toolsUsed: string[]): Promise<string | null> {
  if (!isFuelEnabled()) {
    return ask.explicit ? "Food lookups are switched off on this server, so I can't give you numbers for that." : null;
  }
  try {
    await connectDB();
    const [{ matches, unclear }, day] = await Promise.all([
      matchDescription(ask.text, visibleTo(userId), FOOD_MATCHING),
      userDay(userId, date, toolsUsed),
    ]);
    toolsUsed.push("food_lookup");
    if (matches.length === 0) return ask.explicit ? noFoodReply(ask) : null;
    // "apple asdfgh" is still about the apple; "the car park" is not about carrots
    if (!ask.explicit && unclear.length > matches.length) return null;
    return foodReply(ask, matches, unclear, foodOptions(day, Boolean(userId)));
  } catch (err) {
    console.error("[coach] food lookup failed:", err);
    return ask.explicit ? "I can't reach the food database right now, so I can't give you numbers for that. Try again in a minute." : null;
  }
}

async function compareAnswer(cmp: FoodCompare, userId: string | null, date: string, toolsUsed: string[]): Promise<string> {
  if (!isFuelEnabled()) return "Food lookups are switched off on this server, so I can't compare those.";
  try {
    await connectDB();
    const [left, right, day] = await Promise.all([
      matchDescription(cmp.a, visibleTo(userId), FOOD_MATCHING),
      matchDescription(cmp.b, visibleTo(userId), FOOD_MATCHING),
      userDay(userId, date, toolsUsed),
    ]);
    toolsUsed.push("food_lookup");
    const missing = [left.matches[0] ? null : cmp.a, right.matches[0] ? null : cmp.b].filter(Boolean);
    if (missing.length) {
      return `I couldn't find ${missing.map((m) => `**${m}**`).join(" or ")} in the food database, so I can't compare them fairly. Try a simpler name, like "rice" or "roti".`;
    }
    return compareReply(cmp, left.matches[0], right.matches[0], foodOptions(day, Boolean(userId)));
  } catch (err) {
    console.error("[coach] food comparison failed:", err);
    return "I can't reach the food database right now, so I can't compare those. Try again in a minute.";
  }
}

/** What the coach knows about the person, for supplement doses and advice. */
function supplementContext(messages: CoachTurn[], message: string, day: DayIntake | null): SupplementContext {
  const said = messages.filter((m) => m.role === "user").map((m) => m.content);
  const stated = weightIn(said);
  const fromLog = day?.about?.weightKg ?? null;
  const birth = day?.about?.birthDate;
  const age = birth ? (Date.now() - Date.parse(birth)) / (365.25 * 24 * 3600 * 1000) : null;
  const profileGoal = day?.about?.goal === "lose" ? "fat-loss" : day?.about?.goal ? "muscle" : null;
  return {
    weightKg: stated ?? fromLog,
    weightFrom: stated ? "message" : fromLog ? "log" : null,
    plantBased: said.some((s) => plantBasedIn(s.toLowerCase())) || ["veg", "vegan", "jain"].includes(day?.about?.dietPref ?? ""),
    goal: goalIn(message.toLowerCase()) ?? profileGoal,
    minor: age != null && age < 18,
    proteinTargetG: day?.target?.proteinG ?? null,
  };
}

function lastUserIndex(messages: CoachTurn[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return i;
  return -1;
}

function previousAssistant(messages: CoachTurn[], before: number): string | null {
  for (let i = before - 1; i >= 0; i--) if (messages[i].role === "assistant") return messages[i].content;
  return null;
}

/**
 * The user turns that belong to the current plan conversation: from the
 * request that started it to now. Earlier chat ("does creatine add fat?")
 * must not leak into the plan's inputs.
 */
function planTurns(messages: CoachTurn[]): string[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    // questionnaires and earlier plans are part of the same conversation, so a
    // tweak ("switch to dumbbells") keeps every other answer already given
    const partOfPlan = m.content.includes(QUESTIONNAIRE_MARKER) || m.content.includes(PLAN_MARKER);
    if (m.role === "assistant" && !partOfPlan) {
      start = i + 1;
      break;
    }
  }
  return messages.slice(start).filter((m) => m.role === "user").map((m) => m.content);
}

async function researchAnswer(
  question: string,
  alreadySaid: string,
  toolsUsed: string[],
): Promise<{ composed: ComposedAnswer; text: string | null; polished: boolean }> {
  const kb = loadKnowledgeBase();
  toolsUsed.push("knowledge_search");
  const retrieval = await retrieve(question);
  const composed = composeAnswer(question, kb, retrieval, alreadySaid);
  if (!composed.confident) return { composed, text: null, polished: false };

  let body = composed.bullets.map((b) => `- ${b}`).join("\n");
  let polished = false;
  if (ollamaEnabled()) {
    const result = await polishWithOllama(
      question,
      composed.bullets.map((b, i) => ({ n: Number(b.match(/\[(\d+)\]$/)?.[1] ?? 0), text: composed.evidence[i] })),
      composed.citations.length,
    );
    if (result.text) {
      body = result.text;
      polished = true;
    } else if (result.rejected) {
      console.warn(`[coach] local model draft rejected: ${result.rejected}`);
    }
  }

  const text = [
    polished ? "### Coach's take" : "### What the research says",
    body,
    "",
    "### Sources",
    ...sourceLines(composed.citations),
  ].join("\n");
  return { composed, text, polished };
}

export interface LocalCoachContext {
  /** The user's own calendar date (yyyy-mm-dd), sent by the widget — "today" is theirs, not the server's. */
  localDate?: string;
}

/**
 * @param note a line to put above the reply — set when the message was read
 *   with a typo corrected, so the user sees what the coach took them to mean.
 */
export async function runLocalCoach(
  messages: CoachTurn[],
  userId: string | null,
  ctx: LocalCoachContext = {},
  note?: string,
): Promise<CoachReply> {
  const at = lastUserIndex(messages);
  const message = at >= 0 ? messages[at].content : "";
  const prior = previousAssistant(messages, at);
  const detail = extractSlots([message]);
  const hasPlanDetail = Boolean(detail.goal || detail.experience || detail.equipment || detail.daysPerWeek || detail.sessionMinutes);
  const intent = classify(message, prior, hasPlanDetail);
  const toolsUsed: string[] = [];
  const date = ctx.localDate ?? todayIso();
  let backend = "local";

  const reply = (text: string): CoachReply => ({ reply: note ? `${note}\n\n${text}` : text, toolsUsed, backend });

  switch (intent) {
    case "safety":
      return reply(SAFETY_LINE);

    case "greeting":
      return reply(GREETING);

    case "thanks":
      return reply("Anytime. Ask away whenever you need me.");

    case "demo":
      return reply(demoReply());

    case "plan": {
      const slots = extractSlots(planTurns(messages));
      const missing = missingSlots(slots);
      if (missing.length > 0) return reply(questionnaireReply(slots, missing));

      let summary: TrainingLogSummary | null = null;
      if (userId) {
        toolsUsed.push("training_log");
        summary = await trainingLogSummary(userId);
      }
      return reply(
        planReply(
          { ...slots, goal: slots.goal!, experience: slots.experience!, equipment: slots.equipment!, daysPerWeek: slots.daysPerWeek! },
          summary?.activity?.lifts ?? null,
        ),
      );
    }

    case "my-training": {
      if (!userId) {
        return reply(
          "Sign in and log a session, and I'll read your real training — I don't make up numbers. Meanwhile, say **build my plan** and I'll write you a week to start from.",
        );
      }
      toolsUsed.push("training_log");
      const review = reviewLog(await trainingLogSummary(userId));
      if (!review.researchTopic) return reply(review.text);

      let research: Awaited<ReturnType<typeof researchAnswer>>;
      try {
        research = await researchAnswer(review.researchTopic, review.text, toolsUsed);
      } catch (err) {
        // the log review stands on its own; the research note is a footnote
        console.error("[coach] research library failed:", err);
        return reply(review.text);
      }
      if (!research.composed.confident) return reply(review.text);
      // one finding is enough here — the log is the subject, research is the footnote
      const first = research.composed.bullets[0];
      const n = Number(first.match(/\[(\d+)\]$/)?.[1] ?? 1);
      const cite = research.composed.citations.find((c) => c.n === n)!;
      return reply(
        [review.text, "", "### Research note", `- ${first.replace(/\[\d+\]$/, "[1]")}`, "", "### Sources", ...sourceLines([{ n: 1, source: cite.source }])].join("\n"),
      );
    }

    case "my-nutrition": {
      if (!userId) {
        return reply(
          "Sign in and log your meals in **Fuel**, and I'll tell you exactly where you stand — I don't make up numbers. Meanwhile, ask me what's in a food, like **calories in 2 eggs**.",
        );
      }
      if (!isFuelEnabled()) return reply("Fuel is switched off on this server, so there's no food log for me to read.");
      try {
        toolsUsed.push("fuel_log");
        const intake = await loadDayIntake(userId, date);
        return reply(intakeReply(intake, asksForTarget(message) ? "target" : "today"));
      } catch (err) {
        console.error("[coach] fuel log read failed:", err);
        return reply("I can't reach your food log right now — try again in a minute.");
      }
    }

    case "supplements": {
      const ask = readSupplementAsk(message)!;
      let kb: ReturnType<typeof loadKnowledgeBase>;
      try {
        kb = loadKnowledgeBase();
      } catch (err) {
        console.error("[coach] research library failed:", err);
        return reply(RESEARCH_DOWN);
      }
      toolsUsed.push("knowledge_search");
      const day = await userDay(userId, date, toolsUsed);
      return reply(supplementReply(ask, supplementContext(messages, message, day), kb));
    }

    case "food-compare":
      return reply(await compareAnswer(readFoodCompare(message)!, userId, date, toolsUsed));

    case "food": {
      let ask = readFoodAsk(message)!;
      // "how much protein in it?" — the food from the last answer
      if (/^(it|that|this|them|those|these)$/i.test(ask.text)) {
        const previous = lastFoodQuestion(messages, at);
        if (previous) ask = { ...ask, text: previous };
      }
      return reply((await foodAnswer(ask, userId, date, toolsUsed)) ?? noFoodReply(ask));
    }

    case "research": {
      // "and 2 rotis" right after a food answer adds to the meal
      if (prior?.includes(FOOD_MARKER)) {
        const more = message.trim().match(/^(?:and|also|plus|add|with|what about|how about)\s+(.+?)[?.!]*$/i);
        if (more) {
          const text = await foodAnswer({ text: more[1], nutrient: null, explicit: true }, userId, date, toolsUsed);
          if (text) return reply(text);
        }
      }

      // A message that is only food — "apple", "2 roti and dal".
      const implicit = readFoodAsk(message);
      if (implicit && !implicit.explicit && !isFollowUp(message)) {
        const text = await foodAnswer(implicit, userId, date, toolsUsed);
        if (text) return reply(text);
      }

      // Typos with exactly one sensible reading ("protien", "creatin") are
      // read that way — once — and the reply says so.
      const clarity = assessClarity(message);
      const corrections = Object.entries(clarity.suggestions);
      if (!note && corrections.length > 0 && corrections.length === clarity.unknown.length) {
        const fixed = messages.map((m, i) => (i === at ? { ...m, content: clarity.corrected } : m));
        const reading = corrections.map(([from, to]) => `“${from}” as “${to}”`).join(", ");
        return runLocalCoach(fixed, userId, ctx, `*(Reading ${reading}.)*`);
      }

      // Can't tell what was said: ask, rather than answer something nearby.
      if (clarity.unclear) return reply(clarifyReply(message, clarity));

      // A follow-up ("why?", "and for women?") is about the previous question.
      let question = message;
      if (isFollowUp(message) || wantsMore(message)) {
        const previous = messages.slice(0, at).filter((m) => m.role === "user").pop();
        if (previous) question = `${previous.content} ${wantsMore(message) ? "" : message}`.trim();
      }
      const alreadySaid = messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
      let answer: Awaited<ReturnType<typeof researchAnswer>>;
      try {
        answer = await researchAnswer(question, alreadySaid, toolsUsed);
      } catch (err) {
        console.error("[coach] research library failed:", err);
        return reply(RESEARCH_DOWN);
      }
      if (answer.polished) backend = "local+ollama";
      if (!answer.text) {
        if (wantsMore(message)) return reply("That's everything my library has on it — ask me something more specific, or about another topic.");
        // A word or two that matched nothing ("car") is more likely a
        // half-finished thought than a research question — ask.
        if (message.trim().split(/\s+/).length <= 3 && !message.includes("?")) return reply(clarifyReply(message, null));
        return reply(NO_RESEARCH);
      }
      return reply(answer.text);
    }
  }
}
