/**
 * Turning the model's probability vector into what the result card says.
 *
 * Kept separate from the worker and the UI because these few lines decide
 * when the app claims to know what's on the plate, and that decision should be
 * testable and reviewable on its own.
 */

export interface Guess {
  key: string;
  prob: number;
}

/** The `k` most likely classes, best first. */
export function topK(probs: ArrayLike<number>, classes: readonly string[], k = 5): Guess[] {
  if (probs.length !== classes.length) {
    throw new Error(`model returned ${probs.length} scores for ${classes.length} classes`);
  }
  const idx = Array.from({ length: probs.length }, (_, i) => i);
  idx.sort((a, b) => probs[b] - probs[a]);
  return idx.slice(0, k).map((i) => ({ key: classes[i], prob: probs[i] }));
}

export type Verdict =
  /** One answer worth leading with. */
  | { kind: "confident"; best: Guess; others: Guess[] }
  /** Close call or low confidence — show the shortlist, not a single answer. */
  | { kind: "unsure"; shortlist: Guess[] };

/**
 * The model's probabilities are temperature-calibrated on held-out data, so
 * "0.62" really does mean right about 62% of the time on test photos. The
 * threshold comes from the evaluation report (model.json) rather than being
 * fixed here, so retraining moves it with the evidence.
 *
 * Even above the threshold, a near-tie with the runner-up is shown as a
 * shortlist: "72% samosa / 21% kachori" is a genuine either-or, and picking
 * one silently would be overclaiming.
 */
export function verdict(guesses: Guess[], threshold: number, tieMargin = 0.15): Verdict {
  const [best, second] = guesses;
  if (!best) return { kind: "unsure", shortlist: [] };
  const tie = second != null && best.prob - second.prob < tieMargin;
  if (best.prob >= threshold && !tie) return { kind: "confident", best, others: guesses.slice(1) };
  return { kind: "unsure", shortlist: guesses };
}

/** Human-sized confidence: never "100%", never "0%". */
export function confidenceLabel(prob: number): string {
  const pct = Math.round(prob * 100);
  return `${Math.min(99, Math.max(1, pct))}%`;
}
