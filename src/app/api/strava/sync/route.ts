import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Activity } from "@/models/Activity";
import { StravaAccount } from "@/models/StravaAccount";
import { currentUserId } from "@/lib/auth-helpers";
import {
  fetchActivities,
  isStravaConfigured,
  mapActivityType,
  refreshAccessToken,
  StravaError,
} from "@/lib/strava";
import { decodePolyline, paceSPerKm, type LatLng } from "@/lib/math/geo";

export const runtime = "nodejs";
/** Strava paginates at 200; four pages is a sane ceiling for one request. */
const MAX_PAGES = 4;
const PER_PAGE = 100;

/**
 * POST /api/strava/sync — pull the athlete's activities into GymBro.
 *
 * Idempotent: every write is an upsert keyed on (userId, stravaId), so
 * re-syncing updates in place rather than duplicating. Incremental after the
 * first run — only activities newer than `lastSyncedAt` are requested.
 */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStravaConfigured()) {
    return NextResponse.json({ error: "Strava is not configured on this deployment." }, { status: 503 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(userId);
    const account = await StravaAccount.findOne({ userId: uid });
    if (!account) {
      return NextResponse.json({ error: "Connect your Strava account first." }, { status: 400 });
    }

    // refresh with a 60s cushion so a token can't expire mid-request
    let accessToken = account.accessToken;
    if (account.expiresAt.getTime() - Date.now() < 60_000) {
      const refreshed = await refreshAccessToken(account.refreshToken);
      accessToken = refreshed.accessToken;
      account.accessToken = refreshed.accessToken;
      account.refreshToken = refreshed.refreshToken;
      account.expiresAt = refreshed.expiresAt;
      await account.save();
    }

    // re-fetch a day back from the last sync — cheap insurance against an
    // activity uploaded late and stamped earlier than the sync watermark
    const after = account.lastSyncedAt
      ? new Date(account.lastSyncedAt.getTime() - 86_400_000)
      : undefined;

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await fetchActivities(accessToken, { page, perPage: PER_PAGE, after });
      if (batch.length === 0) break;

      for (const sa of batch) {
        const type = mapActivityType(sa.sport_type ?? sa.type);
        // non-cardio (WeightTraining, Yoga…) and zero-distance entries are
        // intentionally not imported — the strength side already owns those
        if (!type || !sa.distance || sa.distance <= 0) {
          skipped++;
          continue;
        }

        const polyline = sa.map?.summary_polyline;
        const route: LatLng[] = polyline ? decodePolyline(polyline) : [];
        const movingTimeS = Math.round(sa.moving_time || sa.elapsed_time || 0);
        if (movingTimeS <= 0) {
          skipped++;
          continue;
        }

        const res = await Activity.updateOne(
          { userId: uid, stravaId: sa.id },
          {
            $set: {
              type,
              name: sa.name?.slice(0, 120) || "Strava activity",
              // the athlete's local calendar day, matching how Workout stores dates
              date: (sa.start_date_local || sa.start_date).slice(0, 10),
              startedAt: new Date(sa.start_date),
              distanceM: Math.round(sa.distance),
              movingTimeS,
              elapsedTimeS: Math.round(sa.elapsed_time || movingTimeS),
              elevationGainM: Math.round(sa.total_elevation_gain || 0),
              avgPaceSPerKm: Math.round(paceSPerKm(sa.distance, movingTimeS)),
              avgHeartRate: sa.average_heartrate ? Math.round(sa.average_heartrate) : null,
              route,
              // Strava's summary polyline carries no timestamps, so per-km
              // splits can't be derived from it — left empty rather than faked
              splits: [],
              source: "STRAVA",
            },
            $setOnInsert: { userId: uid, stravaId: sa.id, notes: "" },
          },
          { upsert: true },
        );

        if (res.upsertedCount > 0) imported++;
        else if (res.modifiedCount > 0) updated++;
      }

      if (batch.length < PER_PAGE) break; // last page
    }

    account.lastSyncedAt = new Date();
    await account.save();

    return NextResponse.json({ imported, updated, skipped });
  } catch (err) {
    if (err instanceof StravaError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Sync failed. Try again in a moment." }, { status: 503 });
  }
}
