c# Agent Capabilities (Current State)

Last verified: 2026-04-15
Repository: `Analytics-and-forecasting`

This document describes the capabilities that are currently implemented in the codebase today.

## 1) Core Analytics and Decision Intelligence

### 1.1 Specialist analytics agents (Supabase-first)

The agent system includes six specialist analytics agents coordinated by a central orchestrator:

- **Forecast Agent**
  - Produces KPI projections (revenue/profit/ROI/spend/clicks/purchases/impressions/CTR/CVR)
  - Generates `forecast_points` time-series and `channel_forecast` breakdowns
  - Computes confidence score from data volume, model availability, and date coverage
  - Supports scenario knobs: spend, CTR lift, conversion lift, CPC change, AOV change, seasonality
  - Can run with or without a trained model (`forecast_model.pkl`)

- **Scenario Agent**
  - Builds best/base/worst scenario outputs
  - Creates scenario table, projection curve, sensitivity curve, and channel scenario split
  - Applies controllable base assumptions (spend/CTR/conversion/AOV/seasonality)

- **Funnel Agent**
  - Builds funnel from campaign stage metrics or event stream fallback
  - Detects largest dropoff stage and computes dropoff percentages
  - Estimates conversion uplift and recovered purchases if leakage is reduced
  - Produces chart-ready outputs (primary funnel, waterfall, channel comparison, segment comparison, stage-time, revenue opportunity, uplift scenarios)

- **Attribution Agent**
  - Supports attribution models: `linear`, `first_click`, `last_click`, `time_decay`
  - Computes per-channel credit and blended revenue weighting
  - Ranks channels on metric objective (`revenue`, `roas`, `roi`, `cac`, `cpa`, `conversions`)
  - Generates budget-shift recommendation with cap enforcement
  - Produces attribution visualization structures (model credit, touchpoint positions, budget scenario, efficiency, conversion quality)

- **Cohort Agent**
  - Performs retention and churn analytics from customer + retention + transaction datasets
  - Computes average LTV, repeat purchase rate, retention curves, churn risk
  - Produces segment breakdown, cohort curves/table, signup channel value, and churn-risk action list
  - Supports filter controls (segment, signup channel, contract type, date windows, tenure and churn thresholds)

- **Budget Allocator Agent**
  - Creates constrained allocation plans by objective and risk profile
  - Supports `profit`, `revenue`, `roas`, `new_customers` objectives
  - Supports `conservative`, `balanced`, `aggressive` profiles
  - Enforces max shift and channel min/max bounds
  - Returns expected KPI delta, ROI delta, confidence band, channel-level recommendations, and constraint log

### 1.2 Cross-agent synthesis

After specialist execution, orchestrator synthesis provides:

- Cross-agent recommendations list (budget shift, funnel fix, segment retention, top allocation)
- Executive summary combining forecast, attribution, funnel, cohort, and scenario highlights

## 2) Orchestration and Conversation Capabilities

### 2.1 Supervisor orchestration

The `AnalyticsSupervisor` supports:

- LLM-guided plan generation (`conversation` vs `analysis` mode)
- Intent detection and policy-driven agent approval
- Required/default agent enforcement per intent
- Unsupported-agent filtering and execution trace notes
- Clarification loop for missing parameters (multi-turn, thread-scoped)
- Results-lookup mode for previously stored agent outputs
- UI payload generation (`workspace cards`, `insights panel`, confidence/warnings/suggestions)

### 2.2 Execution management

`AgentManager` capabilities include:

- Running selected agents through `OrchestratorAgent`
- Returning both nested (`agent_results`) and flattened analysis payloads
- In-memory execution history and latest per-agent result cache
- Agent status endpoint support (including forecast model-loaded indicator)
- Forecast model training passthrough to Forecast Agent

## 3) Legacy Deterministic Analytics Pipeline (Still Available)

In parallel to the specialist-agent architecture, the legacy LangGraph pipeline remains available via `AnalyticsRunner`:

- Pipeline nodes: KPI validation, CAC/ROAS estimation, ROI forecasting, scenario modeling, conditional cohort, funnel, attribution, assumption scoring, suggestions
- Utility methods:
  - `run()` full pipeline result
  - `budget_sensitivity()` multi-budget comparison
  - `break_even()` minimum ROAS and CVR thresholds
  - `ltv_projection()` monthly and cumulative LTV projection
  - `cfo_mode()` executive summary + optional board explanation
- Exposed capabilities list from graph:
  - `ROI forecasting`
  - `CAC/ROAS estimation`
  - `Scenario modeling`
  - `KPI definition`

## 4) API Product Surface

### 4.1 Health and auth

- Health check endpoint with service readiness metadata
- Google ID token verification and client-id derivation

### 4.2 Conversational + orchestration APIs

- Chat endpoint with thread continuity and assistant response persistence
- Supervisor orchestration endpoint with activated agents, timeline, payload, result, and UI contract

### 4.3 Direct analytics APIs

- Full analysis run
- Budget sensitivity analysis
- Break-even analysis
- LTV projection
- CFO mode
- Capabilities discovery endpoint (`/api/capabilities`)

### 4.4 Agent APIs

- Multi-agent orchestration endpoint
- Agent report generation endpoint (executive/detailed, PDF/DOC)
- Agent status/results/history retrieval
- Forecast train and predict operations
- Budget allocation endpoint

### 4.5 Dataset and filter APIs

- Dataset catalog with row counts and schema metadata
- Dataset row retrieval, row upsert, CSV upload upsert
- Agent-to-dataset compatibility mapping endpoint
- Agent filter-option endpoints for funnel, forecast, attribution, scenario, cohort, and budget allocator

### 4.6 Recommendation lifecycle APIs

- Recommendation outcomes listing
- Recommendation outcome upsert with lifecycle status tracking (`pending`, `accepted`, `in_progress`, `implemented`, `rejected`)

### 4.7 File management APIs

- Upload files linked to agent IDs
- List files per agent
- Fetch file metadata by ID
- Delete files and associated storage artifacts

## 5) Data Integration and Data Access

### 5.1 Dataset coverage

Supported datasets:

- `campaigns`
- `customers`
- `events`
- `retention`
- `transactions`

### 5.2 Source behavior

- Supabase remote data retrieval is supported for all primary datasets
- Local CSV fallback is implemented in query helpers
- Several specialist options endpoints are intentionally Supabase-first and fail when remote data is unavailable (notably attribution/forecast/scenario/budget/cohort options)

### 5.3 Dataset operations

- Generic dataset dataframe retrieval with optional `prefer_remote`
- Dataset retrieval with explicit source tag (`supabase`, `local`, `empty`)
- Supabase upsert helpers with dataset-specific conflict keys

## 6) Persistence and State Management

### 6.1 Conversation persistence

- Thread creation/retrieval by client
- Message append with metadata and compatibility retries for legacy schemas
- Recent message windows and full message history retrieval

### 6.2 Agent-result persistence

- Upsert latest per-client per-agent result payloads
- Upsert latest per-client snapshot (recommendations + executive summary)
- Retrieve all or single-agent latest stored payloads

### 6.3 Recommendation outcome persistence

- Supabase-backed recommendation outcome persistence
- In-memory fallback store for resilience when Supabase is unavailable

### 6.4 Relational metadata store

- SQLAlchemy metadata for files/agents and associations
- Local DB bootstrap during app lifespan initialization

## 7) Reporting and Export Capabilities

- Report generation from selected agent outputs
- Report type modes: `executive`, `detailed`
- Export formats: `pdf`, `doc`
- Gemini-backed narrative generation when available
- Deterministic fallback report text when LLM output is unavailable
- Embedded base64 file delivery through API

## 8) AI Augmentation Capabilities

- Gemini integration via modern SDK (`google-genai`) with legacy SDK fallback (`google-generativeai`)
- Used in:
  - Supervisor planning
  - Final response generation
  - Legacy pipeline summaries
  - CFO board explanation
  - Report generation
- Graceful degrade behavior: returns deterministic/fallback outputs when Gemini is unavailable

## 9) Frontend-Consumable Output Contracts

The backend currently returns rich, chart-ready and UI-ready structures for:

- Forecast trend and channel forecasts
- Scenario comparisons and sensitivity curves
- Funnel diagnostics and opportunity charts
- Attribution ranking and budget scenarios
- Cohort retention/churn structures
- Budget allocation plans with alternatives
- Supervisor timeline and workspace/insights card contracts

## 10) Operational and Runtime Capabilities

- FastAPI lifespan initialization for database and core services
- Structured logging usage across services
- Config-driven app version exposure in health endpoint
- CORS middleware support (currently permissive)

## 11) Primary Evidence (Code Pointers)

- `analytics_agent/agents/orchestrator_agent.py`
- `analytics_agent/agents/forecast_agent.py`
- `analytics_agent/agents/scenario_agent.py`
- `analytics_agent/agents/funnel_agent.py`
- `analytics_agent/agents/attribution_agent.py`
- `analytics_agent/agents/cohort_agent.py`
- `analytics_agent/agents/budget_allocator_agent.py`
- `analytics_agent/api/orchestrator.py`
- `analytics_agent/api/agent_manager.py`
- `analytics_agent/api/app.py`
- `analytics_agent/analytics_runner.py`
- `analytics_agent/graph.py`
- `analytics_agent/db/queries.py`
- `analytics_agent/db/chat_history_repo.py`
- `analytics_agent/db/agent_results_repo.py`
- `analytics_agent/db/recommendation_outcomes_repo.py`
- `analytics_agent/clients/gemini_client.py`
- `analytics_agent/clients/supabase_client.py`

