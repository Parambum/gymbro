# Food vision — the Snap-a-meal model

A food classifier that runs **on the phone**: no API key, no per-photo cost,
the photo never leaves the device, and it works offline after a one-time
download. The app gets a dish name and a calibrated confidence; nutrition
comes from published composition data (USDA FNDDS, INDB) via
`scripts/fuel/vision-classes.mjs`, never from the model.

Results for the shipped model are in [`reports/REPORT.md`](reports/REPORT.md)
and `reports/metrics.json`.

## How it works

```
photo ──► centre square, 224 px ──► DINOv2 ViT-S/14 (frozen) ──► [CLS ‖ mean patch]
      ──► standardise ──► trained head ──► ÷ temperature ──► softmax ──► 139 dishes
```

Everything after the crop is one ONNX graph, int8-quantised, run by
`onnxruntime-web` (WebAssembly) in a Web Worker
(`src/lib/fuel/vision/food-model.worker.ts`).

**Why a frozen backbone and a trained head.** This was built on a laptop CPU.
Fine-tuning a ViT end to end needs a GPU; DINOv2's frozen features are among
the strongest available for fine-grained recognition, and a well-tuned head on
them is within a few points of full fine-tuning at a fraction of the cost.

**Why DINOv2-S.** Measured, not assumed (`benchmark_backbones.py`, same
images and probe for each):

| backbone | params | CPU ms/img | top-1 | top-5 |
|---|---|---|---|---|
| DINOv2-S | 22 M | 94 | 87.5% | 97.3% |
| DINOv2-S + registers | 22 M | 95 | 87.9% | 96.9% |
| DINOv2-B | 87 M | 293 | 90.2% | 98.3% |

54 classes, 40 training photos each. DINOv2-B is 2.7 points better for a 4×
bigger download and 3× slower inference on a phone; S + registers is
indistinguishable from S. MobileCLIP was ruled out on licence (Apple
research-only weights).

## Data

| dataset | classes | photos | licence |
|---|---|---|---|
| Food-101 (`ethz/food101`) | 101 | 101,000 | research distribution |
| Enhanced Indian Food (`kidKrish/enhanced-indian-food-classification`) | 43 | 15,404 | CC BY 4.0 |

Five dishes appear in both (burger, pizza, samosa, fried rice, chicken curry)
and are merged (`taxonomy.py`), leaving **139 classes**.

**Splits.** Food-101 keeps its official, hand-cleaned 25,250-image test set;
5% of its training set is validation. The Indian set only ships test images
for 22 of its 43 classes, so it is pooled and re-split 70/10/20. Every split
decision is a hash of the image bytes, so an exact duplicate can never be on
both sides; `train_head.py` additionally drops any validation/test image whose
nearest training image is a near-copy (cosine ≥ 0.97) and reports how many.

**The test split is read exactly once**, by `evaluate.py`, through the int8
file the app ships. Model and hyperparameter choices are made on validation.

## Running it

Needs ~8 GB free disk and a few hours of CPU. Uses its own virtualenv: `onnx`
needs protobuf ≥ 6, which conflicts with tools commonly installed globally.

```bash
python -m venv ~/.cache/gymbro-food/mlenv
~/.cache/gymbro-food/mlenv/Scripts/python -m pip install -r requirements.txt
```

Download the datasets as parquet into `~/.cache/gymbro-food/raw/`
(`food101/{train,test}-N.parquet`, `indian43/{train,validation,test}-N.parquet`)
from the Hugging Face parquet export of each dataset. Then, in order:

```bash
python extract.py --backbone dinov2-s --train-views 2   # features, resumable per shard
python train_head.py --backbone dinov2-s               # head + temperature + threshold, on validation
python export.py --backbone dinov2-s                   # one ONNX graph, int8
python evaluate.py --backbone dinov2-s                 # test split, once
python publish.py --backbone dinov2-s                  # -> public/models/food-v1/
npm run fuel:vision:classes                            # class -> food table, checked against it
```

`GYMBRO_FOOD_DATA` moves the data directory.

## Adding dishes

1. Add photos as a new dataset (or new labels) and extend `taxonomy.py`.
2. Map each new class to foods in `scripts/fuel/vision-classes.mjs` — an
   empty `items` list is allowed and means "recognise it, then send the user
   to search", which is better than a made-up number.
3. Re-run the pipeline and bump the folder to `food-v2` (and the cache name in
   `classifier.ts` and `public/sw.js`), so phones fetch the new file.

Photo logs record which model version predicted what (`visionModel`,
`visionClass`) and whether the user changed it — that table is the list of
dishes the next model most needs to learn.
