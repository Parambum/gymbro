/**
 * Is a model-written answer faithful to the evidence it was given?
 *
 * The keyless coach can hand its quoted findings to a local model (Ollama) to
 * be rephrased conversationally. Small local models are fluent and careless:
 * the failure that matters here is a dose, a percentage or a range that sounds
 * right and is not in any paper. So a rewrite is accepted only if:
 *
 *   - every number in it appears in the evidence or in the user's question
 *     ("1.6", "1,6" and "one point six" are not distinguished, but "1.6" and
 *     "1.8" are);
 *   - every bullet cites a source, and only sources that exist;
 *   - it did not decline (INSUFFICIENT) and contains no links.
 *
 * Anything else falls back to the verbatim quotes, which cannot fail this test.
 */

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8",
  nine: "9", ten: "10", eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30",
  forty: "40", fifty: "50", hundred: "100", half: "0.5",
};

function canonical(raw: string): string {
  let s = raw;
  if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ""); // 3,000
  s = s.replace(",", "."); // 1,6 (decimal comma)
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, ""); // 2.0 → 2
  return s.replace(/^0+(?=\d)/, "");
}

export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  const stripped = text.replace(/\[\d+\]/g, " "); // citation markers are not claims
  for (const m of stripped.matchAll(/\d+(?:[.,]\d+)*/g)) out.add(canonical(m[0]));
  for (const m of stripped.toLowerCase().matchAll(/\b([a-z]+)\b/g)) {
    const n = NUMBER_WORDS[m[1]];
    if (n) out.add(n);
  }
  return out;
}

export interface GroundingResult {
  ok: boolean;
  reason?: string;
}

export function checkGrounding(answer: string, evidence: string[], question: string, citationCount: number): GroundingResult {
  if (/INSUFFICIENT/i.test(answer)) return { ok: false, reason: "model declined" };
  if (/https?:\/\/|www\./i.test(answer)) return { ok: false, reason: "contains a link" };
  if (answer.length > 1200) return { ok: false, reason: "too long" };

  const allowed = numbersIn([...evidence, question].join(" "));
  for (const n of numbersIn(answer)) {
    if (!allowed.has(n)) return { ok: false, reason: `number ${n} is not in the evidence` };
  }

  const bullets = answer.split("\n").map((l) => l.trim()).filter((l) => /^[-*•]\s+/.test(l));
  if (bullets.length === 0) return { ok: false, reason: "no bullet points" };
  for (const b of bullets) {
    const cited = [...b.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    if (cited.length === 0) return { ok: false, reason: "a bullet has no citation" };
    if (cited.some((n) => n < 1 || n > citationCount)) return { ok: false, reason: "cites a source that does not exist" };
  }
  return { ok: true };
}
