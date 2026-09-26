import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/db — is the database reachable from *this* deployment?
 *
 * Exists because every data route funnels its failures into one generic
 * "database unavailable", which is true but useless: a wrong password, an
 * un-allowlisted egress IP, an unset variable and a connection string the
 * driver refuses to parse all look identical from the browser, and the
 * runtime logs that would tell them apart need a console login to read.
 *
 * It never echoes the connection string, only its shape — enough to spot a
 * placeholder or a stray option without publishing a credential.
 */

/** Turn a driver error into the one thing worth knowing: whose fault is it. */
function classify(err: unknown): { reason: string; hint: string } {
  const msg = err instanceof Error ? err.message : String(err);

  if (/does not support directConnection/i.test(msg))
    return {
      reason: "direct-connection-with-srv",
      hint:
        "MONGODB_URI carries directConnection, which mongodb+srv cannot use — an SRV record " +
        "resolves to several hosts. The driver rejects this before connecting. Delete that option.",
    };
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
  if (/cannot have port number|multiple service names|srvMaxHosts|loadBalanced/i.test(msg))
    return { reason: "uri-options-invalid", hint: "MONGODB_URI combines options the driver rejects." };
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

  const afterHost = uri.split("@").pop() ?? "";
  const beforeQuery = afterHost.split("?")[0] ?? "";
  const hostPart = beforeQuery.split("/")[0] ?? "";
  const database = beforeQuery.split("/")[1] ?? "";

  // Option *names* are not secret, and one stray option is the likeliest
  // fault in a string that otherwise looks entirely correct — so list them.
  const options = [...new URLSearchParams(afterHost.split("?")[1] ?? "").keys()];

  return {
    set: true,
    scheme,
    // A pasted template still carrying <db_password> fails in a way that
    // reads exactly like a wrong password, so name it explicitly.
    hasPlaceholder: /<[^>]+>/.test(uri),
    hasCredentials: uri.includes("@"),
    databaseInUri: database || null,
    options,
    hostCount: hostPart ? hostPart.split(",").length : 0,
    hasPort: /:[0-9]+$/.test(hostPart),
    wrappedInQuotes: /^["']|["']$/.test(uri),
    hasWhitespace: uri !== uri.trim(),
  };
}

/** Strip credentials — the driver sometimes echoes the URI back in its message. */
function redact(message: string): string {
  return message.replace(new RegExp("//[^@\s]+@", "g"), "//<credentials>@").slice(0, 300);
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
        message: err instanceof Error ? redact(err.message) : "",
        ms: Date.now() - started,
        uri: shape(),
      },
      { status: 503 },
    );
  }
}
