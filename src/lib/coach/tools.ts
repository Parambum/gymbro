import { webScraper } from "@/lib/coach/web-scraper";
import { DEFAULT_WINDOW_DAYS, trainingLogBrief } from "@/lib/coach/training-log";

/**
 * The coach's tool surface, defined once for every provider.
 *
 * Anthropic wants `{name, description, input_schema}` and Groq wants
 * `{type:"function", function:{name, description, parameters}}` — the same
 * JSON Schema wearing two different hats. Declaring it twice is how the two
 * engines quietly start behaving differently, so both adapters build from
 * these constants and execute through `runCoachTool`.
 */

export const WEB_SCRAPER = {
  name: "web_scraper",
  description:
    "Research fitness information on the live web: exact set/rep breakdowns of named " +
    "protocols (Arnold split, 5/3/1, GVT), current research on supplement or nutrient " +
    "timing, and form cues for uncommon exercises. Accepts a plain-language query or a " +
    "full URL. Use only when you cannot answer with expert-level certainty — never for " +
    "basic fitness advice.",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query, or a full http(s) URL to read directly",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
} as const;

export const TRAINING_LOG = {
  name: "training_log",
  description:
    "The signed-in user's real logged GymBro training: sessions, working sets, tonnage, " +
    "muscle-group coverage, per-lift e1RM trend and recorded 1RMs. Call this whenever " +
    "the user asks about their own training or before writing them a custom plan. " +
    "Returns real data only — if it reports no sessions, say so instead of inventing any.",
  schema: {
    type: "object",
    properties: {
      days: {
        type: "integer",
        minimum: 7,
        maximum: 365,
        description: `How many days back to summarise (default ${DEFAULT_WINDOW_DAYS})`,
      },
    },
    required: [],
    additionalProperties: false,
  },
} as const;

/** Which tools this turn may use. `training_log` needs a session behind it. */
export function availableTools(userId: string | null) {
  return userId ? [WEB_SCRAPER, TRAINING_LOG] : [WEB_SCRAPER];
}

/**
 * Run one tool call. `userId` comes from the server session, never from the
 * model — a tool cannot be talked into reading another lifter's log.
 *
 * A thrown tool is worse than a useless one: it kills the whole reply. Failures
 * come back as text the model can read and work around.
 */
export async function runCoachTool(
  name: string,
  input: unknown,
  userId: string | null,
): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>;

  try {
    if (name === WEB_SCRAPER.name) {
      const query = typeof args.query === "string" ? args.query : "";
      if (!query.trim()) return "No query supplied — nothing to research.";
      const { text } = await webScraper(query);
      return text;
    }

    if (name === TRAINING_LOG.name) {
      if (!userId) {
        return "The user is not signed in, so there is no training log to read. Coach them from the questionnaire instead, and do not invent any training data.";
      }
      const days = typeof args.days === "number" ? args.days : DEFAULT_WINDOW_DAYS;
      return await trainingLogBrief(userId, days);
    }

    return `Unknown tool "${name}".`;
  } catch (err) {
    console.error(`[coach] tool ${name} failed:`, err);
    const message = err instanceof Error ? err.message : "unknown error";
    return `The ${name} tool failed (${message}). Continue without it and do not invent data.`;
  }
}
