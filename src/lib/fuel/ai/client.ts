import Anthropic from "@anthropic-ai/sdk";
import { parseDraft, normaliseDraft, type AiDraft } from "./schema";

/**
 * The one place Fuel talks to a model.
 *
 * §7 specifies the Anthropic API for these features, so unlike the chat coach
 * — which can answer on Groq — Snap-a-meal and natural-language logging need
 * `ANTHROPIC_API_KEY`. Without it the routes return 503 and the UI falls back
 * to manual entry, which is the whole point of never making the AI path the
 * only way in.
 *
 * The key is read here and never leaves the server.
 */

export const VISION_MODEL = "claude-opus-5";

/** Vercel's Hobby plan caps a function at 60s; leave room to return a body. */
const REQUEST_TIMEOUT_MS = 50_000;

export function anthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Run one request and validate the JSON, retrying **once** on a parse failure
 * with the parser's complaint fed back in (§7.1).
 *
 * The retry is deliberately a real second attempt rather than a repair pass on
 * the broken text: asking the model to fix its own malformed JSON tends to
 * produce well-formed JSON with invented contents, which is worse than
 * failing.
 */
async function requestDraft(
  client: Anthropic,
  system: string,
  content: Anthropic.ContentBlockParam[],
  effort: "low" | "medium",
): Promise<AiDraft> {
  const send = (messages: Anthropic.MessageParam[]) =>
    client.messages.create({
      model: VISION_MODEL,
      max_tokens: 4000,
      system,
      output_config: { effort },
      messages,
    });

  const first = await send([{ role: "user", content }]);
  const firstText = textOf(first);

  try {
    return normaliseDraft(parseDraft(firstText));
  } catch (err) {
    const complaint = err instanceof Error ? err.message : "invalid JSON";
    const second = await send([
      { role: "user", content },
      // No assistant prefill — it is rejected on this model family. The
      // correction goes in a user turn instead.
      { role: "assistant", content: firstText.slice(0, 2000) || "(no output)" },
      {
        role: "user",
        content: `That response could not be parsed: ${complaint}. Reply again with ONLY the JSON object described in the system prompt — no prose, no markdown fences.`,
      },
    ]);
    return normaliseDraft(parseDraft(textOf(second)));
  }
}

export async function draftFromImage(
  client: Anthropic,
  system: string,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<AiDraft> {
  return requestDraft(
    client,
    system,
    [
      { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
      { type: "text", text: "Analyze this meal." },
    ],
    "medium",
  );
}

export async function draftFromText(
  client: Anthropic,
  system: string,
  description: string,
): Promise<AiDraft> {
  return requestDraft(client, system, [{ type: "text", text: description }], "low");
}

/**
 * Turn an SDK error into something a person can act on. The typed classes are
 * the SDK's own; string-matching the message would break on the next release.
 */
export function describeAiError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 503, message: "The AI key isn't valid. Log it manually for now." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Too many requests just now — try again in a moment." };
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, message: "That took too long. Try a smaller photo, or log it manually." };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, message: "The AI service had a problem. You can still log it manually." };
  }
  return { status: 502, message: "Couldn't read that. You can still log it manually." };
}
