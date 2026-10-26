import settings from "../../../../shared/coach/retrieval.json";
import { buildIndex, expansionText, scoreAll, type Bm25Index } from "./bm25";
import { embed } from "./embedder";
import { loadKnowledgeBase, passageScore, type KnowledgeBase } from "./store";

/**
 * Hybrid retrieval over the research library: BM25 and embedding similarity,
 * each ranking every passage, fused by Reciprocal Rank Fusion.
 *
 * RRF sums 1/(k + rank) across rankers. It ignores the raw scores — which is
 * the point, because a BM25 score and a cosine live on unrelated scales and any
 * weighting of one against the other would be a number made up here. k = 60 is
 * the value from the original paper (Cormack et al., 2009) and is standard.
 */

const RRF_K = settings.rrfK;
/** How deep into each ranking fusion looks. */
const CANDIDATES = settings.candidates;
/** No more than this many passages from one paper, so one review cannot crowd out the rest. */
const PER_SOURCE = settings.perSource;

export interface Hit {
  passage: number;
  fused: number;
  /** Cosine of the question with this passage — the confidence signal. */
  dense: number;
  bm25: number;
}

export interface Retrieval {
  hits: Hit[];
  queryVector: Float32Array;
}

let index: { kb: KnowledgeBase; bm25: Bm25Index } | null = null;

function searchable(kb: KnowledgeBase): { kb: KnowledgeBase; bm25: Bm25Index } {
  if (!index || index.kb !== kb) {
    const texts = kb.passages.map((p) => {
      const s = kb.sources[p.source];
      return `${s.title} ${p.section} ${p.sentences.join(" ")}`;
    });
    index = { kb, bm25: buildIndex(texts) };
  }
  return index;
}

function rankOf(scores: Float32Array): Map<number, number> {
  const order = Array.from(scores.keys())
    .filter((i) => scores[i] > 0)
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, CANDIDATES);
  return new Map(order.map((passage, rank) => [passage, rank]));
}

export async function retrieve(query: string, limit = 6, kb: KnowledgeBase = loadKnowledgeBase()): Promise<Retrieval> {
  const { bm25 } = searchable(kb);
  const expansion = expansionText(query);
  const queryVector = await embed(expansion ? `${query} (${expansion})` : query, "query");

  const lexical = scoreAll(bm25, query);
  const dense = new Float32Array(kb.passages.length);
  for (let i = 0; i < dense.length; i++) dense[i] = passageScore(kb, queryVector, i);
  // Cosines are all positive-ish for this model; rank only the genuinely close.
  const denseRanks = rankOf(dense.map((v) => (v > 0 ? v : 0)));
  const lexicalRanks = rankOf(lexical);

  const fused = new Map<number, number>();
  for (const ranks of [denseRanks, lexicalRanks]) {
    for (const [passage, rank] of ranks) fused.set(passage, (fused.get(passage) ?? 0) + 1 / (RRF_K + rank + 1));
  }

  const perSource = new Map<number, number>();
  const hits: Hit[] = [];
  for (const [passage, score] of [...fused.entries()].sort((a, b) => b[1] - a[1])) {
    const source = kb.passages[passage].source;
    const used = perSource.get(source) ?? 0;
    if (used >= PER_SOURCE) continue;
    perSource.set(source, used + 1);
    hits.push({ passage, fused: score, dense: dense[passage], bm25: lexical[passage] });
    if (hits.length >= limit) break;
  }
  return { hits, queryVector };
}
