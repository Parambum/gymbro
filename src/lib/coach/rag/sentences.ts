/**
 * Split scientific prose into sentences.
 *
 * The coach answers by quoting sentences from papers, so a bad split is
 * visible: "Jäger et al." cut off from its finding, or "1." stranded from
 * "6 g/kg". The rule is the conventional one — a sentence ends at . ! or ?
 * followed by whitespace and a capital, digit or opening bracket — with the
 * exceptions that matter in this corpus:
 *
 * - known abbreviations (et al., e.g., vs., Fig., approx.);
 * - any token with a period inside it (U.S., e.g, i.e);
 * - a lone capital letter, which is an initial (J. Smith).
 *
 * Decimals never reach the rule: "1.6" has no whitespace after its period.
 */

const ABBREVIATIONS = new Set([
  "al",
  "e.g",
  "i.e",
  "vs",
  "v",
  "fig",
  "figs",
  "eq",
  "eqs",
  "ref",
  "refs",
  "approx",
  "ca",
  "cf",
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "no",
  "nos",
  "vol",
  "pp",
  "p",
  "st",
  "sr",
  "jr",
  "inc",
  "ltd",
  "resp",
  "viz",
  "min",
  "sec",
  "wk",
  "wks",
  "hr",
  "hrs",
  "kcal",
]);

/** Abbreviations that are followed by a capitalised word as a matter of course. */
const NEVER_ENDS = new Set(["al", "e.g", "i.e", "vs", "v", "fig", "figs", "eq", "eqs", "ref", "refs", "cf", "dr", "mr", "mrs", "ms", "prof", "no", "nos", "vol", "pp", "p", "st", "viz"]);

function endsSentence(before: string, after: string): boolean {
  const word = before.match(/([\p{L}.]+)$/u)?.[1] ?? "";
  const bare = word.replace(/^\.+/, "").toLowerCase();

  if (NEVER_ENDS.has(bare)) return false;
  if (/^\p{Lu}$/u.test(word)) return false; // an initial
  if (bare.includes(".")) return false; // U.S, e.g — internal periods
  // "approx. 20" or "min. The" — an ordinary abbreviation ends a sentence only
  // when what follows looks like a new sentence rather than a continuation
  if (ABBREVIATIONS.has(bare)) return /^\p{Lu}\p{Ll}/u.test(after);
  return true;
}

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  // closing quotes may be straight or curly: …no ideal “hypertrophy zone.” From…
  const re = /[.!?]+["'”’)\]]*\s+(?=["'“‘(\[]?[\p{Lu}\p{N}])/gu;
  let start = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const run = m[0].match(/^[.!?]+/)![0];
    const before = text.slice(start, m.index + 1).replace(/[.!?]+$/, "");
    const after = text.slice(end);

    // "2. Is creatine…" — an enumerator belongs to the sentence it numbers
    if (/^(?:\(?\d{1,3}[.)]|[ivx]{1,5}\.)$/i.test(text.slice(start, m.index + 1).trim())) continue;
    // a single period after an abbreviation may not end the sentence; "al.."
    // (abbreviation plus full stop) always does
    if (run === "." && !endsSentence(before, after)) continue;

    const sentence = text.slice(start, end).trim().replace(/\.\.(["'”’)\]]*)$/, ".$1");
    if (sentence) out.push(sentence);
    start = end;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}
