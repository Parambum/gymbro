import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { StravaAccount } from "@/models/StravaAccount";
import { currentUserId } from "@/lib/auth-helpers";
import { isStravaConfigured } from "@/lib/strava";

export const runtime = "nodejs";

/** GET /api/strava/status — drives whether the UI offers Strava at all. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configured = isStravaConfigured();
  if (!configured) return NextResponse.json({ configured: false, connected: false });

  try {
    await connectDB();
    const account = await StravaAccount.findOne({ userId: new Types.ObjectId(userId) })
      .select("athleteName lastSyncedAt")
      .lean();

    return NextResponse.json({
      configured: true,
      connected: Boolean(account),
      athleteName: account?.athleteName ?? null,
      lastSyncedAt: account?.lastSyncedAt ?? null,
    });
  } catch {
    // the integration's availability shouldn't depend on a healthy DB read
    return NextResponse.json({ configured: true, connected: false });
  }
}

/** DELETE /api/strava/status — disconnect; imported activities are kept. */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    await StravaAccount.deleteOne({ userId: new Types.ObjectId(userId) });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
