/**
 * Check the in-app embedder against the official implementations.
 *
 *   npm run coach:verify
 *
 * Compares src/lib/coach/rag/embedder-reference.json (written by
 * verify-embedder.py from Hugging Face `tokenizers` + native onnxruntime) with
 * what the app computes: token ids must be identical, and vectors must agree to
 * cosine >= 0.995 — WASM and native int8 kernels round differently, so exact
 * equality is not the bar, but a tokenizer bug would show up far below it.
 */
import { readFileSync } from "node:fs";
import { EMBED_DIM, MODEL_DIR, embed } from "../../src/lib/coach/rag/embedder";
import { WordPieceTokenizer } from "../../src/lib/coach/rag/tokenizer";

const MIN_COSINE = 0.995;

interface Reference {
  cases: Array<{ text: string; ids: number[]; vector: number[] }>;
}

async function main() {
  const ref = JSON.parse(readFileSync("src/lib/coach/rag/embedder-reference.json", "utf8")) as Reference;
  const tokenizer = new WordPieceTokenizer(readFileSync(`${MODEL_DIR}/vocab.txt`, "utf8"));
  let failures = 0;

  for (const [i, c] of ref.cases.entries()) {
    const ids = tokenizer.encode(c.text).inputIds;
    const idsOk = JSON.stringify(ids) === JSON.stringify(c.ids);
    // the reference text already carries any query prefix, so embed it raw
    const v = await embed(c.text, "passage");
    let cos = 0;
    for (let k = 0; k < EMBED_DIM; k++) cos += v[k] * c.vector[k];
    const ok = idsOk && cos >= MIN_COSINE;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} #${i}  ids ${idsOk ? "identical" : "DIFFER"}  cosine ${cos.toFixed(6)}  ${JSON.stringify(c.text.slice(0, 50))}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} case(s) failed.`);
    process.exit(1);
  }
  console.log(`\nall ${ref.cases.length} cases agree with the reference implementation`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
