import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Workout } from "@/models/Workout";
import { currentUserId } from "@/lib/auth-helpers";
import { LogSetSchema } from "@/lib/validation";
import { epleyE1RM, roundE1RM } from "@/lib/math/e1rm";
import { isValidIso, todayIso } from "@/lib/date-utils";

export const runtime = "nodejs";

/** POST /api/workouts — append one set to the given day, with PR detection. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = LogSetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { date, exercise, muscleGroup, weight, reps, setType } = parsed.data;
  const e1rm = roundE1RM(epleyE1RM(weight, reps));

  try {
    await connectDB();
    const uid = new Types.ObjectId(userId);

    // standing best e1RM for this exercise (working sets only) → PR check
    const [prior] = await Workout.aggregate<{ best: number }>([
      { $match: { userId: uid } },
      { $unwind: "$sets" },
      { $match: { "sets.exercise": exercise, "sets.setType": { $ne: "WARMUP" } } },
      { $group: { _id: null, best: { $max: "$sets.e1rm" } } },
    ]);
    const isPR = setType !== "WARMUP" && (!prior || e1rm > prior.best);

    const setDoc = { exercise, muscleGroup, weight, reps, setType, e1rm, createdAt: new Date() };
    const workout = await Workout.findOneAndUpdate(
      { userId: uid, date },
      { $push: { sets: setDoc }, $setOnInsert: { userId: uid, date } },
      { upsert: true, new: true },
    );

    const saved = workout.sets[workout.sets.length - 1];
    const setNumber = workout.sets.filter((s) => s.exercise === exercise).length;

    return NextResponse.json(
      {
        set: { id: String(saved._id), exercise, muscleGroup, weight, reps, setType, e1rm, setNumber },
        isPR,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Could not save. Check the database connection." }, { status: 503 });
  }
}

/** GET /api/workouts?date=yyyy-mm-dd — the sets logged on a given day. */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date") ?? todayIso();
  if (!isValidIso(date)) {
    return NextResponse.json({ error: "date must be yyyy-mm-dd" }, { status: 400 });
  }

  try {
    await connectDB();
    const workout = await Workout.findOne({ userId: new Types.ObjectId(userId), date }).lean();
    const sets = (workout?.sets ?? []).map((s) => ({
      id: String(s._id),
      exercise: s.exercise,
      muscleGroup: s.muscleGroup,
      weight: s.weight,
      reps: s.reps,
      setType: s.setType,
      e1rm: s.e1rm,
    }));
    return NextResponse.json({ date, sets });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/** DELETE /api/workouts — remove one set; prune the day if it becomes empty. */
export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const setId = url.searchParams.get("setId") ?? "";
  if (!isValidIso(date) || !Types.ObjectId.isValid(setId)) {
    return NextResponse.json({ error: "Valid date and setId are required" }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(userId);
    const res = await Workout.updateOne(
      { userId: uid, date },
      { $pull: { sets: { _id: new Types.ObjectId(setId) } } },
    );
    if (res.modifiedCount === 0) {
      return NextResponse.json({ error: "Set not found" }, { status: 404 });
    }
    // keep the calendar honest: drop the day's doc once it holds no sets
    await Workout.deleteOne({ userId: uid, date, sets: { $size: 0 } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
