import settings from "../../../../shared/coach/retrieval.json";
import { analyze } from "./bm25";
import type { Retrieval } from "./retrieve";
import { sentencePairScore, sentenceScore, type KnowledgeBase, type KbSource } from "./store";

/**
 * Turn retrieved passages into an answer without a language model.
 *
 * The answer is quoted, not written: the best few sentences from the passages,
 * each cited to its paper, then the sources. Nothing in it can be a number
 * the papers do not contain, because every word of it is from the papers —
 * which is the guarantee a coach that cannot run a model can still give.
 *
 * Choosing sentences is where the care goes. A sentence is scored on how close
 * its meaning is to the question, then nudged for being quotable alone: it
 * should not open on "This" or "They" (whose referent is in the sentence the
 * reader cannot see), should be a conclusion rather than one study's p-values,
 * and should come from the parts of a paper written to be read in isolation —
 * abstracts, conclusions, key points. Maximal Marginal Relevance then stops
 * two sentences saying the same thing from both making the cut.
 */

/** Below this passage cosine the library has nothing on the question. Calibrated by scripts/coach/eval.ts. */
export const MIN_PASSAGE_COSINE = settings.minPassageCosine;
/** A sentence weaker than this does not get quoted, however few others there are. */
export const MIN_SENTENCE_SCORE = 0.55;

const MAX_SENTENCES = 4;
const MMR_LAMBDA = 0.75;
/** Two quotes this similar say the same thing. */
const REDUNDANT = 0.9;

export interface Citation {
  /** 1-based, as shown in the text. */
  n: number;
  source: KbSource;
}

export interface ComposedAnswer {
  confident: boolean;
  /** The quoted findings, each ending in its [n]. */
  bullets: string[];
  citations: Citation[];
  /** Plain text of every quoted sentence, for grounding checks. */
  evidence: string[];
}

const PRONOUN_OPENER = /^(this|these|those|that|it|its|they|their|them|such|he|she|both|the latter|the former|here|there)\b/i;
const CONNECTIVE_OPENER = /^(however|thus|therefore|hence|in contrast|similarly|additionally|moreover|furthermore|in addition|interestingly|finally|as such|consequently|accordingly|likewise|nevertheless|nonetheless|conversely|indeed|again)\b/i;
const STUDY_DETAIL = /\bet al\b|\band colleagues\b|\band coworkers\b|\bparticipants\b|\bsubjects\b|\brandomi[sz]ed\b/i;
const STATISTICS = /\b(?:95\s?%\s?C[IrI]|CrI|SMD|ES\s?=|p\s?[=<>]|I2|I²|Hedges|effect size)\b/i;
const QUOTABLE_SECTION = /abstract|conclusion|key point|practical|summary|recommendation|position|take-home|application/i;
/**
 * Sentences about the paper rather than about training: its aims, its
 * analysis, its keywords, what future research should do. They retrieve well
 * (they restate the topic in full) and answer nothing.
 */
const PROCESS =
  /^(keywords?|background|objectives?|aims?|purpose|methods?|design|data sources?)\s*:|\b(the (aim|purpose|objective)s? of (this|the present|our)|aimed to|sought to|this (systematic )?review (aimed|was|will|included|evaluated)|this (study|paper|meta-analysis) (aimed|was|will)|we (also )?(generated|conducted|searched|analy[sz]ed|included|performed|identified|extracted|used)|future (research|studies)|further (research|studies|investigation)|more research is needed|warrants? (further|reconsideration)|remains? (unclear|unknown|to be (determined|elucidated)))\b/i;
/** Language that reports a result. A small nudge towards conclusions over setup. */
const FINDING =
  /\b(suggest|suggests|indicate|indicates|found|showed|shown|demonstrated|results? in|increase[sd]?|improve[sd]?|reduce[sd]?|did not|does not|do not|no (significant |appreciable |meaningful )?(difference|effect|advantage|benefit)|superior|similar|comparable|enhance[sd]?|recommend\w*|sufficient|effective|safe|should|appears? to|is associated)\b/i;
/** Structured-abstract labels that introduce a finding and can be dropped when quoting. */
const RESULT_LABEL = /^(conclusions?|results?|findings|practical applications?)\s*:\s*/i;

function enumeratorStripped(s: string): string {
  return s.replace(/^(?:\(?\d{1,2}[.)]|\(?[ivx]{1,4}\))\s+/i, "");
}

/** The sentence as shown: enumerator and result label removed, nothing else touched. */
function quoted(s: string): string {
  return enumeratorStripped(s).replace(RESULT_LABEL, "");
}

export function sentenceQuality(text: string, section: string): number {
  let q = 0;
  const words = text.split(/\s+/).length;
  if (!/^["'“‘(\[]?[\p{Lu}\p{N}]/u.test(enumeratorStripped(text))) q -= 0.2; // a fragment
  if (PROCESS.test(text) || /^(this|the present|our) (systematic review|review|study|meta-analysis|paper|position stand)\b/i.test(text)) q -= 0.3;
  if (/\?["'”’)]*$/.test(text)) q -= 0.3; // a question restates the topic, it does not answer it
  if (PRONOUN_OPENER.test(text)) q -= 0.08;
  if (CONNECTIVE_OPENER.test(text)) q -= 0.02;
  if (STUDY_DETAIL.test(text)) q -= 0.04;
  if (STATISTICS.test(text)) q -= 0.06;
  if (words < 8) q -= 0.05;
  if (words > 50) q -= 0.05;
  if (FINDING.test(text)) q += 0.03;
  if (RESULT_LABEL.test(text)) q += 0.03;
  if (QUOTABLE_SECTION.test(section)) q += 0.03;
  return q;
}

/** Fraction of the question's content words that a sentence contains. */
function overlap(queryTerms: Set<string>, text: string): number {
  if (queryTerms.size === 0) return 0;
  const terms = new Set(analyze(text));
  let hit = 0;
  for (const t of queryTerms) if (terms.has(t)) hit++;
  return hit / queryTerms.size;
}

interface Candidate {
  global: number;
  passage: number;
  order: number;
  text: string;
  score: number;
}

/**
 * @param alreadySaid text the coach has already shown in this conversation;
 *   a sentence quoted there is not quoted again, so "tell me more" moves on.
 */
export function composeAnswer(question: string, kb: KnowledgeBase, retrieval: Retrieval, alreadySaid = ""): ComposedAnswer {
  const empty: ComposedAnswer = { confident: false, bullets: [], citations: [], evidence: [] };
  const top = retrieval.hits[0];
  if (!top || top.dense < MIN_PASSAGE_COSINE) return empty;

  const queryTerms = new Set(analyze(question));
  const candidates: Candidate[] = [];

  // Passages to quote from: the retrieved ones, plus the summary sections
  // (abstract, conclusions, key points) of the two best-matching papers. A
  // paper's verdict usually lives in those, and they are written to be read
  // alone — but a long abstract can lose the passage ranking to a results
  // paragraph that repeats the question's words.
  const sources: Array<{ passage: number; rank: number }> = [];
  const seen = new Set<number>();
  retrieval.hits.forEach((hit, rank) => {
    // passages that are far weaker than the best are context, not evidence
    if (hit.dense < MIN_PASSAGE_COSINE - 0.04) return;
    sources.push({ passage: hit.passage, rank });
    seen.add(hit.passage);
  });
  const topSources = [...new Set(retrieval.hits.slice(0, 2).map((h) => kb.passages[h.passage].source))];
  kb.passages.forEach((p, i) => {
    if (!seen.has(i) && topSources.includes(p.source) && QUOTABLE_SECTION.test(p.section)) {
      sources.push({ passage: i, rank: retrieval.hits.length });
    }
  });

  sources.forEach(({ passage, rank }) => {
    const hit = { passage };
    const p = kb.passages[hit.passage];
    const first = kb.sentenceOffsets[hit.passage];
    p.sentences.forEach((text, k) => {
      if (alreadySaid && alreadySaid.includes(quoted(text))) return;
      const global = first + k;
      const score =
        sentenceScore(kb, retrieval.queryVector, global) +
        0.08 * overlap(queryTerms, text) +
        sentenceQuality(text, p.section) -
        0.01 * rank;
      candidates.push({ global, passage: hit.passage, order: global, text, score });
    });
  });

  // Maximal Marginal Relevance: relevance, minus similarity to what is already in.
  const chosen: Candidate[] = [];
  const pool = candidates.filter((c) => c.score >= MIN_SENTENCE_SCORE);
  while (chosen.length < MAX_SENTENCES && pool.length > 0) {
    let best = -1;
    let bestValue = -Infinity;
    pool.forEach((c, i) => {
      const redundancy = chosen.length === 0 ? 0 : Math.max(...chosen.map((s) => sentencePairScore(kb, s.global, c.global)));
      if (redundancy >= REDUNDANT) return;
      const value = MMR_LAMBDA * c.score - (1 - MMR_LAMBDA) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    });
    if (best === -1) break;
    chosen.push(pool[best]);
    pool.splice(best, 1);
  }
  if (chosen.length === 0) return empty;

  // Read in paper order: sources by first appearance in the ranking, sentences
  // as they stand in the paper, so two quotes from one paper read as prose.
  const sourceRank = new Map<number, number>();
  chosen.forEach((c) => {
    const s = kb.passages[c.passage].source;
    if (!sourceRank.has(s)) sourceRank.set(s, sourceRank.size);
  });
  chosen.sort((a, b) => {
    const sa = sourceRank.get(kb.passages[a.passage].source)!;
    const sb = sourceRank.get(kb.passages[b.passage].source)!;
    return sa - sb || a.order - b.order;
  });

  const citations: Citation[] = [...sourceRank.keys()].map((s, i) => ({ n: i + 1, source: kb.sources[s] }));
  const nOf = (passage: number) => sourceRank.get(kb.passages[passage].source)! + 1;

  return {
    confident: true,
    bullets: chosen.map((c) => `${quoted(c.text)} [${nOf(c.passage)}]`),
    citations,
    evidence: chosen.map((c) => c.text),
  };
}

/** "[1] [Title](url) — Authors, Journal (Year) · CC BY 4.0" */
export function sourceLines(citations: Citation[]): string[] {
  return citations.map(({ n, source: s }) => {
    const title = s.title.replace(/[[\]]/g, "");
    return `[${n}] [${title}](${s.url}) — ${s.authors}, ${s.year ?? "n.d."} · ${s.license}`;
  });
}
