import { checkGrounding } from "./grounding";

/**
 * Optional: a local language model (Ollama) to make research answers read like
 * a coach talking instead of a list of quotes.
 *
 * Off unless OLLAMA_URL is set — Ollama runs on a machine you control, needs no
 * key, and costs nothing per message, but Vercel cannot run it, so a deployed
 * site simply keeps the quoted answers. When it is on, the model only ever
 * rephrases findings the retrieval step already chose; it never decides what
 * is true. Its draft must pass checkGrounding, or it is thrown away.
 */

const DEFAULT_MODEL = "qwen2.5:3b";
const TIMEOUT_MS = 30_000;

export function ollamaEnabled(): boolean {
  return Boolean(process.env.OLLAMA_URL);
}

const SYSTEM = [
  "You are the GymBro coach. Answer the user's question in 2 to 4 short bullet points,",
  "using ONLY the numbered findings you are given. Each bullet starts with '- ' and ends",
  "with the [n] of the finding it comes from. Do not add any fact, number, dose, time or",
  "advice that is not in the findings, and do not mention studies, papers or findings by",
  "name — just coach. Use kg and metric units. If the findings do not answer the question,",
  "reply with exactly: INSUFFICIENT",
].join(" ");

export interface PolishResult {
  text: string | null;
  /** Why a draft was rejected, for the server log. */
  rejected?: string;
}

export async function polishWithOllama(
  question: string,
  findings: Array<{ n: number; text: string }>,
  citationCount: number,
): Promise<PolishResult> {
  const base = process.env.OLLAMA_URL!.replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const user = [
    `Question: ${question}`,
    "",
    "Findings:",
    ...findings.map((f) => `[${f.n}] ${f.text}`),
  ].join("\n");

  let content: string;
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        // low temperature: this is rephrasing, not invention
        options: { temperature: 0.2, num_predict: 400 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { text: null, rejected: `Ollama returned ${res.status}` };
    const body = (await res.json()) as { message?: { content?: string } };
    content = (body.message?.content ?? "").trim();
  } catch (err) {
    return { text: null, rejected: `Ollama unreachable: ${(err as Error).message}` };
  }

  const evidence = findings.map((f) => f.text);
  const verdict = checkGrounding(content, evidence, question, citationCount);
  if (!verdict.ok) return { text: null, rejected: verdict.reason };

  // keep only the bullets — models like to add a preamble or a sign-off
  const bullets = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => `- ${l.replace(/^[-*•]\s+/, "")}`);
  return { text: bullets.join("\n") };
}
