import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { fuelGuard } from "@/lib/fuel/server";
import { anthropicClient, describeAiError, draftFromText } from "@/lib/fuel/ai/client";
import { matchDraftItems } from "@/lib/fuel/ai/match";
import { TEXT_SYSTEM_PROMPT } from "@/lib/fuel/ai/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  text: z.string().trim().min(2, "Say what you ate").max(1000),
});

/**
 * POST /api/fuel/parse — "2 roti 1 katori dal aur ek glass doodh" becomes an
 * editable draft (§7.2).
 *
 * Same JSON contract and the same confirm-then-commit rule as the photo path;
 * only the input differs. Hinglish and mixed script are explicitly in scope,
 * which is most of why this exists — typing a sentence is faster than four
 * searches, and it is the way people actually describe a thali.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const client = anthropicClient();
  if (!client) {
    return NextResponse.json(
      {
        error:
          "Describing a meal needs an Anthropic API key (ANTHROPIC_API_KEY). Search, scan and quick-add all still work.",
      },
      { status: 503 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Say what you ate" },
      { status: 400 },
    );
  }

  try {
    const draft = await draftFromText(client, TEXT_SYSTEM_PROMPT, parsed.data.text);

    await connectDB();
    const items = await matchDraftItems(draft, guard.userId);

    return NextResponse.json({
      source: "text",
      items,
      plateNotes: draft.plate_notes,
      unclear: draft.unclear,
    });
  } catch (err) {
    console.error("[fuel/parse] failed:", err);
    const { status, message } = describeAiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
