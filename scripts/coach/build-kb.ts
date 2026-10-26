/**
 * Build the coach's research library.
 *
 *   npm run coach:kb                 fetch (cached), verify licences, chunk, embed, write
 *   npm run coach:kb -- --refetch    ignore the XML cache and download again
 *   npm run coach:kb -- --workers=4  embedding processes in parallel (default 3)
 *
 * For each PMCID in scripts/coach/sources.json:
 *
 *   1. Download the full text as JATS XML from Europe PMC (no key, no account).
 *   2. Check the licence TWICE — the <license> element in the article itself,
 *      and Europe PMC's own licence metadata — and stop the build unless both
 *      say CC BY or CC0. One source of truth would be one typo away from
 *      quoting a non-commercial paper inside a commercial app.
 *   3. Keep the abstract and body prose; drop methods, tables, figures and
 *      citation markers (see SKIP_SECTION in src/lib/coach/rag/jats.ts).
 *   4. Cut passages, split sentences, and embed both with the same in-process
 *      model the app uses to embed questions — so a passage and a question are
 *      always measured by one ruler.
 *
 * Writes src/lib/data/coach-kb.json, coach-kb.bin and COACH-SOURCES.md.
 * Downloads are cached outside OneDrive in ~/.cache/gymbro-coach/xml.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { acceptedLicence, readArticle, type Article } from "../../src/lib/coach/rag/jats";
import { chunkParagraphs } from "../../src/lib/coach/rag/chunk";
import { EMBED_DIM, EMBED_MODEL_ID, tokenCounter } from "../../src/lib/coach/rag/embedder";
import {
  KB_BIN,
  KB_FORMAT_VERSION,
  KB_JSON,
  decodeKnowledgeBase,
  encodeVectors,
  type KbFile,
  type KbPassage,
  type KbSource,
} from "../../src/lib/coach/rag/store";

const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const CACHE = path.join(homedir(), ".cache", "gymbro-coach", "xml");
const refetch = process.argv.includes("--refetch");
/**
 * Embedding processes to run side by side. Each holds its own copy of the
 * model (~200 MB resident); 3 fits beside a browser on a 16 GB laptop.
 */
const workers = Math.max(1, Number(process.argv.find((a) => a.startsWith("--workers="))?.split("=")[1] ?? 3) || 3);

interface Manifest {
  sources: Array<{ pmcid: string; covers: string }>;
}

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "gymbro-coach-kb/1.0 (build script)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function articleXml(pmcid: string): Promise<string> {
  const file = path.join(CACHE, `${pmcid}.xml`);
  if (!refetch && existsSync(file)) return readFileSync(file, "utf8");
  const xml = await fetchText(`${EPMC}/${pmcid}/fullTextXML`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, xml);
  return xml;
}

/** Europe PMC's licence field for one article: "cc by", "cc by-nc", … or null. */
async function metadataLicence(pmcid: string): Promise<string | null> {
  const url = `${EPMC}/search?format=json&resultType=core&query=${encodeURIComponent(`PMCID:${pmcid}`)}`;
  const body = JSON.parse(await fetchText(url)) as { resultList?: { result?: Array<{ license?: string }> } };
  return body.resultList?.result?.[0]?.license?.toLowerCase() ?? null;
}

function licenceLabel(url: string, kind: "cc-by" | "cc0"): string {
  if (kind === "cc0") return "CC0 1.0";
  const v = url.match(/\/by\/(\d\.\d)/)?.[1];
  return v ? `CC BY ${v}` : "CC BY";
}

function authorLine(authors: string[]): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

async function main() {
  const manifest = JSON.parse(readFileSync("scripts/coach/sources.json", "utf8")) as Manifest;
  const countTokens = await tokenCounter();

  const sources: KbSource[] = [];
  const passages: KbPassage[] = [];
  const embedTexts: string[] = [];
  const problems: string[] = [];

  for (const { pmcid } of manifest.sources) {
    let article: Article;
    try {
      article = readArticle(await articleXml(pmcid));
    } catch (err) {
      problems.push(`${pmcid}: could not read article — ${(err as Error).message}`);
      continue;
    }

    const fromXml = acceptedLicence(article.licenseUrl, article.licenseText);
    const fromMeta = await metadataLicence(pmcid);
    const metaOk = fromMeta === "cc by" || fromMeta === "cc0";
    if (!fromXml || !metaOk) {
      problems.push(
        `${pmcid}: licence refused — article says ${article.licenseUrl ?? JSON.stringify(article.licenseText.slice(0, 80))}, Europe PMC says ${fromMeta ?? "nothing"}`,
      );
      continue;
    }

    const chunks = chunkParagraphs(article.paragraphs, countTokens);
    if (chunks.length === 0) {
      problems.push(`${pmcid}: no usable prose (abstract-only or empty body)`);
      continue;
    }

    const sourceIndex = sources.length;
    const licenseUrl = article.licenseUrl ?? "https://creativecommons.org/licenses/by/4.0/";
    sources.push({
      id: pmcid,
      title: article.title,
      authors: authorLine(article.authors),
      journal: article.journal,
      year: article.year,
      doi: article.doi,
      url: `https://europepmc.org/article/PMC/${pmcid}`,
      license: licenceLabel(licenseUrl, fromXml),
      licenseUrl,
    });

    for (const c of chunks) {
      const section = c.section.join(" › ");
      passages.push({ source: sourceIndex, section, sentences: c.sentences });
      // Title and section ride along in the passage embedding: "Results" alone
      // is meaningless, "creatine position stand › Results" is a topic.
      embedTexts.push(`${article.title}. ${section ? `${section}. ` : ""}${c.text}`);
    }

    console.log(
      `${pmcid}  ${String(chunks.length).padStart(3)} passages  ${sources[sourceIndex].license.padEnd(9)} ${article.title.slice(0, 70)}`,
    );
    if (article.skippedSections.length > 0) {
      console.log(`           skipped: ${[...new Set(article.skippedSections)].join(" | ").slice(0, 300)}`);
    }
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} source(s) failed:\n  ${problems.join("\n  ")}`);
    console.error("\nFix or remove them in scripts/coach/sources.json. Nothing was written.");
    process.exit(1);
  }

  // ── embed (only what the previous build did not already embed) ─────
  const sentenceTexts = passages.flatMap((p) => p.sentences);
  const allTexts = [...embedTexts, ...sentenceTexts];
  const previous = refetch ? new Map<string, Float32Array>() : previousVectors();
  const todo = [...new Set(allTexts.filter((t) => !previous.has(t)))];
  console.log(
    `\n${allTexts.length - allTexts.filter((t) => !previous.has(t)).length} of ${allTexts.length} texts unchanged since the last build; embedding ${todo.length} on ${workers} worker(s)…`,
  );
  const fresh = todo.length > 0 ? await embedParallel(todo, Math.min(workers, todo.length)) : [];
  todo.forEach((t, i) => previous.set(t, fresh[i]));
  const passageVectors = embedTexts.map((t) => previous.get(t)!);
  const sentenceVectors = sentenceTexts.map((t) => previous.get(t)!);

  // ── write ──────────────────────────────────────────────────────────
  const file: KbFile = {
    version: KB_FORMAT_VERSION,
    builtAt: new Date().toISOString(),
    model: EMBED_MODEL_ID,
    dim: EMBED_DIM,
    sources,
    passages,
    sentenceCount: sentenceTexts.length,
  };
  writeFileSync(KB_JSON, JSON.stringify(file));
  writeFileSync(KB_BIN, encodeVectors(passageVectors, sentenceVectors, EMBED_DIM));
  writeFileSync(path.join(path.dirname(KB_JSON), "COACH-SOURCES.md"), sourcesMarkdown(sources, passages));

  console.log(`wrote ${sources.length} sources, ${passages.length} passages, ${sentenceTexts.length} sentences`);
}

/**
 * Vectors from the library already on disk, keyed by the exact text embedded.
 *
 * Reusing them is exact, not approximate: passage vectors are stored as
 * float32, and a sentence vector that is already int8 re-quantises to the very
 * same int8 values (its largest component is 127 × scale; the scale itself may
 * move by one float ulp, which cosine similarity cannot see). So an incremental
 * build ranks exactly as a full one would. A different model, or a file
 * that will not decode, means nothing is reused.
 */
function previousVectors(): Map<string, Float32Array> {
  const out = new Map<string, Float32Array>();
  if (!existsSync(KB_JSON) || !existsSync(KB_BIN)) return out;
  try {
    const kb = decodeKnowledgeBase(JSON.parse(readFileSync(KB_JSON, "utf8")) as KbFile, readFileSync(KB_BIN));
    if (kb.model !== EMBED_MODEL_ID || kb.dim !== EMBED_DIM) return out;
    kb.passages.forEach((p, i) => {
      const s = kb.sources[p.source];
      const text = `${s.title}. ${p.section ? `${p.section}. ` : ""}${p.sentences.join(" ")}`;
      out.set(text, kb.passageVectors.slice(i * EMBED_DIM, (i + 1) * EMBED_DIM));
      p.sentences.forEach((sentence, k) => {
        const g = kb.sentenceOffsets[i] + k;
        const scale = kb.sentenceScales[g];
        const v = new Float32Array(EMBED_DIM);
        for (let d = 0; d < EMBED_DIM; d++) v[d] = kb.sentenceVectors[g * EMBED_DIM + d] * scale;
        out.set(sentence, v);
      });
    });
  } catch {
    out.clear();
  }
  return out;
}

/**
 * Embed texts across several worker processes (scripts/coach/embed-shard.ts).
 * Each worker runs the same embedder the app uses, one text at a time, so the
 * vectors are exactly what a sequential run would produce — just sooner.
 * Texts are dealt round-robin so long passages and short sentences spread
 * evenly, then put back in their original order.
 */
async function embedParallel(texts: string[], n: number): Promise<Float32Array[]> {
  const dir = mkdtempSync(path.join(tmpdir(), "gymbro-coach-embed-"));
  const shards = Array.from({ length: n }, (_, w) => texts.filter((_, i) => i % n === w));
  const tsxCli = createRequire(path.join(process.cwd(), "package.json")).resolve("tsx/cli");
  const progress = new Array<number>(n).fill(0);
  const started = Date.now();

  try {
    await Promise.all(
      shards.map(
        (shard, w) =>
          new Promise<void>((resolve, reject) => {
            const input = path.join(dir, `shard-${w}.json`);
            writeFileSync(input, JSON.stringify(shard));
            const child = spawn(process.execPath, [tsxCli, "scripts/coach/embed-shard.ts", input, path.join(dir, `shard-${w}.f32`)], {
              stdio: ["ignore", "pipe", "inherit"],
            });
            child.stdout.on("data", (chunk: Buffer) => {
              const last = chunk.toString().trim().split("\n").pop()?.match(/progress (\d+)/);
              if (!last) return;
              progress[w] = Number(last[1]);
              const done = progress.reduce((a, b) => a + b, 0);
              const rate = done / ((Date.now() - started) / 1000);
              process.stdout.write(`\r  ${done}/${texts.length}  (${rate.toFixed(1)}/s)   `);
            });
            child.on("error", reject);
            child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`embedding worker ${w} exited with ${code}`))));
          }),
      ),
    );
    process.stdout.write("\n");

    const vectors = shards.map((shard, w) => {
      const buf = readFileSync(path.join(dir, `shard-${w}.f32`));
      if (buf.length !== shard.length * EMBED_DIM * 4) throw new Error(`worker ${w} wrote ${buf.length} bytes for ${shard.length} texts`);
      return Array.from({ length: shard.length }, (_, i) => {
        const v = new Float32Array(EMBED_DIM);
        for (let k = 0; k < EMBED_DIM; k++) v[k] = buf.readFloatLE((i * EMBED_DIM + k) * 4);
        return v;
      });
    });
    return texts.map((_, i) => vectors[i % n][Math.floor(i / n)]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function sourcesMarkdown(sources: KbSource[], passages: KbPassage[]): string {
  const counts = new Map<number, number>();
  for (const p of passages) counts.set(p.source, (counts.get(p.source) ?? 0) + 1);
  const lines = [
    "# Coach research library",
    "",
    "Generated by `npm run coach:kb` — do not edit by hand; edit `scripts/coach/sources.json`.",
    "",
    "Every article below is open access under the licence shown, verified against both the",
    "article's own XML and Europe PMC's metadata at build time. The coach shows excerpts of",
    "them with attribution. **Changes made:** text is excerpted sentence by sentence, and",
    "in-text citation markers, tables, figures and methods sections are removed.",
    "",
    "| # | Article | Licence | Passages |",
    "|---|---|---|---|",
  ];
  sources.forEach((s, i) => {
    const cite = `${s.authors} (${s.year ?? "n.d."}). *${s.title}*. ${s.journal}.${s.doi ? ` doi:${s.doi}` : ""} [${s.id}](${s.url})`;
    lines.push(`| ${i + 1} | ${cite} | [${s.license}](${s.licenseUrl}) | ${counts.get(i) ?? 0} |`);
  });
  return `${lines.join("\n")}\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
