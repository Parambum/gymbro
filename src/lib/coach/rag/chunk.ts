import type { Paragraph } from "./jats";
import { splitSentences } from "./sentences";

/**
 * Cut an article's paragraphs into retrieval passages.
 *
 * A passage is consecutive paragraphs from one section, up to TARGET tokens —
 * long enough to hold a finding together with its qualifier ("…but only in
 * trained men"), short enough that one passage is about one thing. A section
 * change always starts a new passage, so a heading never describes text that
 * is not under it. A paragraph longer than MAX is split between sentences,
 * never inside one.
 *
 * Token counts are the embedding model's own (passed in), because the model
 * silently truncates past 512 and anything it cannot see cannot be found.
 */

export const TARGET_TOKENS = 200;
export const MAX_TOKENS = 320;

export interface Chunk {
  section: string[];
  text: string;
  sentences: string[];
}

/**
 * A sentence the coach could quote on its own. Fragments ("Not applicable.",
 * a list heading) and sentences about a table or figure the user cannot see
 * ("Table 2 presents…", whose number went with the dropped <xref>) are not.
 */
export function usableSentence(s: string): boolean {
  if (s.split(/\s+/).length < 4) return false;
  if (/\b(?:Fig|Figs|Figure|Figures|Table|Tables)\b|Additional file|Supplementary/.test(s)) return false;
  return true;
}

function sameSection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

export function chunkParagraphs(paragraphs: Paragraph[], countTokens: (text: string) => number): Chunk[] {
  const chunks: Chunk[] = [];
  let section: string[] = [];
  let sentences: string[] = [];
  let tokens = 0;

  const flush = () => {
    if (sentences.length > 0) chunks.push({ section, text: sentences.join(" "), sentences });
    sentences = [];
    tokens = 0;
  };

  for (const p of paragraphs) {
    if (!sameSection(p.section, section)) {
      flush();
      section = p.section;
    }
    const parts = splitSentences(p.text).filter(usableSentence);
    if (parts.length === 0) continue;
    const cost = countTokens(parts.join(" "));

    // A whole paragraph that fits joins the passage; one that would overflow
    // starts a new passage instead of being split across two.
    if (cost <= MAX_TOKENS) {
      if (tokens > 0 && tokens + cost > TARGET_TOKENS) flush();
      sentences.push(...parts);
      tokens += cost;
      continue;
    }

    // Too long for any passage: pack its sentences.
    flush();
    for (const s of parts) {
      const c = countTokens(s);
      if (tokens > 0 && tokens + c > TARGET_TOKENS) flush();
      sentences.push(s);
      tokens += c;
    }
    flush();
  }
  flush();

  // A stray heading-only line or caption fragment is not a passage.
  return chunks.filter((c) => c.text.split(/\s+/).length >= 12);
}
