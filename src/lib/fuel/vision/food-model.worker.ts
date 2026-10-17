/// <reference lib="webworker" />
/**
 * The food model, running off the main thread.
 *
 * A single-threaded WebAssembly forward pass of a ViT-S takes a few hundred
 * milliseconds on a mid-range phone. On the main thread that is a frozen
 * screen with a camera preview stuck mid-frame; here it is just a wait.
 *
 * The model file is cached in Cache Storage after the first download, under a
 * versioned URL, so it is fetched once per model release and then works with
 * no connection at all. The photo itself never leaves this worker.
 */
import * as ort from "onnxruntime-web/wasm";

type Inbound =
  | { type: "load"; url: string; cacheName: string }
  | { type: "run"; id: number; pixels: Float32Array; size: number };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let session: ort.InferenceSession | null = null;

function post(msg: unknown, transfer: Transferable[] = []) {
  scope.postMessage(msg, transfer);
}

async function fetchModel(url: string, cacheName: string): Promise<ArrayBuffer> {
  const cache = "caches" in scope ? await caches.open(cacheName).catch(() => null) : null;
  const hit = await cache?.match(url);
  if (hit) {
    post({ type: "progress", loaded: 1, total: 1, cached: true });
    return hit.arrayBuffer();
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    post({ type: "progress", loaded, total, cached: false });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  // Best effort: a full or disabled cache only means downloading again next time.
  await cache
    ?.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }))
    .catch(() => undefined);
  // Drop superseded versions of the model, so a phone keeps one copy, not one per release.
  for (const old of (await cache?.keys().catch(() => [])) ?? []) {
    if (old.url !== url) await cache?.delete(old).catch(() => undefined);
  }
  return bytes.buffer;
}

async function load(url: string, cacheName: string) {
  // Threads need cross-origin isolation, which this app does not serve (it
  // would break OAuth popups and third-party images). One thread, with SIMD.
  ort.env.wasm.numThreads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const model = await fetchModel(url, cacheName);
  session = await ort.InferenceSession.create(model, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  post({ type: "ready" });
}

async function run(id: number, pixels: Float32Array, size: number) {
  if (!session) throw new Error("model not loaded");
  const started = performance.now();
  const input = new ort.Tensor("float32", pixels, [1, 3, size, size]);
  const out = await session.run({ [session.inputNames[0]]: input });
  const probs = out[session.outputNames[0]].data as Float32Array;
  const copy = new Float32Array(probs);
  post({ type: "result", id, probs: copy, ms: Math.round(performance.now() - started) }, [copy.buffer]);
}

scope.onmessage = (e: MessageEvent<Inbound>) => {
  const msg = e.data;
  if (msg.type === "load") {
    load(msg.url, msg.cacheName).catch((err) => post({ type: "error", message: String(err?.message ?? err) }));
  } else if (msg.type === "run") {
    run(msg.id, msg.pixels, msg.size).catch((err) =>
      post({ type: "error", id: msg.id, message: String(err?.message ?? err) }),
    );
  }
};
