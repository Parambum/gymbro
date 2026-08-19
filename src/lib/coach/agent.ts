import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { coachSystemPrompt } from "@/lib/coach/prompt";
import { availableTools, runCoachTool } from "@/lib/coach/tools";
import {
  EMPTY_REPLY_FALLBACK,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_ITERATIONS,
  type CoachReply,
  type CoachTurn,
} from "@/lib/coach/types";

/**
 * The Anthropic half of the coach: the SDK's beta tool runner drives the
 * agentic loop (request → tool → feed result back → repeat), so this file only
 * has to translate the shared tool definitions into Anthropic's shape.
 *
 * Tools are declared with raw JSON Schema rather than the SDK's Zod helper:
 * that helper is typed against Zod v4, while this app validates with the
 * classic Zod v3 API everywhere else. One schema dialect per codebase.
 */

const MODEL = "claude-opus-5";

/** The shared schemas are `as const`; the SDK wants a mutable object schema. */
type ObjectSchema = { type: "object"; [key: string]: unknown };

function anthropicTool(
  def: { name: string; description: string; schema: unknown },
  userId: string | null,
) {
  return betaTool({
    name: def.name,
    description: def.description,
    inputSchema: def.schema as ObjectSchema,
    // The user id is bound here, never taken as a tool argument, so the model
    // cannot ask for somebody else's log.
    run: async (input: unknown) => runCoachTool(def.name, input, userId),
  });
}

export async function runCoach(
  messages: CoachTurn[],
  userId: string | null,
): Promise<CoachReply> {
  const client = new Anthropic();

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Frozen prefix: the prompt never varies per request, so it caches cleanly.
    system: [
      { type: "text", text: coachSystemPrompt(), cache_control: { type: "ephemeral" } },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    tools: availableTools(userId).map((def) => anthropicTool(def, userId)),
    // Chat-widget latency matters more here than deep deliberation; the hard
    // reasoning in this app is the analytics, not the coaching reply.
    output_config: { effort: "medium" },
    max_iterations: MAX_TOOL_ITERATIONS,
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
    reply: reply || EMPTY_REPLY_FALLBACK,
    toolsUsed,
    backend: "anthropic",
  };
}
