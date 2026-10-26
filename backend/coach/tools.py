"""LangChain tools bound to the coach agent.

The docstrings ARE the tool descriptions the model reads, so they are kept
word-for-word in sync with src/lib/coach/agent.ts.
"""

from __future__ import annotations

from langchain_core.tools import tool

from coach.knowledge import knowledge_search_text
from coach.scraper import scrape
from coach.training_log import DEFAULT_WINDOW_DAYS, training_log_brief


@tool
def web_scraper(query: str) -> str:
    """Research fitness information on the live web: exact set/rep breakdowns of named
    protocols (Arnold split, 5/3/1, GVT), current research on supplement or nutrient
    timing, and form cues for uncommon exercises. Accepts a plain-language query or a
    full URL. Use only when you cannot answer with expert-level certainty — never for
    basic fitness advice.

    Args:
        query: Search query, or a full http(s) URL to read directly.
    """
    return scrape(query)


@tool
def knowledge_search(query: str) -> str:
    """Search GymBro's research library — open-access (CC BY) sports-science papers: ISSN
    position stands on protein, creatine, caffeine, nutrient timing, diets and supplements,
    and meta-analyses on volume, frequency, failure, rest intervals, deloading, cardio,
    stretching and sleep. Returns the most relevant passages, numbered, each with its
    citation. Use it for any evidence question before web_scraper, and cite what you use
    as [n] with a Sources list. If it reports no match, say the library has nothing on it.

    Args:
        query: The question, in plain language.
    """
    if not query.strip():
        return "No query supplied — nothing to search."
    try:
        return knowledge_search_text(query)
    except Exception as err:  # a thrown tool kills the whole reply; report instead
        return f"The knowledge_search tool failed ({err}). Continue without it and do not invent data."


def make_training_log_tool(user_id: str):
    """Bind the log tool to one authenticated user.

    The user id is captured in the closure rather than taken as a tool
    argument, so the model has no way to ask for somebody else's training.
    """

    @tool
    def training_log(days: int = DEFAULT_WINDOW_DAYS) -> str:
        """The signed-in user's real logged GymBro training: sessions, working sets, tonnage,
        muscle-group coverage, per-lift e1RM trend and recorded 1RMs. Call this whenever
        the user asks about their own training or before writing them a custom plan.
        Returns real data only — if it reports no sessions, say so instead of inventing any.

        Args:
            days: How many days back to summarise (default 45).
        """
        return training_log_brief(user_id, days)

    return training_log
