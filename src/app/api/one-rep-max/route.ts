import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { OneRepMax } from "@/models/OneRepMax";
import { currentUserId } from "@/lib/auth-helpers";
import { OneRepMaxSchema } from "@/lib/validation";
import { MAIN_LIFTS, mainLift } from "@/lib/data/main-lifts";

export const runtime = "nodejs";

export interface OneRepMaxView {
  exercise: string;
  short: string;
  muscleGroup: string;
  oneRepMax: number | null;
  source: "logged" | "manual" | null;
  recordedAt: string | null;
}

/** GET /api/one-rep-max — every main lift with its recorded 1RM (or null). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const records = await OneRepMax.find({ userId: new Types.ObjectId(userId) }).lean();
    const byExercise = new Map(records.map((r) => [r.exercise, r]));

    const lifts: OneRepMaxView[] = MAIN_LIFTS.map((l) => {
      const r = byExercise.get(l.exercise);
      return {
        exercise: l.exercise,
        short: l.short,
        muscleGroup: l.muscleGroup,
        oneRepMax: r ? r.oneRepMax : null,
        source: r ? (r.source as "logged" | "manual") : null,
        recordedAt: r ? new Date(r.recordedAt).toISOString().slice(0, 10) : null,
      };
    });
    return NextResponse.json({ lifts });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/** POST /api/one-rep-max — manually record/update a main lift's true 1RM. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = OneRepMaxSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const lift = mainLift(parsed.data.exercise);
  if (!lift) {
    return NextResponse.json({ error: "Not a tracked main lift." }, { status: 400 });
  }

  try {
    await connectDB();
    await OneRepMax.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), exercise: lift.exercise },
      {
        muscleGroup: lift.muscleGroup,
        oneRepMax: parsed.data.oneRepMax,
        source: "manual",
        recordedAt: new Date(),
      },
      { upsert: true, new: true },
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
