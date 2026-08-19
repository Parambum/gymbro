# GymBro AI Coach — FastAPI + LangGraph service

The second of GymBro's two interchangeable coach backends. Same system prompt,
same two tools, same request/response shape as the TypeScript runner that lives
inside the Next.js app — flipping `COACH_BACKEND` in `.env` swaps the engine
under the widget without touching the UI.

```
POST /chat ─► build_coach_graph(user_id)
                    │
                    ▼
            START ─► agent ──tools_condition──► tools ─► agent ─► … ─► END
                                                 │
                                   web_scraper ──┴── training_log
```

`tools_condition` routes to the `ToolNode` whenever the model emits tool calls;
the edge back to `agent` feeds the tool output in for synthesis.

## Run it

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # macOS/Linux

# reads the repo-root .env: ANTHROPIC_API_KEY, MONGODB_URI, COACH_SERVICE_TOKEN
.venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

Then point the app at it:

```
COACH_BACKEND="python"
COACH_PY_URL="http://127.0.0.1:8000"
COACH_SERVICE_TOKEN="<same long random string in both processes>"
```

`GET /health` reports the model, whether the keys are present, and how many
characters of shared prompt it loaded — a fast way to confirm the wiring.

## Endpoints

| Route | Notes |
|---|---|
| `GET /health` | readiness + config probe, no auth |
| `POST /chat` | requires `x-coach-token`; body `{messages: [{role, content}], user_id}` |

`/chat` answers **only** with a valid `x-coach-token`. The caller passes an
already-authenticated `user_id`, so an open port here would be an oracle for
anyone's training log. Without `COACH_SERVICE_TOKEN` set the service refuses
every request (503) rather than running unauthenticated.

## Files

| File | Role |
|---|---|
| `main.py` | FastAPI app, token gate, message conversion |
| `coach/graph.py` | the LangGraph `StateGraph` (agent ⇄ ToolNode) |
| `coach/tools.py` | `@tool web_scraper` and the per-user `training_log` factory |
| `coach/scraper.py` | agent-reach routing: Exa via mcporter, else Jina Reader |
| `coach/training_log.py` | pymongo read of the user's real sessions, sets and e1RM trend |
| `coach/prompt.py` | loads `shared/coach/system-prompt.md` |

## Notes

- **The prompt is not stored here.** Both backends read
  `shared/coach/system-prompt.md`; two copies would drift within a week.
- **Muscle-group names are parsed out of `src/lib/data/exercise-catalog.ts`**,
  the app's single source of truth, rather than re-typed.
- **Collections** are the Mongoose-pluralized names: `workouts`, `onerepmaxes`.
- **The graph is compiled per request** because `training_log` closes over the
  authenticated user id; a module-level graph would need that id in mutable
  global state, one race away from serving the wrong lifter's log.
- **Scraped pages are cleaned and capped** (6k chars per page, 12k per call)
  before they reach the model — raw scrapes blow up the context window.
