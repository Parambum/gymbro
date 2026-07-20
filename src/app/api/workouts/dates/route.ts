import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Workout } from "@/models/Workout";
import { currentUserId } from "@/lib/auth-helpers";

export const runtime = "nodejs";

/** GET /api/workouts/dates — every day that has logged sets (calendar dots). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const dates: string[] = await Workout.find({
      userId: new Types.ObjectId(userId),
      "sets.0": { $exists: true },
    }).distinct("date");
    return NextResponse.json({ dates: dates.sort() });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
