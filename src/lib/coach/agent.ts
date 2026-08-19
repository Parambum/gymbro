import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { coachSystemPrompt } from "@/lib/coach/prompt";
import { webScraper } from "@/lib/coach/web-scraper";
import { DEFAULT_WINDOW_DAYS, trainingLogBrief } from "@/lib/coach/training-log";

/**
 * The TypeScript half of the coach: the SDK's beta tool runner drives the
 * agentic loop (request → tool → feed result back → repeat) so this file only
 * has to describe the tools. Same tool surface and same system prompt as the
 * LangGraph service in backend/ — see src/app/api/coach/route.ts for how a
 * request picks between them.
 */

const MODEL = "claude-opus-5";

export interface CoachTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CoachReply {
  reply: string;
  toolsUsed: string[];
  backend: "typescript";
}

/**
 * Tools are declared with raw JSON Schema rather than the SDK's Zod helper:
 * that helper is typed against Zod v4, while this app validates with the
 * classic Zod v3 API everywhere else. One schema dialect per codebase.
 */
const scraperTool = betaTool({
  name: "web_scraper",
  description:
    "Research fitness information on the live web: exact set/rep breakdowns of named " +
    "protocols (Arnold split, 5/3/1, GVT), current research on supplement or nutrient " +
    "timing, and form cues for uncommon exercises. Accepts a plain-language query or a " +
    "full URL. Use only when you cannot answer with expert-level certainty — never for " +
    "basic fitness advice.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query, or a full http(s) URL to read directly",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  run: async ({ query }) => {
    const { text } = await webScraper(query);
    return text;
  },
});

/** Bound per-request: the tool closes over the *authenticated* user id so the
 *  model can never read another lifter's log by passing an id as an argument. */
function trainingLogTool(userId: string) {
  return betaTool({
    name: "training_log",
    description:
      "The signed-in user's real logged GymBro training: sessions, working sets, tonnage, " +
      "muscle-group coverage, per-lift e1RM trend and recorded 1RMs. Call this whenever " +
      "the user asks about their own training or before writing them a custom plan. " +
      "Returns real data only — if it reports no sessions, say so instead of inventing any.",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 7,
          maximum: 365,
          description: "How many days back to summarise (default 45)",
        },
      },
      required: [],
      additionalProperties: false,
    },
    run: async ({ days }) => trainingLogBrief(userId, days ?? DEFAULT_WINDOW_DAYS),
  });
}

export async function runCoach(
  messages: CoachTurn[],
  userId: string | null,
): Promise<CoachReply> {
  const client = new Anthropic();

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    // The persona is deliberately terse — a widget-sized reply, not an essay.
    max_tokens: 4096,
    // Frozen prefix: the prompt never varies per request, so it caches cleanly.
    system: [
      { type: "text", text: coachSystemPrompt(), cache_control: { type: "ephemeral" } },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    tools: userId ? [scraperTool, trainingLogTool(userId)] : [scraperTool],
    // Chat-widget latency matters more here than deep deliberation; the hard
    // reasoning in this app is the analytics, not the coaching reply.
    output_config: { effort: "medium" },
    max_iterations: 6,
  });

  const toolsUsed: string[] = [];
  let final: Anthropic.Beta.BetaMessage | undefined;

  // Each iteration yields one complete assistant message; the last one is the
  // answer. Both tools are client-side, so there is no pause_turn to resume.
  for await (const message of runner) {
    final = message;
    for (const block of message.content) {
      if (block.type === "tool_use") toolsUsed.push(block.name);
    }
  }

  const reply =
    final?.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() ?? "";

  return {
    reply: reply || "I didn't catch that — mind rephrasing?",
    toolsUsed,
    backend: "typescript",
  };
}
