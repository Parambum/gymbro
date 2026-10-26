import { composeAnswer, sourceLines, type ComposedAnswer } from "@/lib/coach/rag/compose";
import { retrieve } from "@/lib/coach/rag/retrieve";
import { loadKnowledgeBase } from "@/lib/coach/rag/store";
import { trainingLogSummary, type TrainingLogSummary } from "@/lib/coach/training-log";
import type { CoachReply, CoachTurn } from "@/lib/coach/types";
import { classify, isFollowUp, wantsMore, PLAN_MARKER, QUESTIONNAIRE_MARKER } from "./intent";
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
 *   research     lib/coach/rag (hybrid retrieval over CC BY papers, quoted)
 *
 * Optionally a local Ollama model rephrases research answers; its draft is
 * kept only if every number in it is in the quoted evidence.
 */

export const SAFETY_LINE =
  "Please talk to a doctor or physical therapist before you keep training with this — pain, injury and medical conditions need someone who can examine you, and I won't program around them.";

const NO_RESEARCH =
  "I don't have research on that in my library, and I won't guess. I can answer questions on training (sets, reps, failure, rest, frequency, deloads, cardio, stretching, sleep) and nutrition (protein, creatine, caffeine, fasting, diets, supplements) — or build you a plan.";

const GREETING =
  "Hey! I'm your GymBro coach. Ask me a training or nutrition question, say **build my plan**, or ask **how am I doing** and I'll read your log.";

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

export async function runLocalCoach(messages: CoachTurn[], userId: string | null): Promise<CoachReply> {
  const at = lastUserIndex(messages);
  const message = at >= 0 ? messages[at].content : "";
  const prior = previousAssistant(messages, at);
  const detail = extractSlots([message]);
  const hasPlanDetail = Boolean(detail.goal || detail.experience || detail.equipment || detail.daysPerWeek || detail.sessionMinutes);
  const intent = classify(message, prior, hasPlanDetail);
  const toolsUsed: string[] = [];
  let backend = "local";

  const reply = (text: string): CoachReply => ({ reply: text, toolsUsed, backend });

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

      const note = await researchAnswer(review.researchTopic, review.text, toolsUsed);
      if (!note.composed.confident) return reply(review.text);
      // one finding is enough here — the log is the subject, research is the footnote
      const first = note.composed.bullets[0];
      const n = Number(first.match(/\[(\d+)\]$/)?.[1] ?? 1);
      const cite = note.composed.citations.find((c) => c.n === n)!;
      return reply(
        [review.text, "", "### Research note", `- ${first.replace(/\[\d+\]$/, "[1]")}`, "", "### Sources", ...sourceLines([{ n: 1, source: cite.source }])].join("\n"),
      );
    }

    case "research": {
      // A follow-up ("why?", "and for women?") is about the previous question.
      let question = message;
      if (isFollowUp(message) || wantsMore(message)) {
        const previous = messages.slice(0, at).filter((m) => m.role === "user").pop();
        if (previous) question = `${previous.content} ${wantsMore(message) ? "" : message}`.trim();
      }
      const alreadySaid = messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
      const answer = await researchAnswer(question, alreadySaid, toolsUsed);
      if (answer.polished) backend = "local+ollama";
      if (!answer.text) {
        return reply(wantsMore(message) ? "That's everything my library has on it — ask me something more specific, or about another topic." : NO_RESEARCH);
      }
      return reply(answer.text);
    }
  }
}
