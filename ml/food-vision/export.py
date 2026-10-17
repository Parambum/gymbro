"""
Stage 3: one ONNX file the phone runs — backbone, head, temperature, softmax.

    python export.py --backbone dinov2-s

Input  "pixels": float32 [N, 3, 224, 224], values 0..255, RGB, centre square.
Output "probs":  float32 [N, C], calibrated class probabilities.

Normalisation, the head's feature standardisation and the calibration
temperature are all inside the graph, so the browser does nothing but
resize-and-crop. Anything the app had to reimplement in JavaScript would be a
second place for the numbers to drift.

Weights are then quantised to int8 (MatMul/Gemm only — see quantize()), which
is what the phone downloads. evaluate.py measures that file, not this one.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from common import WORK, Backbone
from taxonomy import CLASSES
from train_head import Head

HERE = Path(__file__).resolve().parent


def quantize(src: Path, dst: Path) -> None:
    """int8 weights for MatMul/Gemm only. The patch-embedding convolution would
    become a ConvInteger, which onnxruntime's CPU kernels — and so the
    browser's WASM build — support only for uint8 weights; it is 0.2M of 22M
    parameters, so leaving it in float costs nothing worth measuring."""
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.quantization.shape_inference import quant_pre_process

    # onnxruntime's recommended clean-up first (shape inference + graph
    # optimisation), so quantisation sees fused ops. Optional: if it cannot
    # handle the graph, quantise the export as-is.
    prepped = src.with_name(src.stem + "-prepped.onnx")
    try:
        quant_pre_process(str(src), str(prepped))
        src = prepped
    except Exception as err:  # noqa: BLE001
        print("pre-processing skipped:", err)

    quantize_dynamic(
        str(src),
        str(dst),
        op_types_to_quantize=["MatMul", "Gemm"],
        weight_type=QuantType.QInt8,
        per_channel=True,
    )


class Shipped(torch.nn.Module):
    def __init__(self, backbone: Backbone, head: Head, temperature: float):
        super().__init__()
        self.backbone = backbone
        self.head = head
        self.register_buffer("t", torch.tensor(float(temperature)))

    def forward(self, pixels):
        return (self.head(self.backbone(pixels)) / self.t).softmax(dim=1)


def bake_position_embeddings(backbone: Backbone, size: int = 224) -> None:
    """DINOv2 was trained at 518 px and interpolates its position table for any
    other size on every forward pass. At a fixed 224 that interpolation is a
    constant, so compute it once — with the very function training used — and
    keep the bicubic resize out of the graph."""
    emb = backbone.model.embeddings
    tokens = (size // emb.patch_size) ** 2 + 1
    with torch.no_grad():
        dummy = torch.zeros(1, tokens, emb.position_embeddings.shape[-1])
        pos = emb.interpolate_pos_encoding(dummy, size, size).detach().clone()
    emb.interpolate_pos_encoding = lambda embeddings, height, width: pos


def export_backbone(name: str) -> Path:
    """The backbone alone (pixels -> features) as fp32 ONNX, for extract.py's
    ONNX Runtime engine. Same graph the shipped model starts with."""
    out = WORK / "export" / f"backbone-{name}.onnx"
    if out.exists():
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    backbone = Backbone(name).eval()
    bake_position_embeddings(backbone)
    dummy = torch.zeros(1, 3, 224, 224)
    torch.onnx.export(
        backbone,
        (dummy,),
        str(out),
        input_names=["pixels"],
        output_names=["features"],
        dynamic_axes={"pixels": {0: "n"}, "features": {0: "n"}},
        opset_version=17,
        dynamo=False,
    )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backbone", default="dinov2-s")
    ap.add_argument("--parity-images", type=int, default=300)
    args = ap.parse_args()

    saved = torch.load(WORK / "heads" / args.backbone / "head.pt", weights_only=False)
    cfg = saved["cfg"]
    head = Head(saved["dim"], len(CLASSES), cfg["hidden"], cfg["dropout"], torch.zeros(saved["dim"]), torch.ones(saved["dim"]))
    head.load_state_dict(saved["state"])
    head.eval()

    backbone = Backbone(args.backbone)
    reference = Shipped(backbone, head, saved["temperature"]).eval()

    # Reference output before the position table is baked, to prove baking
    # changed nothing.
    rng = np.random.default_rng(0)
    probe = torch.from_numpy(rng.uniform(0, 255, size=(4, 3, 224, 224)).astype(np.float32))
    with torch.no_grad():
        before = reference(probe).numpy()

    bake_position_embeddings(backbone)
    with torch.no_grad():
        after = reference(probe).numpy()
    assert np.abs(before - after).max() < 1e-5, "baking the position table changed the output"

    out = WORK / "export" / args.backbone
    out.mkdir(parents=True, exist_ok=True)
    fp32 = out / "food-fp32.onnx"
    torch.onnx.export(
        reference,
        (probe[:1],),
        str(fp32),
        input_names=["pixels"],
        output_names=["probs"],
        dynamic_axes={"pixels": {0: "n"}, "probs": {0: "n"}},
        opset_version=17,
        dynamo=False,
    )

    sess = ort.InferenceSession(str(fp32), providers=["CPUExecutionProvider"])
    got = sess.run(None, {"pixels": probe.numpy()})[0]
    print("fp32 onnx vs torch, max abs diff:", float(np.abs(got - after).max()))

    int8 = out / "food-int8.onnx"
    quantize(fp32, int8)
    parity = quantization_parity(fp32, int8, args.parity_images)
    print("int8 vs fp32 on validation:", json.dumps(parity))
    if parity["top1_agreement"] < 0.98:
        print("WARNING: int8 disagrees with fp32 on more than 2% of validation photos")
    (out / "export.json").write_text(
        json.dumps(
            {
                "backbone": args.backbone,
                "classes": CLASSES,
                "temperature": saved["temperature"],
                "fp32_bytes": fp32.stat().st_size,
                "int8_bytes": int8.stat().st_size,
                "int8_vs_fp32_validation": parity,
            },
            indent=2,
        )
    )
    print("fp32", fp32.stat().st_size // 1_000_000, "MB; int8", int8.stat().st_size // 1_000_000, "MB")


def quantization_parity(fp32: Path, int8: Path, n: int) -> dict:
    """How much does int8 change the answer? Measured on *validation* photos,
    so the decision to ship int8 is made before the test split is opened."""
    import hashlib

    from common import center_square, decode, iter_rows, parquet_files
    from extract import SOURCES, assign

    crops = []
    for dataset, split, names in SOURCES:
        for path in parquet_files(dataset, split):
            for data, _ in iter_rows(path, names):
                if assign(dataset, split, hashlib.sha1(data).hexdigest()) == "val":
                    crops.append(np.asarray(center_square(decode(data)), dtype=np.float32))
                if len(crops) >= n:
                    break
            if len(crops) >= n:
                break
        if len(crops) >= n:
            break
    x = np.stack(crops).transpose(0, 3, 1, 2).copy()
    a = ort.InferenceSession(str(fp32), providers=["CPUExecutionProvider"])
    b = ort.InferenceSession(str(int8), providers=["CPUExecutionProvider"])
    pa = np.concatenate([a.run(None, {"pixels": x[i : i + 32]})[0] for i in range(0, len(x), 32)])
    pb = np.concatenate([b.run(None, {"pixels": x[i : i + 32]})[0] for i in range(0, len(x), 32)])
    return {
        "images": len(x),
        "top1_agreement": float((pa.argmax(1) == pb.argmax(1)).mean()),
        "mean_abs_prob_diff_top1": float(np.abs(pa.max(1) - pb[np.arange(len(pb)), pa.argmax(1)]).mean()),
    }


if __name__ == "__main__":
    main()
