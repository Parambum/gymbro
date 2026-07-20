import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { Exercise } from "@/models/Exercise";
import { currentUserId } from "@/lib/auth-helpers";
import { groupBySlug } from "@/lib/data/exercise-catalog";
import { CustomExerciseSchema } from "@/lib/validation";

export const runtime = "nodejs";

export interface ExerciseOption {
  name: string;
  isCustom: boolean;
  id?: string;
}

/** GET /api/exercises?muscle=chest — base library merged with the user's own. */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const muscle = new URL(req.url).searchParams.get("muscle") ?? "";
  const group = groupBySlug(muscle);
  if (!group) return NextResponse.json({ error: "Unknown muscle group" }, { status: 400 });

  try {
    await connectDB();
    const custom = await Exercise.find({ userId, muscleGroup: muscle }).sort({ name: 1 }).lean();
    const options: ExerciseOption[] = [
      ...group.exercises.map((name) => ({ name, isCustom: false })),
      ...custom.map((e) => ({ name: e.name, isCustom: true, id: String(e._id) })),
    ];
    return NextResponse.json({ muscle, exercises: options });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

/** POST /api/exercises — create a custom exercise tied to the user. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CustomExerciseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { name, muscleGroup } = parsed.data;

  const group = groupBySlug(muscleGroup);
  if (group?.exercises.some((e) => e.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json(
      { error: "That exercise is already in the base library." },
      { status: 409 },
    );
  }

  try {
    await connectDB();
    const created = await Exercise.create({ userId, name, muscleGroup });
    return NextResponse.json(
      { exercise: { id: String(created._id), name: created.name, isCustom: true } },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && (err as { code: number }).code === 11000) {
      return NextResponse.json({ error: "You already added that exercise." }, { status: 409 });
    }
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
