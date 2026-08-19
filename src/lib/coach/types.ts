/** Shared shapes for the coach, so provider adapters don't import each other. */

export interface CoachTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CoachReply {
  reply: string;
  toolsUsed: string[];
  /** which engine answered: "anthropic" | "groq" | "langgraph" */
  backend: string;
}

/** Same guard rail on every provider: a runaway loop costs real money. */
export const MAX_TOOL_ITERATIONS = 6;

/** The persona is deliberately terse — a widget-sized reply, not an essay. */
export const MAX_OUTPUT_TOKENS = 4096;

export const EMPTY_REPLY_FALLBACK = "I didn't catch that — mind rephrasing?";
