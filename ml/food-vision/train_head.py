"""
Stage 2: train the classification head on frozen features, choose it on the
validation split, and calibrate it.

    python train_head.py --backbone dinov2-s

What "honest" means here, concretely:

1. **Leakage.** Exact duplicates were already kept on one side of the split by
   extract.py. This script also drops any validation or test image whose
   nearest training image is a near-copy (cosine >= --dup-threshold on the
   backbone's features) and reports how many it dropped. Food datasets scraped
   from the web are full of the same photo at three resolutions.
2. **Selection.** Every choice — linear vs MLP, weight decay, learning rate —
   is made on validation. The test split is not opened by this script at all;
   evaluate.py reads it once, at the end, through the exported ONNX model.
3. **Calibration.** The app shows confidence and decides when to say "not
   sure", so a 0.9 has to mean roughly 90%. A single temperature is fitted on
   validation (Guo et al., 2017) and baked into the exported model.
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import time
from collections import Counter

import numpy as np
import torch
import torch.nn.functional as F

from common import WORK
from taxonomy import CLASSES


# ── data ────────────────────────────────────────────────────────────────

def load(backbone: str):
    files = sorted((WORK / "features" / backbone).glob("*.npz"))
    if not files:
        raise SystemExit(f"no features for {backbone} — run extract.py first")
    parts = [np.load(f) for f in files]
    cat = lambda k: np.concatenate([p[k] for p in parts])  # noqa: E731
    return {k: cat(k) for k in ("x", "y", "split", "sha1", "view", "dataset")}


def clean(d, dup_threshold: float):
    report = {}

    # An image that appears under two different labels is a labelling error in
    # one dataset or the other; neither label can be trusted, so both go.
    labels_by_hash: dict[str, set] = {}
    for h, y in zip(d["sha1"], d["y"]):
        labels_by_hash.setdefault(h, set()).add(int(y))
    conflicted = {h for h, ys in labels_by_hash.items() if len(ys) > 1}
    keep = np.array([h not in conflicted for h in d["sha1"]])
    report["label_conflicts_dropped"] = len(conflicted)

    # The same file twice in one split adds weight, not information.
    seen = set()
    for i, (h, sp, v) in enumerate(zip(d["sha1"], d["split"], d["view"])):
        key = (h, sp, int(v))
        if key in seen:
            keep[i] = False
        seen.add(key)
    report["exact_duplicates_dropped"] = int((~keep).sum()) - report["label_conflicts_dropped"]

    d = {k: v[keep] for k, v in d.items()}

    # Near-duplicates: held-out images that are visually a copy of a training
    # image. Compared on centre-crop features, chunked to stay inside RAM.
    train_c = (d["split"] == "train") & (d["view"] == 0)
    bank = torch.from_numpy(d["x"][train_c].astype(np.float32))
    bank = F.normalize(bank, dim=1)
    drop = np.zeros(len(d["y"]), dtype=bool)
    for split in ("val", "test"):
        idx = np.where(d["split"] == split)[0]
        hits = 0
        for start in range(0, len(idx), 2048):
            chunk = idx[start : start + 2048]
            q = F.normalize(torch.from_numpy(d["x"][chunk].astype(np.float32)), dim=1)
            sim = (q @ bank.T).max(dim=1).values.numpy()
            near = sim >= dup_threshold
            drop[chunk[near]] = True
            hits += int(near.sum())
        report[f"{split}_near_duplicates_of_train_dropped"] = hits
    # evaluate.py reads raw images, not these arrays, so it needs the list of
    # what was excluded to evaluate on exactly the same test set.
    excluded = sorted(conflicted | set(d["sha1"][drop & (d["split"] == "test")].tolist()))
    d = {k: v[~drop] for k, v in d.items()}
    return d, report, excluded


# ── model ───────────────────────────────────────────────────────────────

class Head(torch.nn.Module):
    """Standardise -> (MLP | linear) -> logits. The standardisation statistics
    are buffers, so they travel into the ONNX graph with the weights."""

    def __init__(self, dim: int, classes: int, hidden: int, dropout: float, mean, std):
        super().__init__()
        self.register_buffer("mu", torch.as_tensor(mean, dtype=torch.float32))
        self.register_buffer("sigma", torch.as_tensor(std, dtype=torch.float32))
        if hidden:
            self.net = torch.nn.Sequential(
                torch.nn.Dropout(dropout),
                torch.nn.Linear(dim, hidden),
                torch.nn.GELU(),
                torch.nn.Dropout(dropout),
                torch.nn.Linear(hidden, classes),
            )
        else:
            self.net = torch.nn.Sequential(torch.nn.Dropout(dropout), torch.nn.Linear(dim, classes))

    def forward(self, f):
        return self.net((f - self.mu) / self.sigma)


def train_one(xtr, ytr, weights, cfg, dim, classes, mean, std, seed=0):
    torch.manual_seed(seed)
    head = Head(dim, classes, cfg["hidden"], cfg["dropout"], mean, std)
    opt = torch.optim.AdamW(head.parameters(), lr=cfg["lr"], weight_decay=cfg["wd"])
    steps_per_epoch = math.ceil(len(ytr) / cfg["batch"])
    total = steps_per_epoch * cfg["epochs"]
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=cfg["lr"], total_steps=total, pct_start=0.1)
    sampler = torch.utils.data.WeightedRandomSampler(weights, num_samples=len(ytr), replacement=True)
    head.train()
    for _ in range(cfg["epochs"]):
        order = torch.tensor(list(sampler))
        for s in range(steps_per_epoch):
            b = order[s * cfg["batch"] : (s + 1) * cfg["batch"]]
            loss = F.cross_entropy(head(xtr[b]), ytr[b], label_smoothing=cfg["smoothing"])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
    head.eval()
    return head


@torch.inference_mode()
def logits_of(head, x):
    return torch.cat([head(x[i : i + 8192]) for i in range(0, len(x), 8192)])


def accuracy(logits, y, mask=None):
    if mask is not None:
        logits, y = logits[mask], y[mask]
    if len(y) == 0:
        return None
    top5 = logits.topk(5, dim=1).indices
    return {
        "n": int(len(y)),
        "top1": float((top5[:, 0] == y).float().mean()),
        "top5": float((top5 == y[:, None]).any(1).float().mean()),
    }


def macro_top1(logits, y):
    pred = logits.argmax(1)
    per = [float((pred[y == c] == c).float().mean()) for c in torch.unique(y)]
    return float(np.mean(per))


def fit_temperature(logits, y):
    """One scalar T minimising validation NLL. Accuracy is unchanged by it."""
    # The logits come out of inference mode, which autograd refuses to touch.
    logits, y = logits.clone(), y.clone()
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200)

    def closure():
        opt.zero_grad()
        loss = F.cross_entropy(logits / log_t.exp(), y)
        loss.backward()
        return loss

    opt.step(closure)
    return float(log_t.exp())


def confident_threshold(logits, y, target: float = 0.90) -> float:
    """The lowest calibrated confidence at which the top answer is right at
    least `target` of the time on validation. The app leads with a single
    answer above it and shows a shortlist below it — so "it said samosa" means
    "it is right about samosa nine times in ten", by measurement."""
    prob = logits.softmax(1)
    conf, pred = prob.max(1)
    hit = (pred == y).float()
    for t in [x / 100 for x in range(20, 96, 5)]:
        m = conf >= t
        if m.sum() >= 50 and float(hit[m].mean()) >= target:
            return t
    return 0.95


def ece(logits, y, bins=15):
    prob = logits.softmax(1)
    conf, pred = prob.max(1)
    edges = torch.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += float(m.float().mean()) * abs(float((pred[m] == y[m]).float().mean()) - float(conf[m].mean()))
    return total


# ── main ────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backbone", default="dinov2-s")
    ap.add_argument("--dup-threshold", type=float, default=0.97)
    ap.add_argument("--quick", action="store_true", help="tiny search, for smoke tests")
    args = ap.parse_args()
    torch.set_num_threads(10)

    d, report, excluded = clean(load(args.backbone), args.dup_threshold)
    print(json.dumps(report))

    x = torch.from_numpy(d["x"].astype(np.float32))
    y = torch.from_numpy(d["y"].astype(np.int64))
    tr = torch.from_numpy(d["split"] == "train")
    va = torch.from_numpy((d["split"] == "val") & (d["view"] == 0))
    va_indian_ds = torch.from_numpy(d["dataset"] == "indian43") & va

    xtr, ytr = x[tr], y[tr]
    xva, yva = x[va], y[va]
    mean, std = xtr.mean(0), xtr.std(0).clamp_min(1e-4)

    # Class-balanced sampling, softened: a class is drawn in proportion to the
    # square root of its size. Full balancing over-samples the Indian classes
    # with ~60 photos until the head memorises them; none under-serves them.
    counts = Counter(ytr.tolist())
    weights = torch.tensor([counts[int(c)] ** -0.5 for c in ytr], dtype=torch.double)

    base = {"batch": 1024, "epochs": 30, "smoothing": 0.1}
    grid = {
        "hidden": [0, 1024],
        "dropout": [0.2],
        "lr": [1e-3, 3e-3],
        "wd": [1e-4, 1e-2, 5e-2],
    }
    if args.quick:
        grid = {"hidden": [0], "dropout": [0.2], "lr": [3e-3], "wd": [1e-3]}
        base["epochs"] = 3

    trials = []
    for values in itertools.product(*grid.values()):
        cfg = {**base, **dict(zip(grid, values))}
        start = time.perf_counter()
        head = train_one(xtr, ytr, weights, cfg, x.shape[1], len(CLASSES), mean, std)
        lv = logits_of(head, xva)
        res = {
            "cfg": cfg,
            "val": accuracy(lv, yva),
            "val_macro_top1": macro_top1(lv, yva),
            "val_indian_dataset": accuracy(logits_of(head, x[va_indian_ds]), y[va_indian_ds]),
            "seconds": round(time.perf_counter() - start, 1),
        }
        trials.append((res, head))
        print(json.dumps({k: v for k, v in res.items()}), flush=True)

    # Choose on the average of overall and macro top-1, so a config that wins
    # by being good at the 101 big Western classes and poor at the small Indian
    # ones does not win.
    score = lambda r: (r["val"]["top1"] + r["val_macro_top1"]) / 2  # noqa: E731
    best, head = max(trials, key=lambda t: score(t[0]))

    lv = logits_of(head, xva)
    t = fit_temperature(lv, yva)
    best["temperature"] = t
    best["val_ece_before"] = ece(lv, yva)
    best["val_ece_after"] = ece(lv / t, yva)
    best["confident_at"] = confident_threshold(lv / t, yva)
    print("chosen:", json.dumps(best))

    out = WORK / "heads" / args.backbone
    out.mkdir(parents=True, exist_ok=True)
    torch.save({"state": head.state_dict(), "cfg": best["cfg"], "dim": x.shape[1], "temperature": t}, out / "head.pt")
    (out / "excluded_test_sha1.json").write_text(json.dumps(excluded))
    (out / "selection.json").write_text(
        json.dumps(
            {
                "backbone": args.backbone,
                "classes": len(CLASSES),
                "train_vectors": int(tr.sum()),
                "train_images": int(((d["split"] == "train") & (d["view"] == 0)).sum()),
                "val_images": int(va.sum()),
                "cleaning": report,
                "chosen": best,
                "trials": [r for r, _ in trials],
            },
            indent=2,
        )
    )
    print("wrote", out)


if __name__ == "__main__":
    main()
