"""
Stage 1: images -> feature vectors, one shard at a time.

    python extract.py --backbone dinov2-s --train-views 2

Splits
------
* Food-101 keeps its official split. Its test set (25,250 images, cleaned by
  hand by the dataset authors) is the benchmark everyone reports, so it stays
  exactly as published. 5% of its training images become validation.
* The Indian set ships validation/test images for only 22 of its 43 classes,
  so its own split cannot measure the other 21. All of its images are pooled
  and re-split 70/10/20.

Every split decision is a function of the SHA-1 of the image bytes. Two copies
of the same file therefore always land in the same split — an exact duplicate
can never be both a training image and a test image, which is the most common
way a food benchmark ends up flattering itself. Near-duplicates (re-encoded or
resized copies) are caught later, in train.py, by comparing features.

Each shard is written to its own file as soon as it is done, so a crash or an
out-of-memory kill on this laptop costs one shard, not the run.
"""

from __future__ import annotations

import argparse
import hashlib
import random
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import torch

from common import WORK, Backbone, augmented, center_square, decode, iter_rows, parquet_files, to_tensor
from taxonomy import FOOD101, INDEX, class_key


def bucket(sha1: str) -> float:
    """A stable number in [0, 1) derived from the image itself."""
    return int(sha1[:8], 16) / 0x1_0000_0000


def assign(dataset: str, original_split: str, sha1: str) -> str:
    b = bucket(sha1)
    if dataset == "food101":
        if original_split == "test":
            return "test"
        return "val" if b < 0.05 else "train"
    # indian43: pooled and re-split
    if b < 0.70:
        return "train"
    if b < 0.80:
        return "val"
    return "test"


SOURCES = [
    ("indian43", "train", None),
    ("indian43", "validation", None),
    ("indian43", "test", None),
    ("food101", "test", FOOD101),
    ("food101", "train", FOOD101),
]


def prepare(data: bytes, label: str, dataset: str, split: str, train_views: int):
    """Decode one image and cut its views. Runs in a worker thread — PIL
    releases the GIL while decoding and resizing, so this overlaps inference.

    Augmentation is seeded from the image's own hash, so the views an image
    gets do not depend on which thread happened to reach it first."""
    sha1 = hashlib.sha1(data).hexdigest()
    target = assign(dataset, split, sha1)
    try:
        img = decode(data)
    except Exception:  # a corrupt file is skipped, not fatal
        return []
    y = INDEX[class_key(dataset, label)]
    out = [(center_square(img), y, target, sha1, 0)]
    if target == "train":
        rng = random.Random(sha1)
        out += [(augmented(img, rng), y, target, sha1, v) for v in range(1, train_views)]
    return out


@torch.inference_mode()
def run_shard(model, path: Path, dataset: str, split: str, names, train_views: int, out: Path, batch: int, workers: int):
    feats, labels, splits, hashes, views = [], [], [], [], []
    pending: list = []

    def flush():
        if not pending:
            return
        x = to_tensor([p[0] for p in pending])
        f = model(x).numpy().astype(np.float16)
        for (_, lab, sp, h, v), row in zip(pending, f):
            feats.append(row)
            labels.append(lab)
            splits.append(sp)
            hashes.append(h)
            views.append(v)
        pending.clear()

    # A bounded window of in-flight decodes: enough to keep the model fed,
    # never a whole 600 MB shard of decoded images in memory at once.
    window = workers * 8
    with ThreadPoolExecutor(max_workers=workers) as pool:
        inflight: deque = deque()
        for data, label in iter_rows(path, names):
            inflight.append(pool.submit(prepare, data, label, dataset, split, train_views))
            while len(inflight) >= window:
                pending.extend(inflight.popleft().result())
                if len(pending) >= batch:
                    flush()
        while inflight:
            pending.extend(inflight.popleft().result())
            if len(pending) >= batch:
                flush()
    flush()

    np.savez(
        out,
        x=np.stack(feats),
        y=np.array(labels, dtype=np.int16),
        split=np.array(splits),
        sha1=np.array(hashes),
        view=np.array(views, dtype=np.int8),
        dataset=np.array([dataset] * len(labels)),
    )
    return len(labels)


class OrtBackbone:
    """The same backbone through ONNX Runtime — usually faster on CPU than
    eager PyTorch, and the very graph the shipped model is built from."""

    def __init__(self, name: str, threads: int):
        import onnxruntime as ort

        from export import export_backbone

        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(export_backbone(name)), so, providers=["CPUExecutionProvider"])

    def __call__(self, x: torch.Tensor) -> torch.Tensor:
        return torch.from_numpy(self.sess.run(None, {"pixels": x.numpy()})[0])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backbone", default="dinov2-s")
    ap.add_argument("--train-views", type=int, default=2, help="views per Indian training image; 1 = centre crop only")
    ap.add_argument(
        "--food101-train-views",
        type=int,
        default=1,
        help="views per Food-101 training image. It has ~700 photos a class already; "
        "augmenting the Indian classes (~250 each) is where an extra view pays.",
    )
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--engine", choices=["ort", "torch"], default="ort")
    ap.add_argument("--threads", type=int, default=8, help="inference threads")
    ap.add_argument("--workers", type=int, default=4, help="image-decoding threads")
    args = ap.parse_args()

    outdir = WORK / "features" / args.backbone
    outdir.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(args.threads)
    model = OrtBackbone(args.backbone, args.threads) if args.engine == "ort" else Backbone(args.backbone)

    for dataset, split, names in SOURCES:
        for path in parquet_files(dataset, split):
            out = outdir / f"{dataset}-{path.stem}.npz"
            if out.exists():
                print("skip (done)", out.name)
                continue
            start = time.perf_counter()
            views = args.food101_train_views if dataset == "food101" else args.train_views
            n = run_shard(model, path, dataset, split, names, views, out, args.batch, args.workers)
            took = time.perf_counter() - start
            print(f"{out.name}: {n} vectors in {took:.0f}s ({n / took:.1f}/s)", flush=True)


if __name__ == "__main__":
    main()
