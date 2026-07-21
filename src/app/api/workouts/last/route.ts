import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Workout } from "@/models/Workout";
import { currentUserId } from "@/lib/auth-helpers";

export const runtime = "nodejs";

/**
 * GET /api/workouts/last?exercise=NAME — the most recent weight/reps logged
 * for an exercise, so the set form can pre-fill smart defaults instead of
 * making the user dial in the same numbers every session.
 */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const exercise = new URL(req.url).searchParams.get("exercise") ?? "";
  if (!exercise) return NextResponse.json({ last: null });

  try {
    await connectDB();
    const [hit] = await Workout.aggregate<{ weight: number; reps: number; setType: string }>([
      { $match: { userId: new Types.ObjectId(userId), "sets.exercise": exercise } },
      { $unwind: "$sets" },
      { $match: { "sets.exercise": exercise } },
      { $sort: { date: -1, "sets.createdAt": -1 } },
      { $limit: 1 },
      { $project: { _id: 0, weight: "$sets.weight", reps: "$sets.reps", setType: "$sets.setType" } },
    ]);
    return NextResponse.json({ last: hit ?? null });
  } catch {
    return NextResponse.json({ last: null });
  }
}
