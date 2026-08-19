"""FastAPI front door for the LangGraph coach.

Only the Next.js route talks to this service, and it must prove it with the
shared token: the caller passes an already-authenticated `user_id`, so an
unauthenticated port here would be an oracle for anyone's training log.

Run it with:  uvicorn main:app --reload --port 8000  (from backend/)
"""

from __future__ import annotations

import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field

from coach.graph import MODEL, build_coach_graph
from coach.prompt import REPO_ROOT, coach_system_prompt

# the app's single .env at the repo root — one place for MONGODB_URI and keys
load_dotenv(REPO_ROOT / ".env")

app = FastAPI(title="GymBro AI Coach", version="1.0.0")

# agent → tools → agent is two ticks per research round-trip; 12 leaves room
# for ~5 tool calls before LangGraph stops the loop.
RECURSION_LIMIT = 12


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[Turn] = Field(min_length=1, max_length=40)
    # Resolved by the Next.js route from the session cookie — never by a browser.
    user_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    toolsUsed: list[str]
    backend: str = "langgraph"


def _require_token(supplied: str | None) -> None:
    expected = os.getenv("COACH_SERVICE_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="COACH_SERVICE_TOKEN is not set — refusing to serve an unauthenticated coach.",
        )
    if supplied != expected:
        raise HTTPException(status_code=401, detail="Bad or missing x-coach-token.")


def _text_of(content) -> str:
    """Anthropic replies arrive as a string or as a list of content blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "\n".join(p for p in parts if p)
    return str(content)


@app.get("/health")
def health() -> dict:
    """Cheap readiness probe — also proves the shared prompt is reachable."""
    return {
        "status": "ok",
        "model": MODEL,
        "prompt_chars": len(coach_system_prompt()),
        "anthropic_key": bool(os.getenv("ANTHROPIC_API_KEY")),
        "mongo_uri": bool(os.getenv("MONGODB_URI")),
    }


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, x_coach_token: str | None = Header(default=None)) -> ChatResponse:
    _require_token(x_coach_token)

    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not set.")

    history = [
        HumanMessage(content=t.content) if t.role == "user" else AIMessage(content=t.content)
        for t in req.messages
    ]

    graph = build_coach_graph(req.user_id)
    try:
        result = graph.invoke({"messages": history}, config={"recursion_limit": RECURSION_LIMIT})
    except Exception as exc:
        # Without this the caller gets a bare 500 and has to read our logs to
        # learn that, say, the API key was rejected.
        raise HTTPException(
            status_code=502,
            detail="Coach graph failed: {}: {}".format(type(exc).__name__, str(exc)[:300]),
        ) from exc

    messages = result["messages"]
    tools_used = [
        call["name"]
        for message in messages
        if isinstance(message, AIMessage)
        for call in (message.tool_calls or [])
    ]

    reply = _text_of(messages[-1].content).strip()
    return ChatResponse(
        reply=reply or "I didn't catch that — mind rephrasing?",
        toolsUsed=tools_used,
    )
