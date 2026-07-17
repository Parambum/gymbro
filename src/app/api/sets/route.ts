import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOperator } from "@/lib/api-helpers";
import { epleyE1RM, roundE1RM } from "@/lib/math/e1rm";

export const dynamic = "force-dynamic";

const SetBody = z.object({
  exerciseSlug: z.string().min(1),
  weightKg: z.number().min(0).max(2000),
  reps: z.number().int().min(1).max(200),
  tag: z.enum(["WARMUP", "WORKING", "DROP", "FAILURE"]).default("WORKING"),
});

/**
 * Rapid set capture. Computes e1RM server-side (denormalized onto the row),
 * appends to today's workout container, and upserts the PR when a working
 * set beats the standing record. Degrades gracefully to `persisted: false`
 * when the database is unreachable — the client keeps the set locally.
 */
export async function POST(req: Request) {
  const parsed = SetBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { exerciseSlug, weightKg, reps, tag } = parsed.data;
  const e1rm = roundE1RM(epleyE1RM(weightKg, reps));

  try {
    const user = await getOperator();
    const exercise = await prisma.exercise.findUnique({ where: { slug: exerciseSlug } });
    if (!exercise) {
      return NextResponse.json({ error: `unknown exercise: ${exerciseSlug}` }, { status: 404 });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const workout = await prisma.workout.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {},
      create: { userId: user.id, date: today },
    });

    const setNumber =
      (await prisma.workoutSet.count({
        where: { workoutId: workout.id, exerciseId: exercise.id },
      })) + 1;

    const set = await prisma.workoutSet.create({
      data: {
        workoutId: workout.id,
        exerciseId: exercise.id,
        setNumber,
        weightKg,
        reps,
        tag,
        e1rm,
      },
    });

    let isPR = false;
    if (tag !== "WARMUP") {
      const existing = await prisma.personalRecord.findUnique({
        where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
      });
      if (!existing || e1rm > Number(existing.e1rm)) {
        isPR = true;
        await prisma.personalRecord.upsert({
          where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
          update: { e1rm, weightKg, reps, achievedAt: new Date() },
          create: { userId: user.id, exerciseId: exercise.id, e1rm, weightKg, reps },
        });
      }
    }

    return NextResponse.json({ persisted: true, isPR, e1rm, setId: set.id, setNumber });
  } catch {
    // DB down / not provisioned — the client's optimistic copy stands
    return NextResponse.json({ persisted: false, isPR: false, e1rm });
  }
}
