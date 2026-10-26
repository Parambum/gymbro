import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WordPieceTokenizer, normalize, preTokenize } from "./tokenizer";
import reference from "./embedder-reference.json";

/**
 * The tokenizer must reproduce Hugging Face's Rust implementation exactly —
 * a near-miss changes every embedding a little and degrades retrieval with no
 * error anywhere. The expected ids come from scripts/coach/verify-embedder.py.
 */

const vocab = readFileSync(path.join(process.cwd(), "models", "coach", "bge-small-en-v1.5", "vocab.txt"), "utf8");
const tokenizer = new WordPieceTokenizer(vocab);

describe("WordPieceTokenizer vs Hugging Face tokenizers", () => {
  for (const [i, c] of reference.cases.entries()) {
    it(`case ${i}: ${JSON.stringify(c.text.slice(0, 40))}`, () => {
      expect(tokenizer.encode(c.text).inputIds).toEqual(c.ids);
    });
  }
});

describe("normalize", () => {
  it("lower-cases and strips accents", () => {
    expect(normalize("Café ÅNGSTRÖM")).toBe("cafe angstrom");
  });
  it("drops control characters and turns whitespace into spaces", () => {
    expect(normalize("a\u0007b\tc\nd")).toBe("ab c d");
  });
  it("pads CJK characters so each becomes its own word", () => {
    expect(normalize("中文")).toBe(" 中  文 ");
  });
});

describe("preTokenize", () => {
  it("splits punctuation off, including ASCII symbols Unicode calls symbols", () => {
    expect(preTokenize("1.6g/kg $5+10%")).toEqual(["1", ".", "6g", "/", "kg", "$", "5", "+", "10", "%"]);
  });
});

describe("encode", () => {
  it("wraps in [CLS] … [SEP] and masks every real token", () => {
    const e = tokenizer.encode("protein");
    expect(e.inputIds[0]).toBe(101);
    expect(e.inputIds[e.inputIds.length - 1]).toBe(102);
    expect(e.attentionMask.every((m) => m === 1)).toBe(true);
    expect(e.tokenTypeIds.every((t) => t === 0)).toBe(true);
  });
  it("truncates to the model limit, keeping [SEP] last", () => {
    const e = tokenizer.encode("squat ".repeat(1000));
    expect(e.inputIds).toHaveLength(512);
    expect(e.inputIds[511]).toBe(102);
  });
});
