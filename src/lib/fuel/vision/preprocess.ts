/**
 * Photo -> model input, done exactly the way training did it.
 *
 * ml/food-vision/common.py scales the shorter side to 224 and keeps the
 * centre square; the ONNX graph normalises internally and wants raw 0–255
 * RGB, channel-planar. If this file and that one ever disagree, the model
 * quietly gets worse on the phone than its report says, so the arithmetic is
 * kept here as pure functions with tests rather than inline in a component.
 */

export const INPUT_SIZE = 224;

/** The centred square of a w×h image, as a source rectangle for drawImage. */
export function centreSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/**
 * RGBA bytes (what a canvas hands back) -> float32 [3, size, size] in 0..255.
 * Alpha is dropped: a phone photo has none, and a PNG with transparency is
 * composited onto black by the canvas, which is what PIL's convert("RGB")
 * does too.
 */
export function rgbaToPlanar(rgba: Uint8ClampedArray | Uint8Array, size = INPUT_SIZE): Float32Array {
  const plane = size * size;
  if (rgba.length !== plane * 4) {
    throw new Error(`expected ${plane * 4} bytes, got ${rgba.length}`);
  }
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    out[i] = rgba[i * 4];
    out[plane + i] = rgba[i * 4 + 1];
    out[2 * plane + i] = rgba[i * 4 + 2];
  }
  return out;
}

type Drawable = ImageBitmap | HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

function sizeOf(src: Drawable): { w: number; h: number } {
  if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement) {
    return { w: src.videoWidth, h: src.videoHeight };
  }
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) {
    return { w: src.naturalWidth, h: src.naturalHeight };
  }
  return { w: (src as ImageBitmap).width, h: (src as ImageBitmap).height };
}

/**
 * Draw the centre square of any image source into a 224×224 canvas and read
 * it back as model input. Also returns the canvas, so the result card can show
 * the user exactly what the model looked at.
 */
export function pixelsFrom(src: Drawable): { pixels: Float32Array; canvas: HTMLCanvasElement } {
  const { w, h } = sizeOf(src);
  if (!w || !h) throw new Error("image has no size yet");
  const { sx, sy, side } = centreSquare(w, h);

  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, side, side, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  return { pixels: rgbaToPlanar(data), canvas };
}

/**
 * Decode a picked or captured file. `imageOrientation: "from-image"` applies
 * the EXIF rotation phones write instead of rotating pixels — training applied
 * it too (ImageOps.exif_transpose), so a portrait photo is upright for both.
 */
export async function bitmapFromFile(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}
