/**
 * Decide what a message is asking for — the keyless coach's version of the
 * four modes in shared/coach/system-prompt.md, plus the safety rule that
 * outranks all of them.
 *
 * Rules, not a classifier: every route here is a fixed behaviour (a doctor
 * line, a questionnaire, the programme generator, the training log, the
 * research library), and a rule that misfires is a one-line fix someone can
 * read. Order matters and is the priority: safety first, then anything that
 * carries conversation state, then the explicit asks, then research as the
 * default for a question.
 */

export type Intent =
  | "safety"
  | "greeting"
  | "thanks"
  | "demo"
  | "plan"
  | "my-training"
  | "research";

/** Symptoms and injuries: any mention gets the doctor line, whoever it is about. */
const SYMPTOM =
  /\b(pain|painful|hurts?|hurting|injur\w*|sprain\w*|torn|tore|ruptur\w*|dislocat\w*|fractur\w*|broken bone|dizz\w*|faint\w*|passed out|black(ed)? out|chest (pain|tight\w*)|palpitations?|heart (attack|condition|problem|issue)s?|shortness of breath|can'?t breathe|numb\w*|swollen|swelling|hernia|sciatica|slipped disc|herniated|tendinitis|tendonitis|concussion)\b/i;

/**
 * Conditions count when they are the user's own — "does creatine cause kidney
 * damage?" is a research question; "I have kidney disease" is not.
 */
const CONDITION =
  /\b(diabet\w*|high blood pressure|hypertension|kidney (disease|problems?|condition|failure)|liver (disease|problems?)|heart disease|asthma|pregnan\w*|post-?partum|surgery|operation|arthritis|osteoporosis|epilep\w*|eating disorder|anorexi\w*|bulimi\w*|medication|on meds)\b/i;
const FIRST_PERSON = /\b(i|i'm|im|i've|ive|i am|my|me|mine)\b/i;

const GREETING = /^(hi|hey|hello|hiya|yo|sup|howdy|namaste|good (morning|afternoon|evening))\b/i;
const THANKS = /^(thanks|thank you|thx|ty|cheers|great|awesome|nice|cool|perfect|ok|okay|got it|appreciate it)\b/i;

const DEMO = /\b(demo|show me what you can do|what can you do|sample (plan|workout|program|programme|routine|week)|example (plan|workout|program|programme|routine|week))\b/i;

const PLAN =
  /\b((workout|training|gym|exercise|custom|personal|personali[sz]ed|weekly|a-z)\s+(plan|program|programme|routine|split|schedule)|(plan|program|programme|routine|split)\s+for me|(build|make|create|design|write|give|generate)\s+(me\s+)?(a\s+|my\s+)?(\w+\s+)?(plan|program|programme|routine|split))\b/i;

const MY_TRAINING =
  /\b(my (training|progress|log|logs|lifts?|workouts?|sessions?|numbers|week|month|bench|squat|deadlift|strength|history|stats)|how am i doing|how'?s my|am i (progressing|improving|getting stronger|on track)|what should i (train|do|work on) today|weak (point|spot|link)s?|weakest|lagging|what am i (missing|neglecting|skipping)|(analy[sz]e|review|check|look at) my)\b/i;

/** The questionnaire's opening line, which marks a plan conversation in progress. */
export const QUESTIONNAIRE_MARKER = "To build it around you";
/** A heading every generated plan carries, which marks a plan the user may now adjust. */
export const PLAN_MARKER = "### How to progress";

/**
 * Figures of speech that contain a symptom word and are not about a body.
 * Kept short on purpose: a missed idiom costs one unnecessary doctor line, a
 * wrongly-excused symptom costs far more. ("pain in the neck" is NOT here —
 * people have literal neck pain.)
 */
const IDIOMS = /\b(no pain,? no gain|hurts? (my |your |the )?(gains|progress|results|bulk|cut)|torn between)\b/gi;

/**
 * @param hasPlanDetail the message itself names a goal, level, equipment or
 *   schedule — "make it 5 days" after a plan is a request to rebuild it.
 */
export function classify(message: string, previousAssistant: string | null, hasPlanDetail = false): Intent {
  const text = message.trim();
  const words = text.split(/\s+/).length;
  const literal = text.replace(IDIOMS, " ");

  if (SYMPTOM.test(literal) || (CONDITION.test(literal) && FIRST_PERSON.test(literal))) return "safety";

  // An answer to the questionnaire is a plan turn, unless it is plainly a new
  // question instead ("actually, how much protein?").
  if (previousAssistant?.includes(QUESTIONNAIRE_MARKER) && !/\?\s*$/.test(text)) return "plan";
  if (previousAssistant?.includes(PLAN_MARKER) && hasPlanDetail && !/\?\s*$/.test(text)) return "plan";

  if (DEMO.test(text)) return "demo";
  if (PLAN.test(text)) return "plan";
  if (MY_TRAINING.test(text)) return "my-training";

  if (words <= 4 && GREETING.test(text)) return "greeting";
  if (words <= 5 && THANKS.test(text)) return "thanks";

  return "research";
}

/**
 * Is this a follow-up that only makes sense with the previous question?
 * "why?", "and for women?", "how much?" — retrieval needs the topic they are
 * still talking about, which lives in the turn before.
 */
export function isFollowUp(message: string): boolean {
  const text = message.trim().toLowerCase();
  const words = text.split(/\s+/).length;
  if (words > 8) return false;
  return (
    /^(and|but|so|also|then|why|how (much|many|often|long)|what about|how about|more|tell me more|go on|explain|is that|does that|for (women|men|beginners|older)|in (women|men))\b/.test(text) ||
    /\b(it|that|this|those|them|they)\b/.test(text)
  );
}

export function wantsMore(message: string): boolean {
  return /^(more|tell me more|go on|anything else|what else|keep going|continue)\b/i.test(message.trim());
}
