"""Loads the coach persona from the repo-shared markdown file.

Deliberately the same file the Next.js backend reads
(``shared/coach/system-prompt.md``) — two copies of a system prompt drift
within a week and the two backends start answering differently.

The file's editorial header (everything above the first ``---`` rule) is for
humans; only the prose below it is sent to the model.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

# backend/coach/prompt.py -> backend/coach -> backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROMPT_PATH = REPO_ROOT / "shared" / "coach" / "system-prompt.md"


@lru_cache(maxsize=1)
def coach_system_prompt() -> str:
    path = Path(os.getenv("COACH_PROMPT_PATH", DEFAULT_PROMPT_PATH))
    raw = path.read_text(encoding="utf-8")
    marker = "\n---\n"
    _, sep, body = raw.partition(marker)
    return (body if sep else raw).strip()
