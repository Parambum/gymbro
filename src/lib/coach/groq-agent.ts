import Groq from "groq-sdk";
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
 * The Groq half of the coach.
 *
 * Groq speaks the OpenAI tool-calling dialect, which has no equivalent of the
 * Anthropic SDK's tool runner — so the agentic loop is written out here:
 * request → collect tool_calls → execute → feed results back as `tool`
 * messages → repeat until the model answers with prose.
 *
 * Same system prompt and same tool definitions as the Anthropic adapter; only
 * the wire format differs.
 */

/** Groq's flagship open model: 131k context and solid tool calling. */
const DEFAULT_MODEL = "openai/gpt-oss-120b";

export async function runGroqCoach(
  messages: CoachTurn[],
  userId: string | null,
): Promise<CoachReply> {
  const client = new Groq(); // reads GROQ_API_KEY
  const model = process.env.GROQ_MODEL ?? DEFAULT_MODEL;

  const tools: Groq.Chat.Completions.ChatCompletionTool[] = availableTools(userId).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema as unknown as Record<string, unknown>,
    },
  }));

  const convo: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: coachSystemPrompt() },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolsUsed: string[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await client.chat.completions.create({
      model,
      messages: convo,
      tools,
      tool_choice: "auto",
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    });

    const message = completion.choices[0]?.message;
    if (!message) break;

    const calls = message.tool_calls ?? [];

    // the assistant turn must go back in verbatim, tool_calls included, or the
    // follow-up `tool` messages have nothing to attach to
    convo.push({
      role: "assistant",
      content: message.content ?? "",
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    });

    if (calls.length === 0) {
      return {
        reply: (message.content ?? "").trim() || EMPTY_REPLY_FALLBACK,
        toolsUsed,
        backend: "groq",
      };
    }

    for (const call of calls) {
      toolsUsed.push(call.function.name);

      let args: unknown = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // a model can emit malformed JSON; tell it so rather than throwing
        args = {};
      }

      const result = await runCoachTool(call.function.name, args, userId);
      convo.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  // Loop exhausted: ask once more, tools withheld, so the user gets prose
  // instead of silence.
  const final = await client.chat.completions.create({
    model,
    messages: convo,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
  });

  return {
    reply: (final.choices[0]?.message?.content ?? "").trim() || EMPTY_REPLY_FALLBACK,
    toolsUsed,
    backend: "groq",
  };
}
