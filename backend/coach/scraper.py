"""RESEARCH-MODE backend, routed the way the agent-reach skill routes.

Ask ``agent-reach doctor --json`` which channel is live on this host, then use
it:

* ``exa_search`` (Exa via mcporter) — keyword search, best quality, needs config
* ``web`` (Jina Reader)             — zero-config, reads any URL as clean markdown

Jina is the floor: it renders a DuckDuckGo results page as markdown too, so
query search still works when Exa is off (the default state of a fresh
agent-reach install).

Mirrors src/lib/coach/web-scraper.ts — same routing, same cleanup, same caps.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import time
from urllib.parse import quote, unquote, urlparse

import httpx

JINA = "https://r.jina.ai/"
DDG = "https://html.duckduckgo.com/html/?q="

FETCH_TIMEOUT_S = 20.0
# Scraped pages are huge; the model only needs the substance.
PER_PAGE_CHARS = 6_000
TOTAL_CHARS = 12_000

_DOCTOR_TTL_S = 600.0
_doctor_cache: tuple[float, bool] | None = None


def _run_cli(bin_name: str, args: list[str], timeout: int) -> str | None:
    """Spawn a CLI with an argument list and no shell, so a query can never be
    parsed as shell syntax.

    Windows caveat: an npm ``.cmd`` shim (which is what ``mcporter`` is there)
    cannot be spawned directly, and routing it through cmd.exe would
    re-introduce shell parsing of those arguments. So a batch shim is skipped;
    the Jina fallback covers the query either way.
    """
    resolved = shutil.which(bin_name)
    if not resolved or resolved.lower().endswith((".cmd", ".bat")):
        return None
    try:
        out = subprocess.run(
            [resolved, *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=True,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    return out.stdout


def _safe_query(query: str) -> str:
    """Belt-and-braces: the query reaches a CLI argument, so keep it to
    characters a fitness search actually needs."""
    cleaned = re.sub(r"[^\w\s.,'\"?:%+/-]", " ", query, flags=re.UNICODE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _exa_is_live() -> bool:
    """Best-effort probe. A missing binary just means 'Exa is off'."""
    global _doctor_cache
    if _doctor_cache and time.monotonic() - _doctor_cache[0] < _DOCTOR_TTL_S:
        return _doctor_cache[1]

    live = False
    stdout = _run_cli("agent-reach", ["doctor", "--json"], timeout=25)
    if stdout:
        try:
            live = bool(json.loads(stdout).get("exa_search", {}).get("active_backend"))
        except (ValueError, AttributeError):
            live = False

    _doctor_cache = (time.monotonic(), live)
    return live


def _exa_search(query: str) -> str | None:
    stdout = _run_cli(
        "mcporter",
        ["call", "exa.web_search_exa", f"query={_safe_query(query)}", "numResults=3"],
        timeout=60,
    )
    if not stdout:
        return None
    text = _strip_noise(stdout)
    return text if len(text) > 200 else None


def _jina_read(client: httpx.Client, url: str, clean: bool = True) -> str | None:
    """`clean=False` keeps the raw markdown — link targets and all — which is
    what the SERP parser needs; cleaning first would delete the very hrefs it
    is looking for."""
    try:
        res = client.get(
            JINA + url,
            timeout=FETCH_TIMEOUT_S,
            headers={"User-Agent": "gymbro-coach/1.0", "X-Return-Format": "markdown"},
            follow_redirects=True,
        )
        if res.status_code != 200:
            return None
        return _strip_noise(res.text) if clean else res.text
    except httpx.HTTPError:
        return None


def _ddg_links(markdown: str, limit: int) -> list[str]:
    """Pull organic result links out of a Jina-rendered DDG results page."""
    out: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r"uddg=([^&)\"\s]+)", markdown):
        if len(out) >= limit:
            break
        url = unquote(match.group(1))
        if not url.startswith(("http://", "https://")):
            continue
        parsed = urlparse(url)
        key = parsed.netloc + parsed.path
        if key in seen:
            continue
        seen.add(key)
        out.append(url)
    return out


def _strip_noise(raw: str) -> str:
    """Drop images, link targets and tracking junk so the model's context is
    spent on sentences rather than markup."""
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", raw)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s*(Title|URL Source|Published Time|Markdown Content):.*$", "", text, flags=re.M)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "\n…[truncated]"


def scrape(query: str) -> str:
    """Fetch live context: a URL is read, anything else is searched then read."""
    query = query.strip()
    if not query:
        return "Empty query — nothing to research."

    with httpx.Client() as client:
        if re.match(r"^https?://", query, re.I):
            page = _jina_read(client, query)
            return _clip(page, TOTAL_CHARS) if page else f"Could not read {query}."

        if _exa_is_live():
            hit = _exa_search(query)
            if hit:
                return _clip(hit, TOTAL_CHARS)

        serp = _jina_read(client, DDG + quote(query), clean=False)
        if not serp:
            return f'No research backend reachable for "{query}".'

        links = _ddg_links(serp, 2)
        chunks: list[str] = []
        for url in links:
            page = _jina_read(client, url)
            if page:
                chunks.append(f"## Source: {urlparse(url).netloc}\n{_clip(page, PER_PAGE_CHARS)}")

        if not chunks:
            # The SERP itself still carries titles and snippets.
            return _clip(_strip_noise(serp), PER_PAGE_CHARS)
        return _clip("\n\n".join(chunks), TOTAL_CHARS)
