import type { ActivityType } from "@/lib/activity-types";

/**
 * Strava API v3 client.
 *
 * Entirely optional: with no STRAVA_CLIENT_ID/SECRET the app hides every
 * Strava affordance and cardio still works end-to-end (manual, GPX, live
 * GPS) — the same "leave blank to disable" contract the Google provider uses.
 *
 * Docs: https://developers.strava.com/docs/authentication/
 */

const AUTH_BASE = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";

/** Read-only access to the athlete's activities, including private ones. */
const SCOPE = "activity:read_all";

export function isStravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new StravaError("Strava is not configured on this deployment.");
  }
  return { clientId, clientSecret };
}

export class StravaError extends Error {}

/** Absolute callback URL — must match the Authorization Callback Domain in Strava's app settings. */
export function stravaRedirectUri(origin: string): string {
  return `${origin}/api/strava/callback`;
}

export function stravaAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPE,
    state,
  });
  return `${AUTH_BASE}?${params}`;
}

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  athleteId: number;
  athleteName: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  scope?: string;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...body }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new StravaError(
      res.status === 400
        ? "Strava rejected the authorisation — the code may have expired. Try connecting again."
        : `Strava token request failed (${res.status}). ${detail.slice(0, 160)}`,
    );
  }
  return res.json();
}

export async function exchangeCode(code: string): Promise<StravaTokens> {
  const json = await postToken({ code, grant_type: "authorization_code" });
  return toTokens(json);
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaTokens> {
  const json = await postToken({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return toTokens(json);
}

function toTokens(json: TokenResponse): StravaTokens {
  const name = [json.athlete?.firstname, json.athlete?.lastname].filter(Boolean).join(" ");
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(json.expires_at * 1000),
    scope: json.scope ?? "",
    athleteId: json.athlete?.id ?? 0,
    athleteName: name,
  };
}

// ---------------------------------------------------------------------------
// activities
// ---------------------------------------------------------------------------

export interface StravaActivity {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  distance: number; // metres
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // metres
  start_date: string; // ISO 8601, UTC
  start_date_local: string; // ISO 8601, athlete's local clock
  average_heartrate?: number;
  map?: { summary_polyline?: string | null };
}

/** One page of the athlete's activities, newest first. */
export async function fetchActivities(
  accessToken: string,
  { page = 1, perPage = 30, after }: { page?: number; perPage?: number; after?: Date } = {},
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (after) params.set("after", String(Math.floor(after.getTime() / 1000)));

  const res = await fetch(`${API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 401) {
    throw new StravaError("Strava authorisation expired. Reconnect your account.");
  }
  if (res.status === 429) {
    throw new StravaError("Strava rate limit reached. Wait ~15 minutes and sync again.");
  }
  if (!res.ok) {
    throw new StravaError(`Strava returned ${res.status} while listing activities.`);
  }
  return res.json();
}

/**
 * Map Strava's sport taxonomy onto ours.
 *
 * Returns null for anything that isn't cardio with a distance — Strava's
 * WeightTraining/Yoga/Workout entries are deliberately skipped so imports
 * never pollute the cardio feed with things the strength side already owns.
 */
export function mapActivityType(sport: string | undefined): ActivityType | null {
  switch (sport) {
    case "Run":
    case "TrailRun":
    case "VirtualRun":
      return "RUN";
    case "Ride":
    case "VirtualRide":
    case "EBikeRide":
    case "MountainBikeRide":
    case "GravelRide":
    case "Handcycle":
      return "RIDE";
    case "Walk":
      return "WALK";
    case "Hike":
    case "Snowshoe":
      return "HIKE";
    case "Swim":
      return "SWIM";
    default:
      return null;
  }
}
