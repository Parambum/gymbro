import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { fuelGuard } from "@/lib/fuel/server";
import { anthropicClient, describeAiError, draftFromImage } from "@/lib/fuel/ai/client";
import { matchDraftItems } from "@/lib/fuel/ai/match";
import { VISION_INDIAN_ADDENDUM, VISION_SYSTEM_PROMPT } from "@/lib/fuel/ai/prompts";

export const runtime = "nodejs";
/** Vercel Hobby caps a function at 60s; asking for more fails the deploy. */
export const maxDuration = 60;

/** ~6 MB of base64 ≈ a 4.5 MB image. The client downscales well below this. */
const MAX_BASE64_CHARS = 6_000_000;

const BodySchema = z.object({
  /** Bare base64, no data: URI prefix — the client strips it. */
  image: z.string().min(100).max(MAX_BASE64_CHARS),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/**
 * POST /api/fuel/vision — a photo becomes an editable draft.
 *
 * **Nothing is logged here.** This route returns a draft and only a draft; the
 * user edits it and commits through /api/fuel/log like any other entry. That
 * separation is §7.1's "never auto-commit", and it is why an inaccurate
 * estimate is a mild annoyance rather than a corrupted day.
 *
 * The photo itself is never persisted. It arrives in memory, goes to the
 * model, and is dropped when the request ends — which is the strongest form of
 * "store photos privately" available without a blob store, and makes "delete
 * the photo with the entry" trivially true.
 */
export async function POST(req: Request) {
  const guard = await fuelGuard();
  if (guard.error) return guard.error;

  const client = anthropicClient();
  if (!client) {
    return NextResponse.json(
      {
        error:
          "Photo logging needs an Anthropic API key (ANTHROPIC_API_KEY). Everything else still works — search, scan or type it in.",
      },
      { status: 503 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That image didn't come through. Try again, or log it manually." },
      { status: 400 },
    );
  }

  try {
    const draft = await draftFromImage(
      client,
      `${VISION_SYSTEM_PROMPT}\n${VISION_INDIAN_ADDENDUM}`,
      parsed.data.image,
      parsed.data.mediaType,
    );

    await connectDB();
    const items = await matchDraftItems(draft, guard.userId);

    return NextResponse.json({
      source: "photo",
      items,
      plateNotes: draft.plate_notes,
      unclear: draft.unclear,
    });
  } catch (err) {
    console.error("[fuel/vision] failed:", err);
    const { status, message } = describeAiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
