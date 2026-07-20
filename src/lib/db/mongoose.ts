import mongoose from "mongoose";

/**
 * Cached Mongoose connection. Next.js dev hot-reload and serverless
 * invocations both re-import this module repeatedly; without the global
 * cache each would open a new pool and exhaust Atlas connection limits.
 */
const MONGODB_URI = process.env.MONGODB_URI;

interface Cached {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: Cached | undefined;
}

const cached: Cached = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env and paste your MongoDB Atlas connection string.",
    );
  }
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // allow the next request to retry a cold cluster
    throw err;
  }
  return cached.conn;
}
