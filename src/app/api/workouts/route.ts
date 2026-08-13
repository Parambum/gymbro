import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Workout } from "@/models/Workout";
import { OneRepMax } from "@/models/OneRepMax";
import { currentUserId } from "@/lib/auth-helpers";
import { LogSetSchema } from "@/lib/validation";
import { epleyE1RM, roundE1RM } from "@/lib/math/e1rm";
import { isValidIso, todayIso } from "@/lib/date-utils";
import { mainLift } from "@/lib/data/main-lifts";

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
  const { date, exercise, muscleGroup, mode, weight, reps, durationSec, setType, supersetGroup } =
    parsed.data;
  // e1RM is only meaningful for external load; bodyweight/timed sets carry 0.
  const e1rm = mode === "weight-reps" ? roundE1RM(epleyE1RM(weight, reps)) : 0;

  try {
    await connectDB();
    const uid = new Types.ObjectId(userId);

    // standing bests for this exercise (working sets) → mode-appropriate PR
    const [prior] = await Workout.aggregate<{ e1rm: number; reps: number; dur: number }>([
      { $match: { userId: uid } },
      { $unwind: "$sets" },
      { $match: { "sets.exercise": exercise, "sets.setType": { $ne: "WARMUP" } } },
      {
        $group: {
          _id: null,
          e1rm: { $max: "$sets.e1rm" },
          reps: { $max: "$sets.reps" },
          dur: { $max: "$sets.durationSec" },
        },
      },
    ]);
    let isPR = false;
    if (setType !== "WARMUP") {
      if (mode === "time") isPR = !prior || (durationSec ?? 0) > (prior.dur ?? 0);
      else if (mode === "reps") isPR = !prior || reps > (prior.reps ?? 0);
      else isPR = !prior || e1rm > (prior.e1rm ?? 0);
    }

    const setDoc = {
      exercise,
      muscleGroup,
      mode,
      weight,
      reps,
      durationSec: durationSec ?? null,
      setType,
      supersetGroup: supersetGroup || null,
      e1rm,
      createdAt: new Date(),
    };
    const workout = await Workout.findOneAndUpdate(
      { userId: uid, date },
      { $push: { sets: setDoc }, $setOnInsert: { userId: uid, date } },
      { upsert: true, new: true },
    );

    const saved = workout.sets[workout.sets.length - 1];
    const setNumber = workout.sets.filter((s) => s.exercise === exercise).length;

    // Recorded 1RM: a true single (1 rep) on a weighted main lift IS the 1RM.
    let recordedOneRepMax = false;
    const lift = mainLift(exercise);
    if (lift && mode === "weight-reps" && reps === 1 && setType !== "WARMUP") {
      const existing = await OneRepMax.findOne({ userId: uid, exercise });
      if (!existing || weight > existing.oneRepMax) {
        await OneRepMax.findOneAndUpdate(
          { userId: uid, exercise },
          { muscleGroup: lift.muscleGroup, oneRepMax: weight, source: "logged", recordedAt: new Date() },
          { upsert: true },
        );
        recordedOneRepMax = true;
      }
    }

    return NextResponse.json(
      {
        set: { id: String(saved._id), exercise, muscleGroup, mode, weight, reps, durationSec: durationSec ?? null, setType, e1rm, setNumber },
        isPR,
        recordedOneRepMax,
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
      mode: s.mode ?? "weight-reps",
      weight: s.weight,
      reps: s.reps,
      durationSec: s.durationSec ?? null,
      setType: s.setType,
      supersetGroup: s.supersetGroup ?? null,
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
