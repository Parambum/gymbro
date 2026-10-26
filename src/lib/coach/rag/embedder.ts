import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type * as OrtTypes from "onnxruntime-web";
import { WordPieceTokenizer } from "./tokenizer";

/**
 * Sentence embeddings on the server, with no API and no key.
 *
 * bge-small-en-v1.5 (BAAI, MIT): a 33M-parameter BERT that maps a passage to
 * 384 numbers, so that passages meaning similar things land close together.
 * The 8-bit quantised ONNX export is 34 MB and runs on onnxruntime-web's WASM
 * backend — the same runtime the food model already uses on the phone, so this
 * adds no new native dependency, which matters on Vercel where a function is
 * capped at 250 MB.
 *
 * bge pools on the [CLS] token and expects queries (not passages) to carry an
 * instruction prefix; both details are from the model card, and getting either
 * wrong costs retrieval quality without raising an error.
 */

export const EMBED_DIM = 384;
export const EMBED_MODEL_ID = "BAAI/bge-small-en-v1.5 (Xenova int8 ONNX)";
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

export const MODEL_DIR = path.join(process.cwd(), "models", "coach", "bge-small-en-v1.5");

interface Loaded {
  ort: typeof OrtTypes;
  session: OrtTypes.InferenceSession;
  tokenizer: WordPieceTokenizer;
}

let loading: Promise<Loaded> | null = null;

/**
 * Loaded once per process and shared. The first call costs a second or two
 * (reading 34 MB and compiling WASM); every later one is a ~20 ms forward pass.
 * A failed load is not cached, so a transient error does not stick.
 */
function load(modelDir: string = MODEL_DIR): Promise<Loaded> {
  if (!loading) {
    loading = (async () => {
      // Loaded from node_modules at runtime rather than bundled: the package
      // locates its .wasm files relative to itself. The path is fixed, not
      // resolved — webpack rewrites createRequire() inside Next's server bundle
      // into a require with no .resolve — and it is the same path
      // next.config.ts tells the file tracer to ship.
      const dist = path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
      const mod = (await import(/* webpackIgnore: true */ pathToImport(path.join(dist, "ort.node.min.mjs")))) as
        | typeof OrtTypes
        | { default: typeof OrtTypes };
      const ort = "InferenceSession" in mod ? mod : mod.default;

      ort.env.wasm.numThreads = 1; // a serverless function has one core to give
      ort.env.logLevel = "error";

      const tokenizer = new WordPieceTokenizer(readFileSync(path.join(modelDir, "vocab.txt"), "utf8"));
      const session = await ort.InferenceSession.create(
        readFileSync(path.join(modelDir, "model_quantized.onnx")),
        { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
      );
      return { ort, session, tokenizer };
    })().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

/** `import()` wants a URL on Windows; a bare `C:\…` path is read as a scheme. */
function pathToImport(p: string): string {
  return pathToFileURL(p).href;
}

function l2normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

/** Embed one text. Passages go in as-is; queries get `QUERY_PREFIX` first. */
export async function embed(text: string, kind: "query" | "passage", modelDir?: string): Promise<Float32Array> {
  const { ort, session, tokenizer } = await load(modelDir);
  const enc = tokenizer.encode(kind === "query" ? QUERY_PREFIX + text : text);
  const n = enc.inputIds.length;
  const tensor = (values: number[]) =>
    new ort.Tensor("int64", BigInt64Array.from(values, (x) => BigInt(x)), [1, n]);

  const feeds: Record<string, OrtTypes.Tensor> = {
    input_ids: tensor(enc.inputIds),
    attention_mask: tensor(enc.attentionMask),
  };
  if (session.inputNames.includes("token_type_ids")) feeds.token_type_ids = tensor(enc.tokenTypeIds);

  const out = await session.run(feeds);
  const hidden = out.last_hidden_state ?? out[session.outputNames[0]];
  const data = hidden.data as Float32Array;
  // [1, seq, 384] — [CLS] is position 0, the first 384 values
  return l2normalize(Float32Array.from(data.subarray(0, EMBED_DIM)));
}

/** The tokenizer on its own, for chunking by real token counts. */
export async function tokenCounter(modelDir?: string): Promise<(text: string) => number> {
  const { tokenizer } = await load(modelDir);
  return (text) => tokenizer.count(text);
}
