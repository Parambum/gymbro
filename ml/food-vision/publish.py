"""
Stage 5: put the evaluated model where the app serves it.

    python publish.py --backbone dinov2-s

Copies the int8 ONNX file that evaluate.py measured into
public/models/food-v1/food.onnx, and writes model.json next to it: the class
order the output vector uses, the confidence threshold chosen on validation,
and the headline test numbers the app quotes to users. The app reads nothing
about the model from anywhere else, so what it claims is always what was
measured for the file it downloads.

Then run `npm run fuel:vision:classes` so the class -> food table is checked
against this exact class list.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import shutil
from pathlib import Path

from common import SIZE, WORK

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent.parent / "public" / "models" / "food-v1"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backbone", default="dinov2-s")
    args = ap.parse_args()

    export = WORK / "export" / args.backbone
    model = export / "food-int8.onnx"
    exported = json.loads((export / "export.json").read_text())
    metrics = json.loads((HERE / "reports" / "metrics.json").read_text())
    if metrics["model_bytes"] != model.stat().st_size:
        raise SystemExit("reports/metrics.json was measured on a different file — run evaluate.py again")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(model, PUBLIC / "food.onnx")
    digest = hashlib.sha256((PUBLIC / "food.onnx").read_bytes()).hexdigest()[:12]

    t = metrics["test"]
    shipped = metrics["at_shipped_threshold"]
    meta = {
        "version": f"food-v1-{args.backbone}-{digest}",
        "builtAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "backbone": args.backbone,
        "classes": exported["classes"],
        "inputSize": SIZE,
        "bytes": model.stat().st_size,
        "confidentAt": shipped["threshold"],
        "metrics": {
            "testImages": t["all"]["n"],
            "top1": round(t["all"]["top1"], 4),
            "top5": round(t["all"]["top5"], 4),
            "food101Top1": round(t["food101_official_test"]["top1"], 4),
            "indianTop1": round(t["indian_holdout"]["top1"], 4),
            "precisionWhenConfident": round(shipped["top1_when_confident"], 4),
            "coverageWhenConfident": round(shipped["coverage"], 4),
            "ece": round(metrics["calibration"]["ece"], 4),
        },
    }
    (PUBLIC / "model.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta["metrics"], indent=2))
    print("published", PUBLIC / "food.onnx", f"({meta['bytes'] / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
