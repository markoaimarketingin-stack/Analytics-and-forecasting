Workflow: Analytics & Forecasting Agent — Architecture, Endpoints, LLM Prompts
=============================================================

TL;DR
-----
Single-page crisp reference describing the application flow, components, every public API endpoint, LLM prompts (purpose + sample), and operational notes.

Architecture diagram (Mermaid)
--------------------------------
```mermaid
flowchart LR
  A[Client / Frontend] -->|REST| B[FastAPI app: analytics_agent.api.app]
  B --> C[AnalyticsSupervisor (orchestrator)]
  C --> D[AgentManager -> specialist agents]
  D --> E[Nodes / Models (forecast, funnel, cohort, attribution, budget)]
  D --> F[AnalyticsRunner (legacy runner)]
  C --> G[GeminiClient (LLM)]
  B --> H[DB / Persistence]
  B --> I[Supabase storage (optional)]
  subgraph Storage
    H[SQLite / Supabase] --- I
  end
```

Components (one-liners + primary files)
---------------------------------------
- FastAPI app (HTTP surface): `analytics_agent/api/app.py` — implements all REST endpoints and app lifecycle.
- Orchestration layer: `analytics_agent/api/orchestrator.py` (AnalyticsSupervisor) — LLM planning, clarification, agent execution, final response generation.
- Agent manager / orchestration of specialist agents: `analytics_agent/api/agent_manager.py` and `analytics_agent/agents/*.py` — runs domain agents (forecast, scenario, funnel, attribution, cohort, budget_allocator, data_query, etc.).
- Analytics Runner: `analytics_agent/analytics_runner.py` — graph-based pipeline, legacy runner, AI summaries.
- LLM client: `analytics_agent/clients/gemini_client.py` — wraps Google Generative AI (Gemini) SDKs; controlled by env `GEMINI_API_KEY`.
- DB & repos: `analytics_agent/db/*.py` (models, repo, queries, chat_history_repo, agent_results_repo) — persistence of files, chat history, agent outputs.
- File handling & storage: `analytics_agent/api/file_handler.py` and `analytics_agent/clients/supabase_client.py` — local files + optional Supabase storage.
- CLI / runners: `cli.py` and `analytics_agent/analytics_runner.py` (entry points for local runs).

High-level data flow (step-by-step)
----------------------------------
1) Client sends request (chat or analysis) to FastAPI app (`/api/*` endpoints).
2) App ensures services initialized (AnalyticsRunner, AnalyticsSupervisor, DataQueryAgent).
3) For conversational requests (`/api/chat`), app builds chat prompt (see LLM prompts) and calls `GeminiClient.generate()`; conversation stored via `chat_history_repo`.
4) For analysis/orchestration (`/api/orchestrate`, `/api/analyze`, agent-specific endpoints), request flows to AnalyticsSupervisor which:
   - Normalizes message and uses the planning LLM prompt to decide mode/intent/agents and payload updates.
   - If clarification needed, asks targeted questions (stored per-thread) and merges answers using deterministic parsers + LLM parsing.
   - Resolves execution plan and invokes AgentManager to run specialist agents (these call nodes under `analytics_agent/nodes/`).
   - Combines agent results, optionally calls Gemini again to build a final human-friendly reasoning/summary.
5) Results are optionally persisted via `agent_results_repo` / Supabase depending on config.

All public endpoints (crisp list)
-------------------------------
Note: Source file for all endpoints: `analytics_agent/api/app.py`.

- GET /api/health
  - Purpose: health and readiness check
  - Request: none
  - Response: { status, timestamp, version, analytics_ready }

- POST /api/auth/google
  - Purpose: Verify Google OAuth credential and return client_id + user info
  - Request: { credential: str }
  - Response: { success, client_id, user: {google_sub,email,name,picture,email_verified}, timestamp }

- POST /api/chat
  - Purpose: simple conversational chat to the supervisor LLM
  - Request: { message, selected_datasets?:[], thread_id?:, client_id?: }
  - Response: { success, message, thread_id, timestamp }
  - Notes: Stores chat thread and messages (chat_history_repo); uses prompt builder `_build_chat_prompt`.

- POST /api/orchestrate
  - Purpose: Main orchestration entry — intent detection, agent planning, execution, UI-friendly structured response
  - Request: ChatRequest { message, selected_datasets?, thread_id?, client_id? }
  - Response: OrchestrateResponse { reasoning, intent, activated_agents, timeline, payload, result, ui, thread_id, timestamp }

- POST /api/analyze
  - Purpose: Run deterministic analytics pipeline (`AnalyticsRunner.run`) with full payload
  - Request: `AnalyticsPayloadRequest` (complex payload: channel_performance, structured_context, historical_data, etc.)
  - Response: AnalyticsResponse { success, run_id, data }

- POST /api/budget-sensitivity
  - Purpose: Run budget sensitivity across provided budgets
  - Request: AnalyticsPayloadRequest + budgets: list[float]
  - Response: BudgetSensitivityResponse { data: list of budget scenario results }

- POST /api/break-even
  - Purpose: Deterministic break-even calculation based on payload
  - Request: AnalyticsPayloadRequest
  - Response: BreakEvenResponse { min_roas, min_cvr, notes }

- POST /api/ltv-projection
  - Purpose: Project LTV (months param optional)
  - Request: AnalyticsPayloadRequest, months:int
  - Response: LTVProjectionResponse { monthly_revenue, total_ltv, assumptions }

- POST /api/cfo-mode
  - Purpose: CFO-style executive summary (uses analytics_runner.cfo_mode)
  - Request: AnalyticsPayloadRequest
  - Response: CFOReportResponse { executive_summary, board_explanation }

- GET /api/capabilities
  - Purpose: Return available analytics capabilities (from `AnalyticsRunner.capabilities`)

- File management
  - POST /api/agents/{agent_id}/files — upload file for agent (multipart/form-data: file + client_id + category + instructions). Saves locally and to Supabase (if configured), creates File record.
  - GET /api/agents/{agent_id}/files — list files linked to an agent
  - GET /api/files/{file_id} — get file metadata
  - DELETE /api/files/{file_id} — delete file

- Training uploads / Supabase storage
  - GET /api/training-uploads?client_id=... — list
  - GET /api/training-uploads/{upload_id}/preview?client_id=... — preview
  - DELETE /api/training-uploads/{upload_id}?client_id=... — delete remote+local

- Dataset endpoints (Supabase/local datasets)
  - GET /api/available-datasets — list dataset metadata (campaigns, events, customers, retention, transactions)
  - GET /api/datasets/{dataset_name}?limit=&client_id= — return rows + columns + source
  - POST /api/datasets/{dataset_name}/rows — upsert rows (JSON body rows: list[dict])
  - POST /api/datasets/{dataset_name}/upload-csv — multipart CSV upload

- Data Query Agent
  - POST /api/agents/data-query (alias /agents/data-query) — natural-language data query -> runs DataQueryAgent (requires client context)

- Agents management & execution (aliases under /agents/*)
  - POST /agents/orchestrate — orchestrate list of agents with explicit intent/payload (AgentOrchestrationRequest)
  - POST /agents/report/generate — generate exportable report for selected agents (ReportGenerationRequest). Returns encoded file bytes + report text (uses Gemini when available)
  - GET /agents/status — status of agents
  - GET /agents/results?agent_id=&client_id= — stored agent results
  - GET /agents/history?limit= — execution history
  - POST /agents/forecast/train — train forecast model
  - POST /agents/forecast/predict — predict with trained forecast model (payload as dict)
  - POST /agents/budget/allocate — run budget allocator agent

- Root
  - GET /api — API index with short endpoint map

LLM prompts (purpose, inputs, outputs, sample)
--------------------------------------------
- Chat prompt (app._build_chat_prompt in `analytics_agent/api/app.py`)
  - Purpose: Provide assistant with recent chat context + latest user message for conversational replies.
  - Inputs: history (last N messages), message
  - Output: plain text assistant reply
  - Sample (template):
    """
    You are Analytics Supervisor, the intelligent supervisor of a growth analytics platform.
    Conversation so far:
    {User/Assistant lines}
    Latest user message:
    {message}
    """

- Planning prompt (orchestrator._plan_with_llm in `analytics_agent/api/orchestrator.py`)
  - Purpose: Decide mode (conversation|analysis), intent, agents to run, and payload updates. Must return ONLY JSON per schema.
  - Inputs: user message, recent conversation context
  - Output: JSON with fields {mode, intent, agents, payload_updates, response}
  - Sample (template excerpt):
    """
    You are Analytics Supervisor, an orchestration engine for a marketing analytics platform.
    Return ONLY valid JSON.
    Schema: { "mode": ..., "intent": ..., "agents": [...], "payload_updates": {...}, "response": "..." }
    User message: {message}
    Recent conversation context: {conversation_context}
    """

- Clarification parsing prompt (orchestrator._merge_clarified_answers)
  - Purpose: Parse user's free-form answers to clarification questions; return ONLY JSON of extracted parameters.
  - Inputs: previously extracted params + user's answers
  - Output: JSON mapping to fields like channel, spend, impressions, ctr, conversion_rate, base_spend, adjustments
  - Sample (template excerpt):
    """
    Extract parameters from the user's answers. Return ONLY a JSON object with extracted values.
    Previously extracted parameters: {json}
    User's answers: {user_answers}
    Return ONLY valid JSON, no other text.
    """

- Final response summarization prompt (orchestrator._generate_final_response)
  - Purpose: Produce 1–3 paragraph human-friendly reasoning describing analysis, findings, and next steps.
  - Inputs: original message, plan, result (up to a large chunk of JSON)
  - Output: concise prose

- Analytics-run summary prompts (analytics_runner.run)
  - Purpose: After running numeric pipelines, generate a concise plain-English summary of forecast, scenarios, confidence.
  - Inputs: result.primary_kpi, result.metrics, result.confidence_score
  - Output: plain-English summary

- Report generation prompt (`_build_report_prompt` in `analytics_agent/api/app.py`)
  - Purpose: Produce an executive or detailed report from agent outputs. Returns plain text only.
  - Inputs: selected agents, orchestration_result (agent outputs JSON)
  - Output: plain text report; used by `/agents/report/generate` and packaged as PDF or DOC

LLM client
-----------
- `GeminiClient` (analytics_agent/clients/gemini_client.py)
  - Env: `GEMINI_API_KEY` (from `.env` or env vars). Model constant: `gemini-3.1-flash-lite-preview` in code but `GEMINI_MODEL` exists in `config.py`.
  - Behavior: returns empty string if API key or SDK not present; logs warnings. Use `generate(prompt: str) -> str` to get text result.

Data models & persistence
------------------------
- DB: by default local SQLite via `DATABASE_URL` in `analytics_agent/config.py` (default `sqlite:///./analytics.db`). Optional Supabase integration controlled by env `USE_SUPABASE` in `.env`.
- DB artifacts: `analytics_agent/api/analytics_agent.db` (packaged DB), `SUPABASE_INIT.sql` (seed/schema). Repos: `analytics_agent/db/*` (chat_history_repo, agent_results_repo, repo.get_session/init_db).
- Key persisted objects: Files (File table), Agents (Agent table), Chat threads & messages, Agent results / latest snapshot, Recommendation outcomes.

Operational notes (how to run & verify)
-------------------------------------
- Install dependencies (from `requirements.txt`):
```powershell
python -m pip install -r .\requirements.txt
```
- Run FastAPI app locally (uvicorn):
```powershell
python .\analytics_agent\api\app.py
# or directly:
uvicorn analytics_agent.api.app:app --reload --port 8000
```
- Run tests (if present):
```powershell
python -m pytest -q
```
- Inspect SQLite DB schema quickly (Python inline):
```powershell
python - <<'PY'
import sqlite3
conn=sqlite3.connect(r"analytics_agent\api\analytics_agent.db")
for row in conn.execute("SELECT name,sql FROM sqlite_master WHERE type='table'"):
    print(row)
conn.close()
PY
```

Environment variables of interest (from `env.example` & `config.py`)
----------------------------------------------------------------
- USE_SUPABASE — if true, uses Supabase instead of local SQLite
- SQLITE_DB_NAME / DATABASE_URL — local DB
- SUPABASE_URL, SUPABASE_KEY, SUPABASE_TRAINING_BUCKET — storage for uploaded files
- GEMINI_API_KEY — Google Generative API key; enables LLM features
- GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_ID — for Google sign-in
- CONTEXT_SIZE — number of chat pairs used for LLM planning context

Where to look for prompts & decision logic
-----------------------------------------
- Planning & orchestration: `analytics_agent/api/orchestrator.py` (search for `_plan_with_llm`, `_generate_final_response`, clarification functions)
- Chat prompt and upload/report prompts: `analytics_agent/api/app.py` (`_build_chat_prompt`, `_build_report_prompt`)
- Analytics numeric pipelines & fallback summaries: `analytics_agent/analytics_runner.py`
- LLM wrapper: `analytics_agent/clients/gemini_client.py`

How to update this doc
----------------------
- Update `workflow.md` when endpoints or prompts change. Primary source of truth is the Python functions named in this document.

Quick checklist for maintainers
------------------------------
1. Check `analytics_agent/api/app.py` for new endpoints and update endpoint list.
2. Search `analytics_agent/api/orchestrator.py` for new planning/clarification prompts.
3. If LLM prompt text changes, paste final prompt into the LLM Prompts section.

EOF

