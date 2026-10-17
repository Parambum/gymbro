import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { FuelLog } from "@/models/FuelLog";
import { FuelWeight } from "@/models/FuelWeight";
import { fuelGuard } from "@/lib/fuel/server";
import { toCsv } from "@/lib/fuel/csv";

export const runtime = "nodejs";

/** Generous, but bounded: about ten years of a heavy logger. */
const MAX_ROWS = 50_000;

/**
 * GET /api/fuel/export?what=food|weight — your own data, as a spreadsheet.
 *
 * Everything Fuel stores about what someone ate is theirs to take elsewhere.
 * The food log is exported with the macros as they were frozen at logging
 * time (§4), plus how each row got there — so an export from a photo-logged
 * day says so.
 */
export async function GET(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const what = new URL(req.url).searchParams.get("what") === "weight" ? "weight" : "food";

  try {
    await connectDB();
    const uid = new Types.ObjectId(guard.userId);

    let csv: string;
    if (what === "weight") {
      const rows = await FuelWeight.find({ userId: uid }).sort({ localDate: 1 }).limit(MAX_ROWS).lean();
      csv = toCsv(
        ["date", "weight_kg", "note"],
        rows.map((r) => [r.localDate, r.weightKg, r.note ?? ""]),
      );
    } else {
      const rows = await FuelLog.find({ userId: uid }).sort({ localDate: 1, loggedAt: 1 }).limit(MAX_ROWS).lean();
      csv = toCsv(
        ["date", "meal", "food", "portion", "quantity", "grams", "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "method", "logged_at_utc"],
        rows.map((r) => [
          r.localDate,
          r.meal,
          r.foodName,
          r.portionLabel ?? "",
          r.quantity,
          r.gramsResolved,
          r.kcal,
          r.proteinG,
          r.carbsG,
          r.fatG,
          r.fiberG ?? 0,
          r.entryMethod,
          r.loggedAt ? new Date(r.loggedAt).toISOString() : "",
        ]),
      );
    }

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="gymbro-${what}-log.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[fuel/export] failed:", err);
    return NextResponse.json({ error: "Export is unavailable right now." }, { status: 503 });
  }
}
