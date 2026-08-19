import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The coach persona lives in shared/coach/system-prompt.md so the Next.js
 * runtime and the FastAPI/LangGraph service read the *same bytes* — a forked
 * copy would let the two backends answer differently within a week.
 *
 * The file's editorial header (everything above the first `---` rule) is for
 * humans; only the prose below it is sent to the model.
 */
const PROMPT_PATH = path.join(process.cwd(), "shared", "coach", "system-prompt.md");

let cached: string | null = null;

export function coachSystemPrompt(): string {
  if (cached) return cached;

  const raw = readFileSync(PROMPT_PATH, "utf8");
  const marker = "\n---\n";
  const idx = raw.indexOf(marker);
  cached = (idx === -1 ? raw : raw.slice(idx + marker.length)).trim();
  return cached;
}
