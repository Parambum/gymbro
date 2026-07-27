import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { currentUserId } from "@/lib/auth-helpers";
import { isStravaConfigured, stravaAuthUrl, stravaRedirectUri } from "@/lib/strava";

export const runtime = "nodejs";

/** Opaque, single-use CSRF token round-tripped through Strava's `state`. */
const STATE_COOKIE = "strava_oauth_state";

/** GET /api/strava/connect — kick off the OAuth handshake. */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", req.url));

  if (!isStravaConfigured()) {
    return NextResponse.redirect(new URL("/cardio?strava=unconfigured", req.url));
  }

  const state = randomBytes(24).toString("hex");
  const origin = new URL(req.url).origin;
  const target = stravaAuthUrl(stravaRedirectUri(origin), state);

  const res = NextResponse.redirect(target);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from strava.com
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
