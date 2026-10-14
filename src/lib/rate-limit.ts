import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";

/**
 * Request rate limiting, backed by MongoDB.
 *
 * In-memory counters are worse than nothing on Vercel: every function instance
 * keeps its own, so an attacker spreading requests across a warm pool sees a
 * limit several times higher than the one configured, and the number in the
 * code stops meaning anything. Mongo is already a dependency on every one of
 * these paths, so a shared counter costs one round trip in the same region.
 *
 * Fails open. A rate limiter that takes the login page down with it when the
 * database hiccups has caused a worse outage than the attack it prevents.
 */

const COLLECTION = "ratelimits";
let indexReady: Promise<void> | null = null;

/** TTL index, built once per process. Mongo reaps expired windows itself. */
async function ensureIndex(db: mongoose.mongo.Db): Promise<void> {
  indexReady ??= db
    .collection(COLLECTION)
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    .then(() => undefined)
    .catch(() => {
      indexReady = null; // let the next call retry a transient failure
    });
  return indexReady;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. Only meaningful when ok is false. */
  retryAfter: number;
  remaining: number;
}

/**
 * Count one hit against `key` and report whether it is over the limit.
 *
 * The window is fixed rather than sliding: a burst at a boundary can briefly
 * see up to twice `max`. That is an acceptable trade for a single atomic
 * upsert, because the threat here is thousands of guesses per minute, not two
 * hundred instead of a hundred.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const conn = await connectDB();
    const db = conn.connection.db;
    if (!db) return { ok: true, retryAfter: 0, remaining: max };
    await ensureIndex(db);

    const now = Date.now();
    const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
    const expiresAt = new Date(windowStart + windowSeconds * 1000);

    const doc = await db.collection(COLLECTION).findOneAndUpdate(
      { _id: `${key}:${windowStart}` as unknown as mongoose.mongo.BSON.ObjectId },
      { $inc: { hits: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: "after" },
    );

    const hits = (doc as { hits?: number } | null)?.hits ?? 1;
    const remaining = Math.max(0, max - hits);
    return {
      ok: hits <= max,
      retryAfter: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
      remaining,
    };
  } catch {
    // Fail open — see the note at the top of this file.
    return { ok: true, retryAfter: 0, remaining: max };
  }
}

/**
 * The client's address, as far as it can be trusted.
 *
 * Only Vercel's own header is read. `x-forwarded-for` is attacker-controlled
 * when it arrives from anywhere else, and trusting it turns a rate limiter
 * into a no-op: send a different value each request and every one looks like a
 * new client.
 */
export function clientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

/** A 429 with the header clients actually honour. */
export function tooManyRequests(retryAfter: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfter),
    },
  });
}
