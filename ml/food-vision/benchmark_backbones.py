"""
Pick the backbone by measurement, not by reputation.

Every candidate sees the same images under the same protocol: frozen features,
a logistic-regression probe, top-1 on held-out images. Accuracy is then set
against what the phone pays for it — parameters (download size) and CPU time
per image — because a model that is 2 points better and 4x slower is the wrong
choice for a snapshot someone takes standing at a counter.

    python benchmark_backbones.py --train-per-class 40 --test-per-class 20
"""

from __future__ import annotations

import argparse
import json
import random
import time
from collections import defaultdict

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import normalize

from common import BACKBONES, WORK, Backbone, center_square, decode, iter_rows, parquet_files, to_tensor
from taxonomy import FOOD101, class_key


def sample(train_per_class: int, test_per_class: int, seed: int, shards: int):
    """Training-split images only. Choosing a backbone by its score on the
    official test set would be selecting on test data — a small leak, but the
    final numbers are only worth reporting if the test set was never looked at
    before the end."""
    by_class: dict[str, list[bytes]] = defaultdict(list)
    sources = [("food101", "train", FOOD101), ("indian43", "train", None)]
    for dataset, split, names in sources:
        for path in parquet_files(dataset, split)[:shards]:
            for data, label in iter_rows(path, names):
                by_class[class_key(dataset, label)].append(data)

    rng = random.Random(seed)
    need = train_per_class + test_per_class
    train, test = [], []
    for key in sorted(by_class):
        items = by_class[key]
        if len(items) < need:
            continue
        rng.shuffle(items)
        train += [(key, b) for b in items[:train_per_class]]
        test += [(key, b) for b in items[train_per_class:need]]
    return train, test


@torch.inference_mode()
def features(model: Backbone, crops, batch: int = 32) -> tuple[np.ndarray, float]:
    out, start = [], time.perf_counter()
    for i in range(0, len(crops), batch):
        out.append(model(to_tensor(crops[i : i + batch])).numpy())
    seconds = time.perf_counter() - start
    return np.concatenate(out), seconds / len(crops)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train-per-class", type=int, default=40)
    ap.add_argument("--test-per-class", type=int, default=20)
    ap.add_argument("--backbones", nargs="*", default=list(BACKBONES))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--shards", type=int, default=99, help="training shards per dataset to read")
    args = ap.parse_args()

    train, test = sample(args.train_per_class, args.test_per_class, args.seed, args.shards)
    classes = sorted({k for k, _ in train})
    print(f"{len(classes)} classes, {len(train)} train / {len(test)} test images")

    crop = lambda items: [center_square(decode(b)) for _, b in items]  # noqa: E731
    train_x, test_x = crop(train), crop(test)
    train_y = np.array([classes.index(k) for k, _ in train])
    test_y = np.array([classes.index(k) for k, _ in test])

    results = {}
    for name in args.backbones:
        model = Backbone(name)
        params = sum(p.numel() for p in model.model.parameters())
        ftr, _ = features(model, train_x)
        fte, per_image = features(model, test_x)
        ftr, fte = normalize(ftr), normalize(fte)

        best = None
        for c in (0.5, 2.0, 8.0):
            clf = LogisticRegression(C=c, max_iter=2000)
            clf.fit(ftr, train_y)
            prob = clf.predict_proba(fte)
            top1 = float((prob.argmax(1) == test_y).mean())
            top5 = float((np.argsort(-prob, 1)[:, :5] == test_y[:, None]).any(1).mean())
            if best is None or top1 > best["top1"]:
                best = {"C": c, "top1": top1, "top5": top5}

        results[name] = {
            "params_m": round(params / 1e6, 1),
            "cpu_ms_per_image_batched": round(per_image * 1000, 1),
            **best,
        }
        print(name, json.dumps(results[name]))
        del model

    WORK.mkdir(parents=True, exist_ok=True)
    out = WORK / "backbone_benchmark.json"
    out.write_text(json.dumps({"args": vars(args), "classes": len(classes), "results": results}, indent=2))
    print("wrote", out)


if __name__ == "__main__":
    main()
