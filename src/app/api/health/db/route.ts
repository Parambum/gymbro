import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/db — is the database reachable from *this* deployment?
 *
 * Exists because every data route funnels its failures into one generic
 * "database unavailable", which is true but useless: a wrong password, an
 * un-allowlisted egress IP and an unset variable all look identical from the
 * browser, and Vercel's runtime logs need a console login to read.
 *
 * It deliberately never echoes the connection string, only the shape of it —
 * enough to tell a placeholder from a real credential without publishing one.
 */

/** Turn a driver error into the one thing worth knowing: whose fault is it. */
function classify(err: unknown): { reason: string; hint: string } {
  const msg = err instanceof Error ? err.message : String(err);

  if (/is not set/i.test(msg))
    return { reason: "uri-missing", hint: "MONGODB_URI is not set on this deployment." };
  if (/whitelist|not allowed to connect|IP that isn't/i.test(msg))
    return {
      reason: "ip-not-allowlisted",
      hint: "Atlas is refusing this deployment's IP. Network Access needs 0.0.0.0/0 with no expiry.",
    };
  if (/bad auth|authentication failed|AuthenticationFailed/i.test(msg))
    return {
      reason: "auth-failed",
      hint: "The cluster is reachable but rejected the username or password in MONGODB_URI.",
    };
  if (/Invalid scheme|Invalid connection string|URI malformed|querySrv|ENOTFOUND|EAI_AGAIN/i.test(msg))
    return { reason: "uri-malformed", hint: "MONGODB_URI is not a resolvable connection string." };
  if (/timed out|ETIMEDOUT|ECONNREFUSED|ServerSelection/i.test(msg))
    return {
      reason: "unreachable",
      hint: "No cluster node answered before the timeout — usually the IP allowlist.",
    };
  return { reason: "unknown", hint: "Unrecognised driver error." };
}

/** Describe MONGODB_URI without disclosing it. */
function shape() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { set: false };
  const scheme = uri.startsWith("mongodb+srv://")
    ? "mongodb+srv"
    : uri.startsWith("mongodb://")
      ? "mongodb"
      : "other";
  // A pasted template that still carries <db_password> fails auth in a way
  // that reads exactly like a wrong password, so name it explicitly.
  const hasPlaceholder = /<[^>]+>/.test(uri);
  const afterHost = uri.split("@")[1] ?? "";
  const path = afterHost.split("?")[0]?.split("/")[1] ?? "";
  return {
    set: true,
    scheme,
    hasPlaceholder,
    hasCredentials: uri.includes("@"),
    databaseInUri: path || null,
    wrappedInQuotes: /^["']|["']$/.test(uri),
    hasWhitespace: uri !== uri.trim(),
  };
}

export async function GET() {
  const started = Date.now();
  try {
    const conn = await connectDB();
    const db = conn.connection.db;
    if (!db) throw new Error("connected without a database handle");
    await db.admin().ping();
    return NextResponse.json({
      ok: true,
      database: conn.connection.name,
      foods: await db.collection("fuelfoods").estimatedDocumentCount(),
      ms: Date.now() - started,
      uri: shape(),
    });
  } catch (err) {
    const { reason, hint } = classify(err);
    return NextResponse.json(
      {
        ok: false,
        reason,
        hint,
        error: err instanceof Error ? err.name : "Error",
        ms: Date.now() - started,
        uri: shape(),
      },
      { status: 503 },
    );
  }
}
