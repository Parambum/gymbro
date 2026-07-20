import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Workout } from "@/models/Workout";
import { currentUserId } from "@/lib/auth-helpers";
import { groupBySlug } from "@/lib/data/exercise-catalog";

export const runtime = "nodejs";

export interface MuscleSeriesPoint {
  date: string;
  e1rm: number;
  weight: number;
  reps: number;
  exercise: string;
}

/**
 * GET /api/analytics/muscle?muscle=chest
 * Daily-best e1RM series (working sets) for a muscle, plus a per-exercise
 * best-e1RM breakdown. Empty arrays when nothing is logged — the UI turns
 * that into a "log your first workout" empty state rather than faking data.
 */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const muscle = new URL(req.url).searchParams.get("muscle") ?? "";
  const group = groupBySlug(muscle);
  if (!group) return NextResponse.json({ error: "Unknown muscle group" }, { status: 400 });

  try {
    await connectDB();
    const uid = new Types.ObjectId(userId);

    const series = await Workout.aggregate<{
      _id: string;
      e1rm: number;
      weight: number;
      reps: number;
      exercise: string;
    }>([
      { $match: { userId: uid } },
      { $unwind: "$sets" },
      { $match: { "sets.muscleGroup": muscle, "sets.setType": { $ne: "WARMUP" } } },
      { $sort: { "sets.e1rm": -1 } },
      {
        $group: {
          _id: "$date",
          e1rm: { $first: "$sets.e1rm" },
          weight: { $first: "$sets.weight" },
          reps: { $first: "$sets.reps" },
          exercise: { $first: "$sets.exercise" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const exercises = await Workout.aggregate<{ _id: string; best: number; sets: number }>([
      { $match: { userId: uid } },
      { $unwind: "$sets" },
      { $match: { "sets.muscleGroup": muscle, "sets.setType": { $ne: "WARMUP" } } },
      { $group: { _id: "$sets.exercise", best: { $max: "$sets.e1rm" }, sets: { $sum: 1 } } },
      { $sort: { best: -1 } },
    ]);

    return NextResponse.json({
      muscle,
      name: group.name,
      series: series.map((s) => ({
        date: s._id,
        e1rm: s.e1rm,
        weight: s.weight,
        reps: s.reps,
        exercise: s.exercise,
      })),
      exercises: exercises.map((e) => ({ exercise: e._id, best: e.best, sets: e.sets })),
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
