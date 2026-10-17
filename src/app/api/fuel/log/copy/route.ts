import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { FuelLog } from "@/models/FuelLog";
import { fuelGuard } from "@/lib/fuel/server";
import { MEALS } from "@/lib/fuel/types";
import { addDaysIso, isValidIso, todayIso } from "@/lib/date-utils";

export const runtime = "nodejs";

const BodySchema = z.object({
  fromDate: z.string().refine(isValidIso, "fromDate must be yyyy-mm-dd"),
  toDate: z.string().refine(isValidIso, "toDate must be yyyy-mm-dd"),
  meal: z.enum(MEALS),
});

/** A whole day of breakfast is a lot; a hundred rows is a mistake. */
const MAX_ROWS = 40;

/**
 * POST /api/fuel/log/copy — "same as yesterday" for one meal.
 *
 * Most people eat the same breakfast most days, and re-logging it item by item
 * is the chore that makes trackers get abandoned. This copies one meal's rows
 * onto another day, **numbers included**: the snapshot rule (§4) says a row
 * keeps the macros it was logged with, and a copy of a row is that row again.
 *
 * Idempotent: each copy's clientId is derived from its source row and target
 * day, so a double tap — or copying twice — adds nothing the second time.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { fromDate, toDate, meal } = parsed.data;
  if (toDate > addDaysIso(todayIso(), 1)) {
    return NextResponse.json({ error: "You can only log today or a past day." }, { status: 400 });
  }
  if (fromDate === toDate) {
    return NextResponse.json({ error: "Pick a different day to copy from." }, { status: 400 });
  }

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);
    const rows = await FuelLog.find({ userId: uid, localDate: fromDate, meal })
      .sort({ loggedAt: 1 })
      .limit(MAX_ROWS)
      .lean();
    if (rows.length === 0) {
      return NextResponse.json({ error: "Nothing was logged for that meal." }, { status: 404 });
    }

    const now = new Date();
    const ops = rows.map((r) => {
      const clientId = `copy-${String(r._id)}-${toDate}`;
      return {
        updateOne: {
          filter: { userId: uid, clientId },
          update: {
            $setOnInsert: {
              userId: uid,
              localDate: toDate,
              loggedAt: now,
              meal,
              foodId: r.foodId ?? null,
              recipeId: r.recipeId ?? null,
              portionId: r.portionId ?? null,
              foodName: r.foodName,
              portionLabel: r.portionLabel ?? null,
              quantity: r.quantity,
              unit: r.unit ?? "g",
              gramsResolved: r.gramsResolved,
              kcal: r.kcal,
              proteinG: r.proteinG,
              carbsG: r.carbsG,
              fatG: r.fatG,
              fiberG: r.fiberG ?? 0,
              // A repeat is a deliberate, known meal — not a fresh photo guess.
              entryMethod: r.entryMethod === "photo" || r.entryMethod === "text" ? "favorite" : r.entryMethod,
              confidence: null,
              wasEdited: false,
              clientId,
              // createdAt/updatedAt come from the schema's timestamps; setting
              // them here too would conflict with the $set Mongoose adds.
            },
          },
          upsert: true,
        },
      };
    });
    const res = await FuelLog.bulkWrite(ops, { ordered: false });
    return NextResponse.json({ copied: res.upsertedCount, alreadyThere: rows.length - res.upsertedCount });
  } catch (err) {
    console.error("[fuel/log/copy] failed:", err);
    return NextResponse.json({ error: "Could not copy. Check the database connection." }, { status: 503 });
  }
}
