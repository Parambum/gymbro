"""
Stage 4: the only script that opens the test split, and it does so through the
exact int8 ONNX file the app downloads.

    python evaluate.py --backbone dinov2-s

Reports, in reports/metrics.json and reports/REPORT.md:

* top-1 / top-5 overall, on Food-101's official test set, and on the Indian
  hold-out — separately, because a strong Western number can hide a weak
  Indian one and India is who this is for;
* per-class accuracy and the most common confusions;
* calibration (ECE) and selective accuracy — "when the model says >= 70%, how
  often is it right, and how often does it say that" — which is what sets the
  app's "not sure" threshold;
* robustness to phone-camera damage (JPEG, blur, dim light, tilt) on a fixed
  sample, because benchmark photos are better than kitchen photos;
* single-image CPU latency for int8 vs fp32.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
import time
from collections import Counter
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageEnhance, ImageFilter

from common import WORK, center_square, decode, iter_rows, parquet_files
from extract import SOURCES, assign
from taxonomy import CLASSES, INDEX, class_key

HERE = Path(__file__).resolve().parent


def to_input(crops: list[Image.Image]) -> np.ndarray:
    arr = np.stack([np.asarray(c, dtype=np.uint8) for c in crops]).astype(np.float32)
    return arr.transpose(0, 3, 1, 2).copy()


def phone_damage(img: Image.Image, kind: str, rng: random.Random) -> Image.Image:
    if kind == "jpeg":
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=35)
        return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
    if kind == "blur":
        return img.filter(ImageFilter.GaussianBlur(1.6))
    if kind == "dim":
        return ImageEnhance.Brightness(img).enhance(0.55)
    if kind == "tilt":
        return img.rotate(rng.choice([-15, 15]), resample=Image.BICUBIC, expand=False, fillcolor=(20, 20, 20))
    raise ValueError(kind)


def test_items(excluded: set[str]):
    for dataset, split, names in SOURCES:
        for path in parquet_files(dataset, split):
            for data, label in iter_rows(path, names):
                sha1 = hashlib.sha1(data).hexdigest()
                if assign(dataset, split, sha1) != "test" or sha1 in excluded:
                    continue
                yield dataset, INDEX[class_key(dataset, label)], data


def latency(model_path: Path, threads: int, runs: int = 20) -> float:
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    sess = ort.InferenceSession(str(model_path), so, providers=["CPUExecutionProvider"])
    x = np.random.default_rng(0).uniform(0, 255, (1, 3, 224, 224)).astype(np.float32)
    sess.run(None, {"pixels": x})
    start = time.perf_counter()
    for _ in range(runs):
        sess.run(None, {"pixels": x})
    return (time.perf_counter() - start) / runs * 1000


def pct(x: float | None) -> str:
    return "—" if x is None else f"{x * 100:.1f}%"


def render_report(m: dict, selection: dict) -> str:
    """The evaluation, written for a person: what was tested, how it did,
    where it fails. Generated — edit evaluate.py, not the file."""
    t = m["test"]
    s = m["at_shipped_threshold"]
    chosen = selection["chosen"]
    lines = [
        "# Food model — evaluation report",
        "",
        f"Backbone **{m['backbone']}** (frozen) + trained head, int8 ONNX, "
        f"{m['model_bytes'] / 1e6:.1f} MB, {m['classes']} dishes. Every number below is the shipped "
        "file run on test photos it never trained on, read once.",
        "",
        "## Headline",
        "",
        "| test set | photos | top-1 | top-5 |",
        "|---|---|---|---|",
        f"| all | {t['all']['n']:,} | {pct(t['all']['top1'])} | {pct(t['all']['top5'])} |",
        f"| Food-101 official test | {t['food101_official_test']['n']:,} | {pct(t['food101_official_test']['top1'])} | {pct(t['food101_official_test']['top5'])} |",
        f"| Indian hold-out | {t['indian_holdout']['n']:,} | {pct(t['indian_holdout']['top1'])} | {pct(t['indian_holdout']['top5'])} |",
        "",
        f"Macro top-1 (every dish weighted equally): **{pct(t['macro_top1'])}**.",
        "",
        "## When the app says it's sure",
        "",
        f"The app leads with one answer when calibrated confidence ≥ **{s['threshold']:.2f}** "
        "(chosen on validation as the lowest threshold where the answer is right ≥ 90% of the time). "
        f"On test that happens for **{pct(s['coverage'])}** of photos, and those answers are right "
        f"**{pct(s['top1_when_confident'])}** of the time. For the rest it shows a shortlist, which "
        f"contains the right dish **{pct(s['top5_when_unsure'])}** of the time.",
        "",
        f"Calibration error (ECE) after temperature scaling (T = {m['calibration']['temperature']:.2f}): "
        f"{m['calibration']['ece'] * 100:.1f} points.",
        "",
        "## Phone-camera damage",
        "",
        "Same 2,000 test photos, degraded the way kitchen photos are:",
        "",
        "| condition | top-1 |",
        "|---|---|",
        *[f"| {k} | {pct(v)} |" for k, v in m["robustness_top1"].items()],
        "",
        "## Speed (laptop CPU, single image)",
        "",
        *[f"- {k.replace('_', ' ')}: {v} ms" for k, v in m["latency_cpu_laptop"].items()],
        "",
        "## How it was chosen",
        "",
        f"Head: {'MLP, ' + str(chosen['cfg']['hidden']) + ' hidden' if chosen['cfg']['hidden'] else 'linear'}, "
        f"lr {chosen['cfg']['lr']}, weight decay {chosen['cfg']['wd']}, label smoothing "
        f"{chosen['cfg']['smoothing']} — best of {len(selection['trials'])} configurations on validation "
        f"({pct(chosen['val']['top1'])} top-1, {pct(chosen['val_macro_top1'])} macro).",
        "",
        "Leakage controls: " + ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in m["cleaning"].items()) + ".",
        "",
        "## Weakest dishes",
        "",
        "| dish | test photos | top-1 | top-5 |",
        "|---|---|---|---|",
        *[
            f"| {k} | {v['n']} | {pct(v['top1'])} | {pct(v['top5'])} |"
            for k, v in sorted(m["per_class"].items(), key=lambda kv: kv[1]["top1"])[:15]
        ],
        "",
        "## Most common confusions",
        "",
        "| true dish | predicted as | times |",
        "|---|---|---|",
        *[f"| {c['true']} | {c['predicted']} | {c['count']} |" for c in m["top_confusions"][:15]],
        "",
        "## Every dish",
        "",
        "| dish | test photos | top-1 | top-5 |",
        "|---|---|---|---|",
        *[f"| {k} | {v['n']} | {pct(v['top1'])} | {pct(v['top5'])} |" for k, v in sorted(m["per_class"].items())],
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backbone", default="dinov2-s")
    ap.add_argument("--robust-sample", type=int, default=2000)
    args = ap.parse_args()

    export = WORK / "export" / args.backbone
    model_path = export / "food-int8.onnx"
    excluded = set(json.loads((WORK / "heads" / args.backbone / "excluded_test_sha1.json").read_text()))
    sess = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])

    probs, ys, sets = [], [], []
    robust_pool: list[tuple[int, bytes]] = []
    batch_imgs, batch_meta = [], []
    rng = random.Random(0)

    def flush():
        if batch_imgs:
            probs.append(sess.run(None, {"pixels": to_input(batch_imgs)})[0])
            for ds, y in batch_meta:
                ys.append(y)
                sets.append(ds)
            batch_imgs.clear()
            batch_meta.clear()

    seen = 0
    start = time.perf_counter()
    for dataset, y, data in test_items(excluded):
        batch_imgs.append(center_square(decode(data)))
        batch_meta.append((dataset, y))
        # reservoir sample for the robustness pass
        seen += 1
        if len(robust_pool) < args.robust_sample:
            robust_pool.append((y, data))
        elif rng.random() < args.robust_sample / seen:
            robust_pool[rng.randrange(args.robust_sample)] = (y, data)
        if len(batch_imgs) == 32:
            flush()
            if len(ys) % 3200 == 0:
                print(f"{len(ys)} test images, {time.perf_counter() - start:.0f}s", flush=True)
    flush()

    P = np.concatenate(probs)
    Y = np.array(ys)
    S = np.array(sets)
    top5 = np.argsort(-P, axis=1)[:, :5]
    pred, conf = top5[:, 0], P.max(1)
    hit1, hit5 = pred == Y, (top5 == Y[:, None]).any(1)

    def summary(mask):
        return {"n": int(mask.sum()), "top1": float(hit1[mask].mean()), "top5": float(hit5[mask].mean())}

    per_class = {}
    for c in range(len(CLASSES)):
        m = Y == c
        if m.any():
            per_class[CLASSES[c]] = {"n": int(m.sum()), "top1": float(hit1[m].mean()), "top5": float(hit5[m].mean())}

    confusions = Counter((CLASSES[a], CLASSES[b]) for a, b in zip(Y[~hit1], pred[~hit1]))

    bins = np.linspace(0, 1, 16)
    ece = 0.0
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            ece += m.mean() * abs(hit1[m].mean() - conf[m].mean())

    selection = json.loads((WORK / "heads" / args.backbone / "selection.json").read_text())
    shipped_t = selection["chosen"]["confident_at"]
    m = conf >= shipped_t
    at_shipped = {
        "threshold": shipped_t,
        "coverage": float(m.mean()),
        "top1_when_confident": float(hit1[m].mean()) if m.any() else None,
        "top5_when_unsure": float(hit5[~m].mean()) if (~m).any() else None,
    }

    selective = []
    for t in (0.3, 0.5, 0.7, 0.9):
        m = conf >= t
        selective.append({
            "threshold": t,
            "coverage": float(m.mean()),
            "top1_when_confident": float(hit1[m].mean()) if m.any() else None,
            "top5_when_unsure": float(hit5[~m].mean()) if (~m).any() else None,
        })

    # robustness: same images, clean vs damaged
    robust = {}
    for kind in ("clean", "jpeg", "blur", "dim", "tilt"):
        correct = 0
        for i in range(0, len(robust_pool), 32):
            chunk = robust_pool[i : i + 32]
            crops = []
            for _, data in chunk:
                img = decode(data)
                if kind != "clean":
                    img = phone_damage(img, kind, random.Random(i))
                crops.append(center_square(img))
            p = sess.run(None, {"pixels": to_input(crops)})[0]
            correct += int((p.argmax(1) == np.array([y for y, _ in chunk])).sum())
        robust[kind] = correct / len(robust_pool)

    speed = {
        "int8_ms_1_thread": round(latency(model_path, 1), 1),
        "int8_ms_4_threads": round(latency(model_path, 4), 1),
        "fp32_ms_1_thread": round(latency(export / "food-fp32.onnx", 1), 1),
    }

    metrics = {
        "backbone": args.backbone,
        "model_bytes": model_path.stat().st_size,
        "classes": len(CLASSES),
        "test": {
            "all": summary(np.ones_like(hit1)),
            "food101_official_test": summary(S == "food101"),
            "indian_holdout": summary(S == "indian43"),
            "macro_top1": float(np.mean([v["top1"] for v in per_class.values()])),
        },
        "calibration": {"ece": float(ece), "temperature": selection["chosen"]["temperature"]},
        "selective": selective,
        "at_shipped_threshold": at_shipped,
        "robustness_top1": robust,
        "latency_cpu_laptop": speed,
        "cleaning": selection["cleaning"],
        "per_class": per_class,
        "top_confusions": [{"true": a, "predicted": b, "count": n} for (a, b), n in confusions.most_common(25)],
    }

    reports = HERE / "reports"
    reports.mkdir(exist_ok=True)
    (reports / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (reports / "REPORT.md").write_text(render_report(metrics, selection), encoding="utf-8")
    print(json.dumps({k: metrics[k] for k in ("test", "calibration", "at_shipped_threshold", "selective", "robustness_top1", "latency_cpu_laptop")}, indent=2))


if __name__ == "__main__":
    main()
