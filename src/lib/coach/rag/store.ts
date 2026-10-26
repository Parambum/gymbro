import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The coach's knowledge base on disk, and the one loader for it.
 *
 *   coach-kb.json  sources (citation + licence) and passages (text, sentences)
 *   coach-kb.bin   the vectors: passages as float32, then sentences as int8
 *
 * Both are written by `npm run coach:kb` (scripts/coach/build-kb.ts) and are
 * committed, like the food database: the running app never fetches papers or
 * computes passage embeddings, it only embeds the user's question.
 *
 * Sentence vectors are int8 with a scale per vector. There are about five per
 * passage, and at float32 they would be most of the file; the rounding error
 * (< 0.5 % of each component) does not change which sentence ranks first.
 */

export const KB_JSON = path.join(process.cwd(), "src", "lib", "data", "coach-kb.json");
export const KB_BIN = path.join(process.cwd(), "src", "lib", "data", "coach-kb.bin");
export const KB_FORMAT_VERSION = 1;

export interface KbSource {
  /** PMCID, which is also how the build finds it again. */
  id: string;
  title: string;
  /** "Jäger, Kerksick, Campbell et al." */
  authors: string;
  journal: string;
  year: number | null;
  doi: string | null;
  url: string;
  /** "CC BY 4.0" */
  license: string;
  licenseUrl: string;
}

export interface KbPassage {
  /** Index into `sources`. */
  source: number;
  /** "Results › Protein dose" — empty for unsectioned body text. */
  section: string;
  sentences: string[];
}

export interface KbFile {
  version: number;
  builtAt: string;
  model: string;
  dim: number;
  sources: KbSource[];
  passages: KbPassage[];
  sentenceCount: number;
}

export interface KnowledgeBase extends KbFile {
  /** passages.length × dim, unit-normalised. */
  passageVectors: Float32Array;
  /** sentenceCount × dim, int8; multiply by `sentenceScales[i]` to recover. */
  sentenceVectors: Int8Array;
  sentenceScales: Float32Array;
  /** First global sentence index of each passage. */
  sentenceOffsets: Int32Array;
}

// ── binary layout ────────────────────────────────────────────────────
//   float32[P × D]   passage vectors
//   float32[S]       sentence scales
//   int8[S × D]      sentence vectors

export function encodeVectors(passages: Float32Array[], sentences: Float32Array[], dim: number): Buffer {
  const P = passages.length;
  const S = sentences.length;
  const buf = Buffer.alloc(P * dim * 4 + S * 4 + S * dim);
  let off = 0;
  for (const v of passages) {
    for (let i = 0; i < dim; i++, off += 4) buf.writeFloatLE(v[i], off);
  }
  const scalesAt = off;
  off += S * 4;
  sentences.forEach((v, s) => {
    let max = 0;
    for (let i = 0; i < dim; i++) max = Math.max(max, Math.abs(v[i]));
    const scale = max / 127 || 1;
    buf.writeFloatLE(scale, scalesAt + s * 4);
    for (let i = 0; i < dim; i++, off++) buf.writeInt8(Math.max(-127, Math.min(127, Math.round(v[i] / scale))), off);
  });
  return buf;
}

export function decodeKnowledgeBase(file: KbFile, bin: Buffer): KnowledgeBase {
  if (file.version !== KB_FORMAT_VERSION) {
    throw new Error(`coach-kb.json is format v${file.version}; this build reads v${KB_FORMAT_VERSION}. Run npm run coach:kb.`);
  }
  const { dim } = file;
  const P = file.passages.length;
  const S = file.sentenceCount;
  const expected = P * dim * 4 + S * 4 + S * dim;
  if (bin.length !== expected) {
    throw new Error(`coach-kb.bin is ${bin.length} bytes, expected ${expected} — the two files are from different builds.`);
  }

  // Copy into aligned typed arrays; a Buffer slice may sit at an odd offset.
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length);
  const passageVectors = new Float32Array(ab.slice(0, P * dim * 4));
  const sentenceScales = new Float32Array(ab.slice(P * dim * 4, P * dim * 4 + S * 4));
  const sentenceVectors = new Int8Array(ab.slice(P * dim * 4 + S * 4));

  const sentenceOffsets = new Int32Array(P);
  let running = 0;
  file.passages.forEach((p, i) => {
    sentenceOffsets[i] = running;
    running += p.sentences.length;
  });
  if (running !== S) throw new Error(`coach-kb.json lists ${running} sentences but declares ${S}.`);

  return { ...file, passageVectors, sentenceVectors, sentenceScales, sentenceOffsets };
}

let cached: KnowledgeBase | null = null;

export function loadKnowledgeBase(): KnowledgeBase {
  if (!cached) {
    const file = JSON.parse(readFileSync(KB_JSON, "utf8")) as KbFile;
    cached = decodeKnowledgeBase(file, readFileSync(KB_BIN));
  }
  return cached;
}

/** Dot product of a unit query with passage `i` — cosine similarity. */
export function passageScore(kb: KnowledgeBase, q: Float32Array, i: number): number {
  const base = i * kb.dim;
  let dot = 0;
  for (let k = 0; k < kb.dim; k++) dot += q[k] * kb.passageVectors[base + k];
  return dot;
}

/** Cosine of a unit query with global sentence `s` (dequantised on the fly). */
export function sentenceScore(kb: KnowledgeBase, q: Float32Array, s: number): number {
  const base = s * kb.dim;
  let dot = 0;
  let norm = 0;
  for (let k = 0; k < kb.dim; k++) {
    const v = kb.sentenceVectors[base + k];
    dot += q[k] * v;
    norm += v * v;
  }
  // re-normalise: quantisation nudges the length off 1
  return norm > 0 ? dot / Math.sqrt(norm) : 0;
}

/** Cosine between two stored sentences, for redundancy checks. */
export function sentencePairScore(kb: KnowledgeBase, a: number, b: number): number {
  const A = a * kb.dim;
  const B = b * kb.dim;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let k = 0; k < kb.dim; k++) {
    const x = kb.sentenceVectors[A + k];
    const y = kb.sentenceVectors[B + k];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}
