"use client";

import { INPUT_SIZE } from "./preprocess";
import { topK, type Guess } from "./ranking";

/**
 * Main-thread handle on the food model.
 *
 * One worker per page, created on first use and kept for the life of the tab:
 * loading the model is the expensive part, and someone logging three meals in
 * a row should pay for it once.
 */

export const MODEL_DIR = "/models/food-v1";
const MODEL_URL = `${MODEL_DIR}/food.onnx`;
const META_URL = `${MODEL_DIR}/model.json`;
/** Versioned with the directory, so a new model never reads an old cache. */
const CACHE_NAME = "gymbro-model-food-v1";

export interface FoodModelMeta {
  version: string;
  classes: string[];
  inputSize: number;
  bytes: number;
  /** Calibrated probability above which the app leads with one answer. */
  confidentAt: number;
  metrics: {
    top1: number;
    top5: number;
    indianTop1: number;
    food101Top1: number;
    testImages: number;
    /** Of the photos it is confident about, how often it is right. */
    precisionWhenConfident: number;
  };
}

export interface Progress {
  loaded: number;
  total: number;
  cached: boolean;
}

let worker: Worker | null = null;
let ready: Promise<FoodModelMeta> | null = null;
let meta: FoodModelMeta | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: { probs: Float32Array; ms: number }) => void; reject: (e: Error) => void }>();
const progressListeners = new Set<(p: Progress) => void>();

/** Small JSON describing the model; fetched before deciding to download 20+ MB. */
export async function fetchModelMeta(): Promise<FoodModelMeta> {
  if (meta) return meta;
  const res = await fetch(META_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("The food model isn't available right now.");
  meta = (await res.json()) as FoodModelMeta;
  return meta;
}

/**
 * The model's URL, keyed by its version (a hash of the file, from model.json).
 * A rebuilt model gets a new key even in the same folder, so neither Cache
 * Storage nor the year-long immutable HTTP cache can serve stale weights.
 */
function modelUrl(m: FoodModelMeta): string {
  return new URL(`${MODEL_URL}?v=${encodeURIComponent(m.version)}`, location.origin).href;
}

/** Whether this exact model is already on this device — no download needed. */
export async function isModelCached(): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const [m, cache] = await Promise.all([fetchModelMeta(), caches.open(CACHE_NAME)]);
    return Boolean(await cache.match(modelUrl(m)));
  } catch {
    return false;
  }
}

export function loadFoodModel(onProgress?: (p: Progress) => void): Promise<FoodModelMeta> {
  if (onProgress) progressListeners.add(onProgress);
  if (ready) return ready;

  ready = (async () => {
    const m = await fetchModelMeta();
    worker = new Worker(new URL("./food-model.worker.ts", import.meta.url), { type: "module" });

    await new Promise<void>((resolve, reject) => {
      worker!.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === "progress") {
          for (const l of progressListeners) l({ loaded: msg.loaded, total: msg.total, cached: msg.cached });
        } else if (msg.type === "ready") {
          resolve();
        } else if (msg.type === "error" && msg.id == null) {
          reject(new Error(msg.message));
        } else if (msg.type === "result") {
          pending.get(msg.id)?.resolve({ probs: msg.probs, ms: msg.ms });
          pending.delete(msg.id);
        } else if (msg.type === "error") {
          pending.get(msg.id)?.reject(new Error(msg.message));
          pending.delete(msg.id);
        }
      };
      worker!.onerror = (e) => reject(new Error(e.message || "The food model failed to start."));
      // Absolute URL: the worker's own base is its script, not the page.
      worker!.postMessage({ type: "load", url: modelUrl(m), cacheName: CACHE_NAME });
    });
    progressListeners.clear();
    return m;
  })().catch((err) => {
    progressListeners.clear();
    // A failed load must not poison every later attempt.
    worker?.terminate();
    worker = null;
    ready = null;
    throw err;
  });

  return ready;
}

/** Classify one 224×224 planar image. Resolves to the top guesses, best first. */
export async function classify(pixels: Float32Array, k = 5): Promise<{ guesses: Guess[]; ms: number }> {
  const m = await loadFoodModel();
  const id = nextId++;
  const result = new Promise<{ probs: Float32Array; ms: number }>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  worker!.postMessage({ type: "run", id, pixels, size: m.inputSize ?? INPUT_SIZE }, [pixels.buffer]);
  const { probs, ms } = await result;
  return { guesses: topK(probs, m.classes, k), ms };
}
