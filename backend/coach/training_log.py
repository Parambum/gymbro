"""The ``training_log`` tool body — the lifter's REAL logged training.

Port of src/lib/coach/training-log.ts: same window, same sections, same
wording, so a reply cannot tell you which backend served it. Reads Mongo
directly with pymongo (the Next.js route has already authenticated the caller
and passes the user id server-to-server).

Text, not JSON, on purpose: the coach must never echo raw JSON at the user, and
a labelled brief is far cheaper in tokens than nested objects. Every number
here comes out of Mongo — nothing is estimated.
"""

from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from bson import ObjectId
from pymongo import MongoClient

from coach.prompt import REPO_ROOT

DEFAULT_WINDOW_DAYS = 45

_client: MongoClient | None = None


def _db():
    """One pooled client for the process — Atlas connection limits are finite."""
    global _client
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is not set — the training_log tool needs it.")
    if _client is None:
        _client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    return _client.get_default_database()


@lru_cache(maxsize=1)
def _muscle_names() -> dict[str, str]:
    """Slug to display name, parsed out of the TypeScript catalog.

    exercise-catalog.ts is the app's single source of truth for muscle groups;
    re-typing the list here would let the two drift silently.
    """
    default = REPO_ROOT / "src" / "lib" / "data" / "exercise-catalog.ts"
    path = Path(os.getenv("EXERCISE_CATALOG_PATH", default))
    try:
        source = path.read_text(encoding="utf-8")
    except OSError:
        return {}
    pairs = re.findall(r'slug:\s*"([^"]+)",\s*\n\s*name:\s*"([^"]+)"', source)
    return dict(pairs)


def _pretty(iso: str) -> str:
    """'Mon, Aug 18' — matches prettyDate() in src/lib/date-utils.ts.

    %-d is glibc-only, so the day number is appended by hand for Windows.
    """
    try:
        parsed = datetime.strptime(iso, "%Y-%m-%d")
    except ValueError:
        return iso
    return parsed.strftime("%a, %b ") + str(parsed.day)


def _streak(dates: set[str], anchor: str) -> int:
    """Consecutive-day streak ending at `anchor`; idle today still counts if
    yesterday was logged. Mirrors streakFromDates()."""
    if not dates:
        return 0
    cursor = anchor
    if cursor not in dates:
        cursor = (date.fromisoformat(anchor) - timedelta(days=1)).isoformat()
    if cursor not in dates:
        return 0
    streak = 0
    while cursor in dates:
        streak += 1
        cursor = (date.fromisoformat(cursor) - timedelta(days=1)).isoformat()
    return streak


def _round_e1rm(value: float) -> float | int:
    """0.5 kg display precision — matches roundE1RM()."""
    rounded = round(value * 2) / 2
    return int(rounded) if rounded == int(rounded) else rounded


def training_log_brief(user_id: str, days: int = DEFAULT_WINDOW_DAYS) -> str:
    window = min(max(int(days or DEFAULT_WINDOW_DAYS), 7), 365)
    today = date.today().isoformat()
    since = (date.today() - timedelta(days=window)).isoformat()

    db = _db()
    oid = ObjectId(user_id)
    workouts = list(db.workouts.find({"userId": oid, "date": {"$gte": since}}).sort("date", 1))
    maxes = list(db.onerepmaxes.find({"userId": oid}).sort("oneRepMax", -1))

    sets: list[dict] = []
    for workout in workouts:
        for s in workout.get("sets", []):
            sets.append(
                {
                    "date": workout["date"],
                    "exercise": s.get("exercise", "?"),
                    "muscleGroup": s.get("muscleGroup", "?"),
                    "mode": s.get("mode") or "weight-reps",
                    "weight": s.get("weight") or 0,
                    "reps": s.get("reps") or 0,
                    "durationSec": s.get("durationSec"),
                    "setType": s.get("setType") or "WORKING",
                    "e1rm": s.get("e1rm") or 0,
                }
            )

    names = _muscle_names()

    if not sets:
        if maxes:
            tail = "Recorded 1RMs on file: " + ", ".join(
                "{} {}kg".format(m["exercise"], m["oneRepMax"]) for m in maxes
            )
        else:
            tail = "No recorded 1RMs on file either."
        return "\n".join(
            [
                "TRAINING LOG (last {} days, as of {})".format(window, today),
                "No sessions logged in this window. The user has no training history to analyse.",
                tail,
            ]
        )

    working = [s for s in sets if s["setType"] != "WARMUP"]
    dates = sorted({s["date"] for s in sets})
    tonnage = sum(s["weight"] * s["reps"] for s in working)

    lines: list[str] = [
        "TRAINING LOG (last {} days, as of {})".format(window, today),
        "Sessions: {} · working sets: {} · tonnage: {}kg".format(
            len(dates), len(working), round(tonnage)
        ),
        "First session in window: {} · most recent: {} · current streak: {} day(s)".format(
            _pretty(dates[0]), _pretty(dates[-1]), _streak(set(dates), today)
        ),
    ]

    # -- muscle coverage: what they hammer vs what they skip -------------
    by_muscle: dict[str, dict] = {}
    for s in working:
        stat = by_muscle.setdefault(s["muscleGroup"], {"sets": 0, "last": s["date"]})
        stat["sets"] += 1
        stat["last"] = max(stat["last"], s["date"])

    lines.append("")
    lines.append("MUSCLE COVERAGE (working sets · last trained)")
    for slug, stat in sorted(by_muscle.items(), key=lambda kv: -kv[1]["sets"]):
        lines.append(
            "- {}: {} sets · {}".format(names.get(slug, slug), stat["sets"], _pretty(stat["last"]))
        )

    untouched = [slug for slug in names if slug not in by_muscle]
    if untouched:
        lines.append(
            "- NOT TRAINED at all in this window: "
            + ", ".join(names.get(s, s) for s in untouched)
        )

    # -- per-exercise progression: best e1RM per day, first vs latest ----
    by_exercise: dict[str, dict[str, dict]] = {}
    for s in working:
        if s["mode"] != "weight-reps" or s["e1rm"] <= 0:
            continue
        days_map = by_exercise.setdefault(s["exercise"], {})
        best = days_map.get(s["date"])
        if best is None or s["e1rm"] > best["e1rm"]:
            days_map[s["date"]] = s

    progression = sorted(by_exercise.items(), key=lambda kv: -len(kv[1]))[:8]
    if progression:
        lines.append("")
        lines.append("MAIN LIFTS (sessions · latest best set · e1RM trend across the window)")
        for exercise, days_map in progression:
            points = [days_map[d] for d in sorted(days_map)]
            first, last = points[0], points[-1]
            if len(points) < 2:
                trend = "single session — no trend yet"
            else:
                delta = (
                    (last["e1rm"] - first["e1rm"]) / first["e1rm"] * 100 if first["e1rm"] else 0.0
                )
                trend = "{}{:.1f}% e1RM ({}kg → {}kg)".format(
                    "+" if delta >= 0 else "",
                    delta,
                    _round_e1rm(first["e1rm"]),
                    _round_e1rm(last["e1rm"]),
                )
            lines.append(
                "- {}: {} session(s) · last {}kg × {} on {} · {}".format(
                    exercise, len(points), last["weight"], last["reps"], _pretty(last["date"]), trend
                )
            )

    # -- bodyweight / timed work, which carries no e1RM ------------------
    non_loaded = [s for s in working if s["mode"] != "weight-reps"]
    if non_loaded:
        grouped: dict[str, dict] = {}
        for s in non_loaded:
            metric = (s["durationSec"] or 0) if s["mode"] == "time" else s["reps"]
            stat = grouped.setdefault(s["exercise"], {"sets": 0, "best": 0, "mode": s["mode"]})
            stat["sets"] += 1
            stat["best"] = max(stat["best"], metric)
        lines.append("")
        lines.append("BODYWEIGHT / TIMED WORK")
        for exercise, stat in list(grouped.items())[:6]:
            if stat["mode"] == "time":
                best = "{}s hold".format(stat["best"])
            else:
                best = "{} reps".format(stat["best"])
            lines.append("- {}: {} sets · best {}".format(exercise, stat["sets"], best))

    if maxes:
        lines.append("")
        lines.append("RECORDED 1RMs (tested or manually entered, not estimates)")
        for m in maxes[:8]:
            lines.append(
                "- {}: {}kg ({})".format(m["exercise"], m["oneRepMax"], m.get("source", "manual"))
            )

    return "\n".join(lines)
