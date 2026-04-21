# API Endpoints (Analytics & Forecasting Agent)

This document lists the important HTTP endpoints found in `analytics_agent/api` with a short description of what each does, expected request inputs, and notable aliases.

> Note: Many endpoints have both `/api/...` and shorter `/agents/...` aliases. The canonical API file is `analytics_agent/api/app.py`.

---

## General

- GET /api
  - Basic API root with service name, version and a short endpoint map.

- GET /api/health
  - Health check. Returns status, timestamp, app version and whether analytics services are initialized.

## Authentication

- POST /api/auth/google
  - Body: { credential: string }
  - Verifies a Google ID token and returns a `client_id` and user profile (email, name, picture).

## Chat / Orchestration

- POST /api/chat
  - Body: ChatRequest { message: string, selected_datasets?: string[], thread_id?: string, client_id?: string }
  - Simple chat endpoint backed by the Supervisor/gemini client — returns assistant message and thread id.

- POST /api/orchestrate
  - Body: ChatRequest
  - Main orchestration endpoint: uses `AnalyticsSupervisor` to classify intent, run specialist agents as needed, combine results and return a structured response (reasoning, activated_agents, timeline, payload, result, ui, thread_id).

## Chat History

- GET /api/chat-history?client_id=...&limit=...
  - List chat threads for a client.

- GET /api/chat-history/{thread_id}?client_id=...
  - Return messages and metadata for a specific chat thread.

## Recommendations / Lifecycle

- GET /api/recommendations/outcomes
- GET /agents/recommendations/outcomes
  - Query stored recommendation lifecycle records (filters: client_id, thread_id).

- POST /api/recommendations/outcomes
- POST /agents/recommendations/outcomes
  - Upsert a recommendation lifecycle record. Body is RecommendationLifecycleRecord.

## Direct Analytics (legacy / direct runner)

- POST /api/analyze
  - Body: AnalyticsPayloadRequest
  - Directly run the analytics runner and return analysis `data` (run_id included).

- POST /api/budget-sensitivity
  - Body: AnalyticsPayloadRequest, budgets: list[float]
  - Returns sensitivity analysis for different budgets.

- POST /api/break-even
  - Body: AnalyticsPayloadRequest
  - Break-even analysis.

- POST /api/ltv-projection?months=12
  - Body: AnalyticsPayloadRequest
  - LTV projection for `months` months (default 12).

- POST /api/cfo-mode
  - Body: AnalyticsPayloadRequest
  - Generate CFO-style report / executive summary.

- GET /api/capabilities
  - Returns the capabilities advertised by the analytics runner (available agent types, features).

## File Management and Training Uploads

- POST /api/agents/{agent_id}/files
  - Upload file for an agent. Form-data: file (UploadFile), client_id (form), category (form), instructions (form).
  - Saves locally and uploads to storage (supabase), records metadata in DB.

- GET /api/agents/{agent_id}/files
  - Get files associated with an agent (database-backed).

- GET /api/training-uploads?client_id=...
  - List training upload records for a client (records stored in Supabase via `supabase_client`).

- GET /api/training-uploads/{upload_id}/preview?client_id=...
  - Return metadata plus a text preview of the uploaded file.

- DELETE /api/training-uploads/{upload_id}?client_id=...
  - Delete an uploaded training file (remote storage + local file + DB record).

- GET /api/files/{file_id}
  - Get file metadata (DB File record).

- DELETE /api/files/{file_id}
  - Delete file by id (local storage + DB delete).

## Available Datasets / Dataset Management

- GET /api/available-datasets?client_id=...
  - Returns metadata for available datasets (campaigns, events, customers, retention, transactions). Respects client context (shows only client uploads when client_id provided).

- GET /api/datasets/{dataset_name}?limit=50&client_id=...
  - Returns rows and columns for a dataset. Allowed names: campaigns, customers, events, retention, transactions.

- POST /api/datasets/{dataset_name}/rows
  - Body: { rows: [ {...}, ... ] }
  - Upserts rows into dataset via DB helper functions.

- POST /api/datasets/{dataset_name}/upload-csv
  - Accepts a CSV file upload to replace/upsert rows into the specified dataset (CSV only).

## Data Query Agent (natural language -> query)

- POST /agents/data-query
- POST /api/agents/data-query
  - Body: { prompt: string, client_id?: string, limit?: int }
  - Runs `DataQueryAgent` to answer natural language data questions; requires client context (client_id) to access uploaded data.

- GET /api/agents-data-mapping
  - Returns a mapping of which datasets each agent can use (used by frontend to surface dataset compatibility).

## Agent Options (filter options for different agents)

These endpoints provide front-end convenience/filter options derived from datasets.

- GET /agents/funnel/options  (aliases: /api/agents/funnel/options, /funnel/options, /api/funnel/options)
  - Returns funnel filter options (e.g., funnel stages) based on datasets or client uploads.

- GET /agents/forecast/options (alias: /api/agents/forecast/options)
  - Forecast filters (campaign-level fields) derived from campaigns table.

- GET /agents/attribution/options (alias: /api/agents/attribution/options)
  - Attribution filter options and toggles.

- GET /agents/scenario/options (alias: /api/agents/scenario/options)
  - Scenario filter options (campaigns-based filters).

- GET /agents/cohort/options (aliases: /api/agents/cohort/options, /cohort/options, /api/cohort/options)
  - Cohort filter options and defaults.

- GET /agents/budget/options (alias: /api/agents/budget/options)
  - Budget allocator filter defaults and constraints.

## Agent Management / Execution (Supervisor-facing endpoints)

- POST /agents/orchestrate
  - Body: AgentOrchestrationRequest { intent: str, agents: [str], payload: dict, client_id?: str, thread_id?: str }
  - Orchestrate specific agents programmatically (delegates to AgentManager/OrchestratorAgent). Returns combined agent outputs.

- POST /agents/report/generate
- POST /api/agents/report/generate
  - Body: ReportGenerationRequest { report_type: 'executive'|'detailed', export_format: 'pdf'|'doc', agents: [str], payload: dict, client_id?: str }
  - Runs selected agents, optionally uses Gemini to generate a text report, returns base64 file content and report_text.

- GET /agents/status
  - Returns readiness/status of each specialist agent and whether forecast model is loaded.

- GET /agents/results?agent_id=...&client_id=...
  - Returns stored agent results (optionally for a specific agent) and client-level snapshot (recommendations/executive_summary).

- GET /agents/history?limit=10
  - Returns recent agent execution history entries.

- POST /agents/forecast/train
- POST /api/agents/forecast/train
  - Trigger training of the internal forecast model (AgentManager -> orchestrator -> forecast_agent.train()). Returns training metrics.

- POST /agents/forecast/predict
- POST /api/agents/forecast/predict
  - Body: arbitrary payload describing campaign parameters (must include client_id when relying on client uploads)
  - Runs forecast agent (intent='forecast') and returns predictions.

- POST /agents/budget/allocate
- POST /api/agents/budget/allocate
  - Body: payload containing budget, objective and constraints (client_id recommended)
  - Runs `budget_allocator` agent and returns allocation results.

## Notes / Where to look in the code

- Canonical API definitions and route handlers: `analytics_agent/api/app.py` (most endpoints).
- High-level orchestration logic: `analytics_agent/api/orchestrator.py` (AnalyticsSupervisor) and `analytics_agent/api/agent_manager.py` (AgentManager wrapper).
- File handling utilities: `analytics_agent/api/file_handler.py`.
- Data access helpers used by these endpoints live under `analytics_agent/db/` (queries, repo, models).

If you want, I can:
- generate an OpenAPI/endpoint spreadsheet with parameters and response examples,
- or add path + example curl/HTTPie commands for each endpoint.

