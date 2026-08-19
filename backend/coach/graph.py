"""The agentic workflow: a LangGraph tool-calling loop.

    START → agent ──tools_condition──→ tools → agent → … → END

`tools_condition` routes to the ToolNode whenever the model emits tool_calls,
and the edge back to `agent` feeds the tool output in for synthesis. Same
system prompt and same tool surface as the TypeScript runner in
src/lib/coach/agent.ts.
"""

from __future__ import annotations

import os

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from coach.prompt import coach_system_prompt
from coach.tools import make_training_log_tool, web_scraper

MODEL = "claude-opus-5"
GROQ_MODEL = "openai/gpt-oss-120b"
# The persona is deliberately terse — a widget-sized reply, not an essay.
MAX_TOKENS = 4096


def build_llm():
    """Pick the chat model.

    An explicit COACH_PROVIDER wins; otherwise follow whichever key exists, so
    a deployment enables the coach by setting one variable and nothing else.
    Swapping providers costs three lines here precisely because the graph, the
    tools and the prompt below are all provider-agnostic.
    """
    provider = os.getenv("COACH_PROVIDER", "").strip().lower()
    if not provider:
        provider = "anthropic" if os.getenv("ANTHROPIC_API_KEY") else "groq"

    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(model=os.getenv("GROQ_MODEL", GROQ_MODEL), max_tokens=MAX_TOKENS)

    return ChatAnthropic(model=MODEL, max_tokens=MAX_TOKENS)


def build_coach_graph(user_id: str | None):
    """Compile a graph for one request.

    Per-request rather than module-level on purpose: `training_log` closes over
    the authenticated user id, so a shared graph would need that id in mutable
    global state — one race away from serving another lifter's training. The
    compile itself is cheap; the API call dominates.
    """
    tools = [web_scraper]
    if user_id:
        tools.append(make_training_log_tool(user_id))

    llm = build_llm().bind_tools(tools)
    system = SystemMessage(content=coach_system_prompt())

    def agent(state: MessagesState) -> dict:
        return {"messages": [llm.invoke([system, *state["messages"]])]}

    builder = StateGraph(MessagesState)
    builder.add_node("agent", agent)
    builder.add_node("tools", ToolNode(tools))

    builder.add_edge(START, "agent")
    # tool_calls present → "tools"; otherwise → END
    builder.add_conditional_edges("agent", tools_condition)
    builder.add_edge("tools", "agent")

    return builder.compile()
