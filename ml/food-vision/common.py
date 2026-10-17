"""
Shared pieces of the food-vision pipeline: where data lives, how an image is
decoded and cropped, and the backbone that turns it into a feature vector.

The single most important property of this file is that **the preprocessing
here is the preprocessing the phone runs**. The browser decodes the photo
(respecting EXIF rotation), scales its shorter side to 224 and takes the centre
square; the ONNX graph then does the normalisation itself. Training on
anything else would measure a model nobody ships.
"""

from __future__ import annotations

import io
import os
import random
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import torch
from PIL import Image, ImageEnhance, ImageOps

# Data is large and never belongs in the repo (or in OneDrive). Override with
# GYMBRO_FOOD_DATA if it lives somewhere else.
DATA = Path(os.environ.get("GYMBRO_FOOD_DATA", Path.home() / ".cache" / "gymbro-food"))
RAW = DATA / "raw"
WORK = DATA / "work"

SIZE = 224
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)

BACKBONES = {
    # name: (hugging face id, number of register tokens)
    "dinov2-s": ("facebook/dinov2-small", 0),
    "dinov2-s-reg": ("facebook/dinov2-with-registers-small", 4),
    "dinov2-b": ("facebook/dinov2-base", 0),
}


# ── data ────────────────────────────────────────────────────────────────

def parquet_files(dataset: str, split: str) -> list[Path]:
    return sorted((RAW / dataset).glob(f"{split}-*.parquet"))


def iter_rows(path: Path, label_names: list[str] | None = None):
    """Yield (image bytes, label string) one row at a time, a row group at a time.

    Reading a whole 600 MB shard into memory at once is how this laptop runs
    out of RAM; a row group is a few dozen images.
    """
    f = pq.ParquetFile(path)
    for g in range(f.num_row_groups):
        t = f.read_row_group(g, columns=["image", "label"])
        images = t.column("image").to_pylist()
        labels = t.column("label").to_pylist()
        for img, lab in zip(images, labels):
            if label_names is not None and isinstance(lab, int):
                lab = label_names[lab]
            yield img["bytes"], str(lab)


def decode(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    # A 7,000 px phone photo is decoded at 1/2, 1/4 or 1/8 scale straight out
    # of the JPEG's DCT, never below twice the model's input on either side.
    # Decoding full-size only to shrink it 30x was most of the run time, and
    # at >= 2x the target the result is indistinguishable after resizing.
    if img.format == "JPEG":
        img.draft("RGB", (SIZE * 2, SIZE * 2))
    # Phones store portrait shots sideways plus an EXIF flag; browsers honour
    # the flag when decoding, so training must too.
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def center_square(img: Image.Image, size: int = SIZE) -> Image.Image:
    """Shorter side to `size`, then the centre square — exactly what the app does."""
    w, h = img.size
    s = size / min(w, h)
    nw, nh = max(size, round(w * s)), max(size, round(h * s))
    img = img.resize((nw, nh), Image.BICUBIC, reducing_gap=3.0)
    left, top = (nw - size) // 2, (nh - size) // 2
    return img.crop((left, top, left + size, top + size))


def augmented(img: Image.Image, rng: random.Random, size: int = SIZE) -> Image.Image:
    """One training view: a random crop, maybe flipped, with mild lighting changes.

    Phone photos of food are off-centre, cropped, warm-lit and badly exposed in
    ways a curated dataset is not, so the head sees some of that during
    training. The jitter is mild on purpose: colour is half of how a dish is
    recognised (dal makhani vs dal tadka), so it must not be destroyed.
    """
    w, h = img.size
    area = w * h
    for _ in range(10):
        target = area * rng.uniform(0.35, 1.0)
        ratio = np.exp(rng.uniform(np.log(3 / 4), np.log(4 / 3)))
        cw = int(round((target * ratio) ** 0.5))
        ch = int(round((target / ratio) ** 0.5))
        if 0 < cw <= w and 0 < ch <= h:
            x = rng.randint(0, w - cw)
            y = rng.randint(0, h - ch)
            img = img.crop((x, y, x + cw, y + ch))
            break
    resample = rng.choice([Image.BICUBIC, Image.BILINEAR, Image.LANCZOS])
    img = img.resize((size, size), resample)
    if rng.random() < 0.5:
        img = ImageOps.mirror(img)
    img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.8, 1.2))
    img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.85, 1.15))
    img = ImageEnhance.Color(img).enhance(rng.uniform(0.85, 1.15))
    return img


def to_tensor(imgs: list[Image.Image]) -> torch.Tensor:
    """uint8 HWC images -> float NCHW in 0..255. Normalisation lives in the model."""
    arr = np.stack([np.asarray(i, dtype=np.uint8) for i in imgs])
    return torch.from_numpy(arr).permute(0, 3, 1, 2).float()


# ── model ───────────────────────────────────────────────────────────────

class Backbone(torch.nn.Module):
    """Pixels (0..255) -> [CLS token ‖ mean of patch tokens].

    Concatenating the class token with the averaged patch tokens is the
    DINOv2 paper's own linear-evaluation recipe: the CLS token summarises the
    image, the patch average keeps texture and colour that a single token
    compresses away — which for telling one curry from another matters.
    """

    def __init__(self, name: str):
        super().__init__()
        from transformers import AutoModel

        hf_id, registers = BACKBONES[name]
        self.name = name
        self.registers = registers
        self.model = AutoModel.from_pretrained(hf_id)
        self.model.eval()
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1) * 255)
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1) * 255)

    @property
    def dim(self) -> int:
        return self.model.config.hidden_size * 2

    def forward(self, pixels: torch.Tensor) -> torch.Tensor:
        x = (pixels - self.mean) / self.std
        h = self.model(pixel_values=x).last_hidden_state
        cls = h[:, 0]
        patches = h[:, 1 + self.registers :]
        return torch.cat([cls, patches.mean(dim=1)], dim=1)
