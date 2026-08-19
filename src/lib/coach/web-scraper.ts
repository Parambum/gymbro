import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The coach's RESEARCH-MODE backend, routed the way the agent-reach skill
 * routes: ask `agent-reach doctor --json` which channel is actually live on
 * this box, then use it.
 *
 *   exa_search (Exa via mcporter) — keyword search, best quality, needs config
 *   web        (Jina Reader)      — zero-config, reads any URL as clean markdown
 *
 * Jina is the floor: it turns a DuckDuckGo results page into markdown too, so
 * query search still works when Exa is off (which is the default state — a
 * fresh agent-reach install reports `exa_search: off`).
 */

const JINA = "https://r.jina.ai/";
const DDG = "https://html.duckduckgo.com/html/?q=";

/** Cleaned page text handed back to the model, per source. */
export interface ScrapeResult {
  backend: "exa" | "jina" | "none";
  text: string;
}

// A research turn can spend three fetches (SERP + two pages) inside a 60s
// function budget, and still needs room for the model's turns.
const FETCH_TIMEOUT_MS = 12_000;
/** Scraped pages are huge; the model only needs the substance. */
const PER_PAGE_CHARS = 6_000;
const TOTAL_CHARS = 12_000;

let doctorCache: { at: number; exaLive: boolean } | null = null;
const DOCTOR_TTL_MS = 10 * 60_000;

/**
 * Spawn a CLI with an argument array and no shell, so a query can never be
 * parsed as shell syntax.
 *
 * Windows caveat: an npm `.cmd` shim (which is what `mcporter` is there) cannot
 * be spawned directly, and routing it through cmd.exe would re-introduce shell
 * parsing of those arguments — CVE-2024-27980. So Windows tries the real `.exe`
 * and otherwise gives up; the Jina fallback covers the query either way.
 */
async function runCli(bin: string, args: string[], timeoutMs: number): Promise<string | null> {
  const candidates = process.platform === "win32" ? [`${bin}.exe`, bin] : [bin];
  for (const cmd of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, args, {
        timeout: timeoutMs,
        maxBuffer: 8 << 20,
        windowsHide: true,
      });
      return stdout;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EINVAL") continue; // not this candidate
      return null; // it ran and failed
    }
  }
  return null;
}

/** Belt-and-braces: the query reaches a CLI argument, so keep it to characters
 *  a fitness search actually needs. */
function safeQuery(query: string): string {
  return query.replace(/[^\p{L}\p{N}\s.,'"?:%+/-]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Ask agent-reach which research backends are live. Best-effort: a missing
 *  binary just means "Exa is off", never an error. */
async function exaIsLive(): Promise<boolean> {
  if (doctorCache && Date.now() - doctorCache.at < DOCTOR_TTL_MS) return doctorCache.exaLive;

  let exaLive = false;
  const stdout = await runCli("agent-reach", ["doctor", "--json"], 25_000);
  if (stdout) {
    try {
      const report = JSON.parse(stdout) as Record<string, { active_backend?: string | null }>;
      exaLive = Boolean(report.exa_search?.active_backend);
    } catch {
      exaLive = false;
    }
  }

  doctorCache = { at: Date.now(), exaLive };
  return exaLive;
}

async function exaSearch(query: string): Promise<string | null> {
  const stdout = await runCli(
    "mcporter",
    ["call", "exa.web_search_exa", `query=${safeQuery(query)}`, "numResults=3"],
    60_000,
  );
  if (!stdout) return null;
  const text = stripNoise(stdout);
  return text.length > 200 ? text : null;
}

/**
 * Read one URL through Jina Reader, which returns article markdown.
 * `clean = false` keeps the raw markdown — link targets and all — which is what
 * the SERP parser needs; cleaning first would delete the very hrefs it hunts.
 */
async function jinaRead(url: string, clean = true): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(JINA + url, {
      signal: controller.signal,
      headers: { "User-Agent": "gymbro-coach/1.0", "X-Return-Format": "markdown" },
    });
    if (!res.ok) return null;
    const body = await res.text();
    return clean ? stripNoise(body) : body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the organic result links out of a Jina-rendered DDG results page. */
function ddgLinks(markdown: string, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // DDG wraps every hit as /l/?uddg=<percent-encoded target>
  const re = /uddg=([^&)"\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) && out.length < limit) {
    let url: string;
    try {
      url = decodeURIComponent(m[1]);
    } catch {
      continue;
    }
    if (!/^https?:\/\//.test(url)) continue;
    const key = new URL(url).hostname + new URL(url).pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

/**
 * Strip the scaffolding Jina/mcporter leave behind — image embeds, link
 * targets, tracking junk, blank runs — so the model spends its context on
 * sentences rather than markup. Scrapers blow up context windows otherwise.
 */
function stripNoise(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/^\s*(Title|URL Source|Published Time|Markdown Content):.*$/gm, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;
}

/**
 * Fetch live context for a fitness question. `input` is either a URL (read it)
 * or a plain-language query (search, then read the top hits).
 */
export async function webScraper(input: string): Promise<ScrapeResult> {
  const query = input.trim();
  if (!query) return { backend: "none", text: "Empty query — nothing to research." };

  if (/^https?:\/\//i.test(query)) {
    const page = await jinaRead(query);
    return page
      ? { backend: "jina", text: clip(page, TOTAL_CHARS) }
      : { backend: "none", text: `Could not read ${query}.` };
  }

  if (await exaIsLive()) {
    const hit = await exaSearch(query);
    if (hit) return { backend: "exa", text: clip(hit, TOTAL_CHARS) };
  }

  const serp = await jinaRead(DDG + encodeURIComponent(query), false);
  if (!serp) {
    return { backend: "none", text: `No research backend reachable for "${query}".` };
  }

  const links = ddgLinks(serp, 2);
  const pages = await Promise.all(links.map((url) => jinaRead(url)));
  const body = pages
    .map((page, i) => (page ? `## Source: ${new URL(links[i]).hostname}\n${clip(page, PER_PAGE_CHARS)}` : null))
    .filter((s): s is string => s !== null)
    .join("\n\n");

  if (!body) {
    // The SERP itself still carries titles and snippets — better than nothing.
    return { backend: "jina", text: clip(stripNoise(serp), PER_PAGE_CHARS) };
  }
  return { backend: "jina", text: clip(body, TOTAL_CHARS) };
}
