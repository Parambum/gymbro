import { z } from "zod";

/**
 * The JSON contract shared by Snap-a-meal and natural-language logging.
 *
 * Written against the verbatim prompt in `prompts.ts` — the two are one
 * artefact split across two files, and neither may be edited alone.
 *
 * Validation is deliberately strict about *shape* and forgiving about
 * *numbers*: a model that returns a negative calorie count has made a mistake
 * worth clamping, but a model that returns an extra field it wasn't asked for
 * has not broken anything. The user edits every value before it is stored, so
 * the schema's job is to guarantee the confirm sheet can render — not to be
 * the last line of defence on accuracy.
 */

export const AiItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  estimated_grams: z.number().min(0).max(5000),
  portion_description: z.string().trim().max(120).optional().default(""),
  calories: z.number().min(0).max(10_000),
  protein_g: z.number().min(0).max(500),
  carbs_g: z.number().min(0).max(1000),
  fat_g: z.number().min(0).max(500),
  confidence: z.number().min(0).max(1),
  /** [low, high] — the model's own uncertainty band, not a display rounding. */
  calorie_range: z.tuple([z.number().min(0), z.number().min(0)]).optional(),
  assumptions: z.string().trim().max(400).optional().default(""),
});

export const AiDraftSchema = z.object({
  items: z.array(AiItemSchema).min(1, "No food identified").max(25),
  plate_notes: z.string().trim().max(600).optional().default(""),
  unclear: z.array(z.string().trim().max(160)).max(20).optional().default([]),
});

export type AiItem = z.infer<typeof AiItemSchema>;
export type AiDraft = z.infer<typeof AiDraftSchema>;

/**
 * Pull JSON out of a model response.
 *
 * The prompt says "no markdown fences", and models mostly obey — but "mostly"
 * is not a contract, and a single stray fence should not cost the user their
 * photo. So: try the whole string, then the first fenced block, then the
 * outermost braces. Anything still unparseable is a genuine failure and the
 * caller retries once (§7.1).
 */
export function extractJson(raw: string): unknown {
  const attempts: string[] = [raw.trim()];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  throw new Error("The model did not return JSON.");
}

/** Parse and validate in one step. Throws on either failure; the caller retries. */
export function parseDraft(raw: string): AiDraft {
  return AiDraftSchema.parse(extractJson(raw));
}

/**
 * Normalise a validated draft for the confirm sheet.
 *
 * Fixes the two inconsistencies that actually show up: a `calorie_range` given
 * backwards, and one whose bounds don't contain the point estimate. Both are
 * presentation bugs rather than nutrition errors — a range that reads
 * "420–310 kcal" makes the app look broken and tells the user nothing.
 */
export function normaliseDraft(draft: AiDraft): AiDraft {
  return {
    ...draft,
    items: draft.items.map((item) => {
      if (!item.calorie_range) return item;
      const [a, b] = item.calorie_range;
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      return {
        ...item,
        calorie_range: [Math.min(low, item.calories), Math.max(high, item.calories)] as [
          number,
          number,
        ],
      };
    }),
  };
}
