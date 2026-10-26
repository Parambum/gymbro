"""The coach's research library, for the LangGraph backend.

A port of src/lib/coach/rag (retrieve.ts, bm25.ts, store.ts) over the SAME
files — src/lib/data/coach-kb.json/.bin, the bge-small model in models/coach,
and the settings in shared/coach/retrieval.json — so `knowledge_search` returns
the same passages, numbered the same way, from either backend. The library is
built by `npm run coach:kb`; this module only reads it.

The question is embedded with native onnxruntime and Hugging Face `tokenizers`
rather than the app's WASM runtime. Token ids are identical (that is what
scripts/coach/verify-embedder.py checks); the int8 kernels round slightly
differently (cosine ≈ 0.998 between the two), which can swap two near-tied
passages but does not change what the library knows.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
KB_JSON = REPO_ROOT / "src" / "lib" / "data" / "coach-kb.json"
KB_BIN = REPO_ROOT / "src" / "lib" / "data" / "coach-kb.bin"
MODEL_DIR = REPO_ROOT / "models" / "coach" / "bge-small-en-v1.5"
SETTINGS = json.loads((REPO_ROOT / "shared" / "coach" / "retrieval.json").read_text(encoding="utf-8"))

QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
K1, B = 1.2, 0.75
STOPWORDS = set(SETTINGS["stopwords"].split())
GYM_TERMS = [(re.compile(p), words) for p, words in SETTINGS["gymTerms"]]


# ── keyword side (bm25.ts) ────────────────────────────────────────────

def stem(w: str) -> str:
    if len(w) <= 3 or any(c.isdigit() for c in w):
        return w
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("sses"):
        return w[:-2]
    if w.endswith("ing") and len(w) > 5:
        return w[:-3]
    if w.endswith("ed") and len(w) > 4 and not w.endswith("eed"):
        return w[:-2]
    if w.endswith("s") and not re.search(r"(ss|us|is|ys)$", w):
        return w[:-1]
    return w


def analyze(text: str) -> list[str]:
    t = unicodedata.normalize("NFKD", text)
    t = "".join(c for c in t if not unicodedata.category(c).startswith("M")).lower()
    t = t.replace("β", "beta").replace("ω", "omega")
    return [stem(tok) for tok in re.split(r"[^a-z0-9]+", t) if len(tok) > 1 and tok not in STOPWORDS]


def expansion_text(text: str) -> str:
    """The papers' wording for the slang in a question — appended before embedding (bm25.ts)."""
    lower = text.lower()
    return " ".join(words for pattern, words in GYM_TERMS if pattern.search(lower))


def expand_query(text: str) -> list[str]:
    lower = text.lower()
    extra: list[str] = []
    for pattern, words in GYM_TERMS:
        if pattern.search(lower):
            extra.extend(analyze(words))
    return extra


class Bm25:
    def __init__(self, texts: list[str]):
        self.docs = []
        for t in texts:
            tf: dict[str, int] = {}
            for term in analyze(t):
                tf[term] = tf.get(term, 0) + 1
            self.docs.append(tf)
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avg = sum(self.lengths) / max(len(self.docs), 1)
        self.df: dict[str, int] = {}
        for d in self.docs:
            for term in d:
                self.df[term] = self.df.get(term, 0) + 1

    def scores(self, query: str) -> np.ndarray:
        weights: dict[str, float] = {t: 1.0 for t in analyze(query)}
        for t in expand_query(query):
            weights.setdefault(t, SETTINGS["expansionWeight"])
        n_docs = len(self.docs)
        out = np.zeros(n_docs, dtype=np.float64)
        for term, w in weights.items():
            n = self.df.get(term)
            if not n:
                continue
            idf = math.log(1 + (n_docs - n + 0.5) / (n + 0.5))
            for i, d in enumerate(self.docs):
                tf = d.get(term)
                if tf:
                    norm = tf + K1 * (1 - B + B * self.lengths[i] / self.avg)
                    out[i] += w * idf * (tf * (K1 + 1)) / norm
        return out


# ── the library and the embedder ──────────────────────────────────────

@lru_cache(maxsize=1)
def _library():
    kb = json.loads(KB_JSON.read_text(encoding="utf-8"))
    dim, p_count = kb["dim"], len(kb["passages"])
    raw = KB_BIN.read_bytes()
    expected = p_count * dim * 4 + kb["sentenceCount"] * 4 + kb["sentenceCount"] * dim
    if len(raw) != expected:
        raise RuntimeError(f"coach-kb.bin is {len(raw)} bytes, expected {expected} — run npm run coach:kb")
    vectors = np.frombuffer(raw, dtype="<f4", count=p_count * dim).reshape(p_count, dim)
    texts = [
        f"{kb['sources'][p['source']]['title']} {p['section']} {' '.join(p['sentences'])}" for p in kb["passages"]
    ]
    return kb, vectors, Bm25(texts)


@lru_cache(maxsize=1)
def _embedder():
    import onnxruntime as ort
    from tokenizers import Tokenizer, normalizers, pre_tokenizers, processors
    from tokenizers.models import WordPiece

    tok = Tokenizer(WordPiece.from_file(str(MODEL_DIR / "vocab.txt"), unk_token="[UNK]", max_input_chars_per_word=100))
    tok.normalizer = normalizers.BertNormalizer(clean_text=True, handle_chinese_chars=True, strip_accents=None, lowercase=True)
    tok.pre_tokenizer = pre_tokenizers.BertPreTokenizer()
    tok.post_processor = processors.TemplateProcessing(
        single="[CLS] $A [SEP]",
        special_tokens=[("[CLS]", tok.token_to_id("[CLS]")), ("[SEP]", tok.token_to_id("[SEP]"))],
    )
    tok.enable_truncation(512)
    session = ort.InferenceSession(str(MODEL_DIR / "model_quantized.onnx"))
    return tok, session, {i.name for i in session.get_inputs()}


def embed_query(text: str) -> np.ndarray:
    tok, session, names = _embedder()
    ids = np.array([tok.encode(QUERY_PREFIX + text).ids], dtype=np.int64)
    feeds = {"input_ids": ids, "attention_mask": np.ones_like(ids)}
    if "token_type_ids" in names:
        feeds["token_type_ids"] = np.zeros_like(ids)
    cls = session.run(None, feeds)[0][0, 0]
    return cls / np.linalg.norm(cls)


def _ranks(scores: np.ndarray) -> dict[int, int]:
    order = [i for i in np.argsort(-scores, kind="stable") if scores[i] > 0][: SETTINGS["candidates"]]
    return {int(p): r for r, p in enumerate(order)}


def retrieve(query: str, limit: int = 5) -> list[dict]:
    """Hybrid BM25 + embedding retrieval fused by RRF — retrieve.ts, line for line."""
    kb, vectors, bm25 = _library()
    expansion = expansion_text(query)
    dense = vectors @ embed_query(f"{query} ({expansion})" if expansion else query)
    lexical = bm25.scores(query)
    fused: dict[int, float] = {}
    for ranks in (_ranks(np.maximum(dense, 0)), _ranks(lexical)):
        for passage, rank in ranks.items():
            fused[passage] = fused.get(passage, 0.0) + 1 / (SETTINGS["rrfK"] + rank + 1)

    per_source: dict[int, int] = {}
    hits = []
    for passage, score in sorted(fused.items(), key=lambda kv: -kv[1]):
        source = kb["passages"][passage]["source"]
        if per_source.get(source, 0) >= SETTINGS["perSource"]:
            continue
        per_source[source] = per_source.get(source, 0) + 1
        hits.append({"passage": passage, "fused": score, "dense": float(dense[passage])})
        if len(hits) >= limit:
            break
    return hits


def _source_line(s: dict) -> str:
    title = s["title"].replace("[", "").replace("]", "")
    return f"[{title}]({s['url']}) — {s['authors']}, {s['year'] or 'n.d.'} · {s['license']}"


def knowledge_search_text(query: str) -> str:
    """The `knowledge_search` tool body — same wording as knowledgeSearch() in tools.ts."""
    kb, _, _ = _library()
    floor = SETTINGS["minPassageCosine"]
    hits = retrieve(query, 5)
    relevant = [h for h in hits if h["dense"] >= floor - 0.04]
    if not relevant or hits[0]["dense"] < floor:
        return f'No passage in the research library matches "{query}". Tell the user the library has nothing on it; do not cite anything.'

    order: list[int] = []
    blocks = []
    for h in relevant:
        p = kb["passages"][h["passage"]]
        if p["source"] not in order:
            order.append(p["source"])
        n = order.index(p["source"]) + 1
        blocks.append(f"[{n}] ({p['section'] or 'body'})\n{' '.join(p['sentences'])}")
    sources = [f"[{i + 1}] {_source_line(kb['sources'][s])}" for i, s in enumerate(order)]
    return "\n\n".join([*blocks, "", "SOURCES (copy the ones you cite, verbatim, under a 'Sources' heading):", *sources])
