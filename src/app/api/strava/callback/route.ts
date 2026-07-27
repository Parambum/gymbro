import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { StravaAccount } from "@/models/StravaAccount";
import { currentUserId } from "@/lib/auth-helpers";
import { exchangeCode, isStravaConfigured } from "@/lib/strava";

export const runtime = "nodejs";

const STATE_COOKIE = "strava_oauth_state";

/** Land the user back on /cardio with a status the page can surface. */
function back(req: Request, status: string) {
  const res = NextResponse.redirect(new URL(`/cardio?strava=${status}`, req.url));
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** GET /api/strava/callback — exchange the code and persist the grant. */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", req.url));
  if (!isStravaConfigured()) return back(req, "unconfigured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // the athlete pressed "Cancel" on Strava's consent screen
  if (error) return back(req, "denied");

  const expectedState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return back(req, "badstate");
  }

  // Strava only grants what the athlete ticked; without read access a sync
  // would silently return nothing, so fail loudly here instead.
  const grantedScope = url.searchParams.get("scope") ?? "";
  if (!grantedScope.includes("activity:read")) return back(req, "noscope");

  try {
    const tokens = await exchangeCode(code);
    await connectDB();
    await StravaAccount.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        userId: new Types.ObjectId(userId),
        stravaAthleteId: tokens.athleteId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        athleteName: tokens.athleteName,
      },
      { upsert: true },
    );
    return back(req, "connected");
  } catch {
    return back(req, "failed");
  }
}
