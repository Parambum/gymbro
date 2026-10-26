"""
Reference output for the coach's embedder, from the official implementations.

    python scripts/coach/verify-embedder.py      # needs: tokenizers onnxruntime numpy

Tokenises a set of deliberately awkward strings with Hugging Face's Rust
`tokenizers` (configured exactly as bge-small-en-v1.5's tokenizer.json: BERT
normaliser with lowercasing and accent stripping, BERT pre-tokeniser,
WordPiece, [CLS] ... [SEP]) and embeds them with native onnxruntime, then
writes src/lib/coach/rag/embedder-reference.json.

Two checks read that file:
  - tokenizer.test.ts   the TypeScript tokenizer must produce IDENTICAL ids;
  - verify-embedder.ts  the TypeScript embedder's vectors must agree (the WASM
                        and native int8 kernels round differently, so the bar
                        is cosine >= 0.995, not equality).

The strings cover what breaks hand-written BERT tokenizers: accents, CJK,
Devanagari combining marks, emoji, zero-width and control characters, symbols
that are ASCII punctuation but Unicode symbols, superscripts, ligatures,
full-width forms and over-long words.
"""
import json
import os

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer, normalizers, pre_tokenizers, processors
from tokenizers.models import WordPiece

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_DIR = os.path.join(ROOT, "models", "coach", "bge-small-en-v1.5")
OUT = os.path.join(ROOT, "src", "lib", "coach", "rag", "embedder-reference.json")

TEXTS = [
    "Represent this sentence for searching relevant passages: how much protein per day to build muscle?",
    "Protein intakes of 1.4–2.0 g·kg⁻¹·d⁻¹ are sufficient; ≥3.0 g/kg/d may help.",
    "Café Ångström naïve résumé Über straße ŒUVRE",
    "Creatine monohydrate (CrM) — 3–5 g/day × 4 weeks; 0.3 g/kg/d loading!!! $5 + 10% ^ ~ `tick` | <tag>",
    "दाल चावल protein 中文字符测试 日本語 한국어 emoji \U0001f4aa\U0001f3fd ZWJ‍test zero​width",
    "tabs\tand\nnewlines\r\n  multiple   spaces and control\u0007char and ­ soft hyphen",
    "supercalifragilisticexpialidocious" * 3 + "xyz",
    "VO2max, HIIT, 1RM (one-repetition maximum), RIR/RPE, e.g. i.e. U.S.A. 10-15 reps @ 70–85% 1RM",
    "β-alanine 4–6 g/d; μg; Ω; ½ cup; ① ² ³; ﬁ ligature; Ⅳ; ＦＵＬＬＷＩＤＴＨ",
    "Does creatine cause hair loss? 2. Is creatine an anabolic steroid? (Jäger et al., 2017)",
]


def bge_tokenizer() -> Tokenizer:
    tok = Tokenizer(WordPiece.from_file(os.path.join(MODEL_DIR, "vocab.txt"), unk_token="[UNK]", max_input_chars_per_word=100))
    tok.normalizer = normalizers.BertNormalizer(clean_text=True, handle_chinese_chars=True, strip_accents=None, lowercase=True)
    tok.pre_tokenizer = pre_tokenizers.BertPreTokenizer()
    cls_id, sep_id = tok.token_to_id("[CLS]"), tok.token_to_id("[SEP]")
    tok.post_processor = processors.TemplateProcessing(
        single="[CLS] $A [SEP]", special_tokens=[("[CLS]", cls_id), ("[SEP]", sep_id)]
    )
    tok.enable_truncation(512)
    return tok


def main() -> None:
    tok = bge_tokenizer()
    session = ort.InferenceSession(os.path.join(MODEL_DIR, "model_quantized.onnx"))
    names = {i.name for i in session.get_inputs()}
    cases = []
    for text in TEXTS:
        ids = tok.encode(text).ids
        arr = np.array([ids], dtype=np.int64)
        feeds = {"input_ids": arr, "attention_mask": np.ones_like(arr)}
        if "token_type_ids" in names:
            feeds["token_type_ids"] = np.zeros_like(arr)
        cls = session.run(None, feeds)[0][0, 0]
        cls = cls / np.linalg.norm(cls)
        cases.append({"text": text, "ids": ids, "vector": [round(float(x), 6) for x in cls]})
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"model": "bge-small-en-v1.5 int8", "cases": cases}, f, ensure_ascii=False)
    print(f"wrote {len(cases)} reference cases to {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
