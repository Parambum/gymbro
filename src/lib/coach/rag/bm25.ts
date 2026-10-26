/**
 * Keyword retrieval (Okapi BM25), the lexical half of the coach's hybrid
 * search.
 *
 * Embeddings are good at meaning and bad at exact tokens: "HMB", "beta-alanine"
 * and "16:8" are rare strings a small model has barely seen, and BM25 nails
 * them. BM25 in turn misses paraphrase — "how much protein" against "intakes of
 * 1.6 g/kg" — which the embeddings catch. Fusing the two beats either alone.
 *
 * People ask in gym language and papers answer in physiology, so the query (and
 * only the query) is expanded through GYM_TERMS before scoring, at a lower
 * weight than the words actually typed.
 *
 * The stopwords, slang table and weights live in shared/coach/retrieval.json,
 * which backend/coach/knowledge.py reads too; this file is the algorithm.
 */

import settings from "../../../../shared/coach/retrieval.json";

const STOPWORDS = new Set(settings.stopwords.split(/\s+/));

/** Conservative suffix stripping — enough that "trained", "training" and "trains" meet. */
export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4 && !w.endsWith("eed")) return w.slice(0, -2);
  if (w.endsWith("s") && !/(ss|us|is|ys)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function analyze(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/β/g, "beta")
    .replace(/ω/g, "omega")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/**
 * Gym vocabulary → the words the papers use, from shared/coach/retrieval.json.
 * Matching is on the raw lower-cased question, so multi-word keys work; values
 * go through `analyze` like any text.
 */
const GYM_TERMS: Array<[RegExp, string]> = settings.gymTerms.map(([pattern, words]) => [new RegExp(pattern), words]);

/**
 * The papers' wording for the slang in a question, as plain words — appended to
 * the question before it is embedded, so the embedding model also learns that
 * "anabolic window" means nutrient timing. The keyword side uses the analysed
 * form of the same words (`expandQuery`).
 */
export function expansionText(text: string): string {
  const lower = text.toLowerCase();
  return GYM_TERMS.filter(([re]) => re.test(lower))
    .map(([, words]) => words)
    .join(" ");
}

export function expandQuery(text: string): string[] {
  const lower = text.toLowerCase();
  const extra: string[] = [];
  for (const [re, words] of GYM_TERMS) if (re.test(lower)) extra.push(...analyze(words));
  return extra;
}

export interface Bm25Index {
  docs: Array<Map<string, number>>;
  lengths: Float32Array;
  avgLength: number;
  df: Map<string, number>;
}

export function buildIndex(texts: string[]): Bm25Index {
  const docs = texts.map((t) => {
    const tf = new Map<string, number>();
    for (const term of analyze(t)) tf.set(term, (tf.get(term) ?? 0) + 1);
    return tf;
  });
  const lengths = Float32Array.from(docs, (d) => [...d.values()].reduce((a, b) => a + b, 0));
  const df = new Map<string, number>();
  for (const d of docs) for (const term of d.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / Math.max(docs.length, 1);
  return { docs, lengths, avgLength, df };
}

const K1 = 1.2;
const B = 0.75;
/** Expansion terms count for less than words the user actually typed. */
const EXPANSION_WEIGHT = settings.expansionWeight;

export function scoreAll(index: Bm25Index, query: string): Float32Array {
  const weights = new Map<string, number>();
  for (const t of analyze(query)) weights.set(t, 1);
  for (const t of expandQuery(query)) if (!weights.has(t)) weights.set(t, EXPANSION_WEIGHT);

  const N = index.docs.length;
  const scores = new Float32Array(N);
  for (const [term, w] of weights) {
    const n = index.df.get(term);
    if (!n) continue;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    for (let i = 0; i < N; i++) {
      const tf = index.docs[i].get(term);
      if (!tf) continue;
      const norm = tf + K1 * (1 - B + (B * index.lengths[i]) / index.avgLength);
      scores[i] += w * idf * ((tf * (K1 + 1)) / norm);
    }
  }
  return scores;
}
