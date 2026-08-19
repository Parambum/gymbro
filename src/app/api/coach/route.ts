import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth-helpers";
import { runCoach, type CoachTurn } from "@/lib/coach/agent";

/**
 * The chat widget's only endpoint — and the switch between the project's two
 * coach backends:
 *
 *   COACH_BACKEND=ts      (default) run the Anthropic tool-runner loop here
 *   COACH_BACKEND=python  proxy to the FastAPI + LangGraph service in backend/
 *
 * Both speak the same request/response shape and load the same system prompt,
 * so the widget cannot tell them apart — flipping one env var swaps the engine.
 *
 * Auth is resolved *here*, in both modes: the user id is never accepted from
 * the client, and the Python service only trusts it because the call carries
 * the shared service token.
 */

export const runtime = "nodejs";
// Vercel's Hobby plan caps a function at 60s; asking for more fails the deploy.
export const maxDuration = 60;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40)
    // the Messages API requires the conversation to open on a user turn
    .refine((turns) => turns[0]?.role === "user", "Conversation must start with a user message."),
});

export async function POST(req: Request) {
  const backend = process.env.COACH_BACKEND ?? "ts";

  // Only the process that actually calls Anthropic needs the key: in python
  // mode that is the LangGraph service, which checks for itself.
  if (backend !== "python" && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env to enable the AI coach." },
      { status: 503 },
    );
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Signed out is allowed — the coach still demos and plans, it just loses the
  // training_log tool, which is exactly the behaviour the prompt describes.
  const userId = await currentUserId();
  const messages: CoachTurn[] = parsed.messages;

  try {
    const result =
      backend === "python"
        ? await callPythonBackend(messages, userId)
        : await runCoach(messages, userId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[coach] request failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Coach unavailable: ${message}` }, { status: 502 });
  }
}

async function callPythonBackend(messages: CoachTurn[], userId: string | null) {
  const base = process.env.COACH_PY_URL ?? "http://127.0.0.1:8000";
  const token = process.env.COACH_SERVICE_TOKEN;
  if (!token) {
    throw new Error("COACH_SERVICE_TOKEN is not set — refusing to call the coach service.");
  }

  const res = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-coach-token": token },
    body: JSON.stringify({ messages, user_id: userId }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    throw new Error(`LangGraph service returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as { reply: string; toolsUsed: string[]; backend: string };
}
