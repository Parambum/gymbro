/**
 * One embedding worker for build-kb.ts:
 *
 *   tsx scripts/coach/embed-shard.ts <in.json> <out.f32>
 *
 * Reads a JSON array of passage texts, embeds each one ON ITS OWN, and writes
 * the vectors as little-endian float32, in order. build-kb runs several of
 * these side by side because onnxruntime-web runs on one core under Node.
 *
 * One text per forward pass is deliberate: the model is int8 with dynamic
 * quantisation, whose scale is computed over the whole input tensor, so padding
 * a batch shifts every vector in it slightly (cosine ≈ 0.997 against the same
 * text alone). Questions are always embedded alone, so passages must be too.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { EMBED_DIM, embed } from "../../src/lib/coach/rag/embedder";

async function main() {
  const [input, output] = process.argv.slice(2);
  const texts = JSON.parse(readFileSync(input, "utf8")) as string[];
  const out = Buffer.alloc(texts.length * EMBED_DIM * 4);
  for (let i = 0; i < texts.length; i++) {
    const v = await embed(texts[i], "passage");
    for (let k = 0; k < EMBED_DIM; k++) out.writeFloatLE(v[k], (i * EMBED_DIM + k) * 4);
    if ((i + 1) % 50 === 0 || i + 1 === texts.length) process.stdout.write(`progress ${i + 1}\n`);
  }
  writeFileSync(output, out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
