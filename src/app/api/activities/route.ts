import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Activity } from "@/models/Activity";
import { currentUserId } from "@/lib/auth-helpers";
import { CreateActivitySchema } from "@/lib/validation";
import {
  computeSplits,
  elevationGainM,
  paceSPerKm,
  routeDistanceM,
  simplifyRoute,
  type LatLng,
  type TrackPoint,
} from "@/lib/math/geo";

export const runtime = "nodejs";

/**
 * Lean shape for the feed query.
 *
 * Declared explicitly and handed to `.lean<T[]>()` because Mongoose infers
 * the `[[Number]]` route field as a nested Subdocument type that doesn't
 * reduce to `number[][]`.
 */
interface FeedDoc {
  _id: Types.ObjectId;
  type: string;
  name: string;
  date: string;
  startedAt: Date;
  distanceM: number;
  movingTimeS: number;
  elevationGainM: number;
  avgPaceSPerKm: number;
  source: string;
  route?: number[][];
  notes?: string;
}

/** Shape returned to the feed — never the full route, which is detail-only. */
function toFeedItem(a: FeedDoc) {
  return {
    id: String(a._id),
    type: a.type,
    name: a.name,
    date: a.date,
    startedAt: a.startedAt,
    distanceM: a.distanceM,
    movingTimeS: a.movingTimeS,
    elevationGainM: a.elevationGainM,
    avgPaceSPerKm: a.avgPaceSPerKm,
    source: a.source,
    hasRoute: (a.route?.length ?? 0) > 1,
    notes: a.notes ?? "",
  };
}

/** GET /api/activities?limit=&type= — the athlete's feed, newest first. */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const type = url.searchParams.get("type");

  try {
    await connectDB();
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (type && type !== "ALL") query.type = type;

    const docs = await Activity.find(query)
      .sort({ startedAt: -1 })
      .limit(limit)
      .select("-splits") // splits are only needed on the detail page
      .lean<FeedDoc[]>();

    return NextResponse.json({ activities: docs.map(toFeedItem) });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/**
 * POST /api/activities — log one effort.
 *
 * When a GPS `track` is supplied the server derives distance, elevation and
 * splits from it and overrides whatever the client claimed; a payload can
 * describe where you went, not how fast the maths says you went.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateActivitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const track: TrackPoint[] = input.track ?? [];
  const hasTrack = track.length > 1;

  let distanceM = input.distanceM;
  let elevGain = input.elevationGainM ?? 0;
  let route: LatLng[] = [];
  let splits: ReturnType<typeof computeSplits> = [];

  if (hasTrack) {
    const full: LatLng[] = track.map((p) => [p.lat, p.lng]);
    const measured = routeDistanceM(full);
    // a track with no movement (all points identical) shouldn't zero the entry
    if (measured > 0) distanceM = Math.round(measured);

    const elevations = track
      .map((p) => p.ele)
      .filter((e): e is number => typeof e === "number");
    if (elevations.length > 1) elevGain = elevationGainM(elevations);

    route = simplifyRoute(full);
    // splits need timestamps; a route-only GPX (no <time>) yields none
    if (track.some((p) => typeof p.t === "number")) splits = computeSplits(track);
  }

  const movingTimeS = input.movingTimeS;
  const elapsedTimeS = input.elapsedTimeS ?? movingTimeS;
  const startedAt = input.startedAt
    ? new Date(input.startedAt)
    : new Date(`${input.date}T12:00:00`);

  try {
    await connectDB();
    const doc = await Activity.create({
      userId: new Types.ObjectId(userId),
      type: input.type,
      name: input.name,
      date: input.date,
      startedAt,
      distanceM,
      movingTimeS,
      elapsedTimeS,
      elevationGainM: elevGain,
      avgPaceSPerKm: Math.round(paceSPerKm(distanceM, movingTimeS)),
      avgHeartRate: input.avgHeartRate ?? null,
      route,
      splits,
      source: input.source,
      notes: input.notes ?? "",
    });

    return NextResponse.json(
      { activity: { id: String(doc._id), name: doc.name, distanceM, movingTimeS } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not save. Check the database connection." },
      { status: 503 },
    );
  }
}

/** DELETE /api/activities?id= — remove one effort. */
export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "A valid activity id is required" }, { status: 400 });
  }

  try {
    await connectDB();
    const res = await Activity.deleteOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId), // scoping to the owner is the authorisation check
    });
    if (res.deletedCount === 0) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
