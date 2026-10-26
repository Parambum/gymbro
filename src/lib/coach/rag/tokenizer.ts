/**
 * BERT WordPiece tokenizer, for the coach's embedding model (bge-small-en-v1.5).
 *
 * A port of the Hugging Face `tokenizers` pipeline that model ships with —
 * BertNormalizer → BertPreTokenizer → WordPiece → [CLS] … [SEP] — so the ids
 * here are the ids the model was trained on. It is checked against the Rust
 * implementation by `scripts/coach/verify-embedder.py`; a tokenizer that is
 * merely close produces embeddings that are quietly wrong, and retrieval just
 * gets worse with no error anywhere.
 *
 * Written out rather than pulled from a package because the packages that do
 * this in JS bring onnxruntime-node and sharp with them — a few hundred MB of
 * native binaries for a function this size.
 */

export interface Encoded {
  inputIds: number[];
  attentionMask: number[];
  tokenTypeIds: number[];
}

/** bge-small's limit, including [CLS] and [SEP]. */
export const MAX_TOKENS = 512;
const MAX_CHARS_PER_WORD = 100;

// ── character classes, matching the Rust crate's definitions ─────────

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || /\p{Zs}/u.test(ch);
}

function isControl(ch: string): boolean {
  if (ch === "\t" || ch === "\n" || ch === "\r") return false;
  return /\p{C}/u.test(ch);
}

/** ASCII punctuation counts even where Unicode calls it a symbol ($, +, ^, `). */
function isPunctuation(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) {
    return true;
  }
  return /\p{P}/u.test(ch);
}

function isChineseChar(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2b73f) ||
    (cp >= 0x2b740 && cp <= 0x2b81f) ||
    (cp >= 0x2b920 && cp <= 0x2ceaf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x2f800 && cp <= 0x2fa1f)
  );
}

// ── pipeline ─────────────────────────────────────────────────────────

/** clean_text, handle_chinese_chars, strip_accents (follows lowercase), lowercase. */
export function normalize(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0 || cp === 0xfffd || isControl(ch)) continue;
    if (isWhitespace(ch)) out += " ";
    else if (isChineseChar(cp)) out += ` ${ch} `;
    else out += ch;
  }
  out = out.normalize("NFD").replace(/\p{Mn}/gu, "");
  return out.toLowerCase();
}

/** Split on whitespace, and make every punctuation character its own word. */
export function preTokenize(text: string): string[] {
  const words: string[] = [];
  let current = "";
  for (const ch of text) {
    if (isWhitespace(ch)) {
      if (current) words.push(current);
      current = "";
    } else if (isPunctuation(ch)) {
      if (current) words.push(current);
      words.push(ch);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) words.push(current);
  return words;
}

export class WordPieceTokenizer {
  private readonly vocab: Map<string, number>;
  private readonly unkId: number;
  private readonly clsId: number;
  private readonly sepId: number;

  constructor(vocabText: string) {
    this.vocab = new Map();
    // vocab.txt: one token per line, id = line number
    vocabText.split(/\r?\n/).forEach((token, id) => {
      if (token !== "" && !this.vocab.has(token)) this.vocab.set(token, id);
    });
    this.unkId = this.required("[UNK]");
    this.clsId = this.required("[CLS]");
    this.sepId = this.required("[SEP]");
  }

  private required(token: string): number {
    const id = this.vocab.get(token);
    if (id === undefined) throw new Error(`vocab is missing ${token}`);
    return id;
  }

  /** Greedy longest-match-first; one unmatched piece makes the whole word [UNK]. */
  private wordPiece(word: string): number[] {
    const chars = Array.from(word);
    if (chars.length > MAX_CHARS_PER_WORD) return [this.unkId];

    const ids: number[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let found: number | undefined;
      while (start < end) {
        const piece = (start > 0 ? "##" : "") + chars.slice(start, end).join("");
        found = this.vocab.get(piece);
        if (found !== undefined) break;
        end -= 1;
      }
      if (found === undefined) return [this.unkId];
      ids.push(found);
      start = end;
    }
    return ids;
  }

  /** Token ids without the special tokens. */
  tokenize(text: string): number[] {
    return preTokenize(normalize(text)).flatMap((w) => this.wordPiece(w));
  }

  encode(text: string, maxTokens: number = MAX_TOKENS): Encoded {
    const body = this.tokenize(text).slice(0, maxTokens - 2);
    const inputIds = [this.clsId, ...body, this.sepId];
    return {
      inputIds,
      attentionMask: inputIds.map(() => 1),
      tokenTypeIds: inputIds.map(() => 0),
    };
  }

  /** How many model tokens a passage costs, specials included. Chunking uses it. */
  count(text: string): number {
    return this.tokenize(text).length + 2;
  }
}
