# Agent Capabilities and Gap Analysis

Date: 2026-04-12
Repository: `Analytics-and-forecasting`

## Executive Summary

This repository already delivers a strong multi-agent marketing analytics foundation: forecasting, scenario planning, funnel analysis, attribution, cohort analysis, budget allocation, orchestration, chat history, result persistence, dataset browsing, and report export.

The biggest gaps are not only in adding more analytics methods, but in trust and production hardening: deterministic routing transparency, strict dataset scoping, security controls (CORS/RBAC/tenant boundaries), testing discipline, and operational monitoring.

If this platform is targeting real marketing teams in production environments, the next priority should be reliability, governance, and explainability over adding more UI features.

---

## 1) Current Capabilities (Verified)

### 1.1 Multi-agent analytics coverage

The system includes specialist agents with concrete outputs:

- Forecasting: KPI projection, confidence score, channel forecast, forecast points, baseline metrics.
  - Evidence: `analytics_agent/agents/forecast_agent.py`, `analytics_agent/state.py` (`ForecastAnalysis`)
- Scenario simulation: best/base/worst case tables, sensitivity curves, channel scenario splits.
  - Evidence: `analytics_agent/agents/scenario_agent.py`, `analytics_agent/state.py` (`ScenarioAnalysis`)
- Funnel diagnostics: stage dropoff analysis, bottleneck detection, uplift opportunity, and chart-ready structures.
  - Evidence: `analytics_agent/agents/funnel_agent.py`, `analytics_agent/state.py` (`FunnelAnalysis`)
- Attribution: first/last/linear/blended channel credit, channel ranking, budget shift recommendation.
  - Evidence: `analytics_agent/agents/attribution_agent.py`, `analytics_agent/state.py` (`AttributionAnalysis`)
- Cohort and retention analytics: average LTV, repeat purchase rate, churn risk, segment-level patterns.
  - Evidence: `analytics_agent/agents/cohort_agent.py`, `analytics_agent/state.py` (`CohortAnalysis`)
- Budget allocation: objective-driven spend allocation with risk profile and constraints.
  - Evidence: `analytics_agent/agents/budget_allocator_agent.py`, `analytics_agent/state.py` (`BudgetAllocationAnalysis`)

### 1.2 Supervisor orchestration and planning

- LLM-guided planning supports conversation vs analysis mode, intent classification, and selected agent list.
  - Evidence: `analytics_agent/api/orchestrator.py` (`_plan_with_llm`, `_fallback_plan`)
- Policy layer resolves executable agents with intent defaults and required-agent enforcement.
  - Evidence: `analytics_agent/api/orchestrator.py` (`_resolve_execution_plan`, `INTENT_DEFAULT_AGENTS`, `INTENT_REQUIRED_AGENTS`)
- Clarification loop supports multi-turn parameter completion and per-thread state.
  - Evidence: `analytics_agent/api/orchestrator.py` (`clarification_states`, `_detect_clarification_needed`)
- Results lookup flow lets users ask to read previous agent outputs.
  - Evidence: `analytics_agent/api/orchestrator.py` (`_build_results_lookup_response`)

### 1.3 API product surface

Core API endpoints already exist for:

- Chat and orchestration: `/api/chat`, `/api/orchestrate`
- Legacy analytics: `/api/analyze`, `/api/budget-sensitivity`, `/api/break-even`, `/api/ltv-projection`, `/api/cfo-mode`
- Data control: `/api/available-datasets`, `/api/datasets/{dataset}` (+ rows/upload)
- Agent orchestration/reporting: `/agents/orchestrate`, `/agents/report/generate`, `/agents/results`, `/agents/history`, `/agents/status`
- Forecast operations: `/agents/forecast/train`, `/agents/forecast/predict`
- Budget allocator execution: `/agents/budget/allocate`
  - Evidence: `analytics_agent/api/app.py`

### 1.4 Persistence and data integration

- Threaded chat persistence with per-client threads/messages.
  - Evidence: `analytics_agent/db/chat_history_repo.py`, `SUPABASE_INIT.sql`
- Client-level latest agent outputs and executive snapshot persistence.
  - Evidence: `analytics_agent/db/agent_results_repo.py`, `SUPABASE_INIT.sql`
- Data can be pulled from Supabase with local CSV fallback.
  - Evidence: `analytics_agent/db/queries.py`

### 1.5 Frontend workspace coverage

- Dedicated workspaces for supervisor, forecast, scenario, funnel, cohort, attribution, budget allocator, and report generation.
  - Evidence: `frontend/src/App.tsx`, `frontend/src/components/*`
- Thread history browsing and reuse in UI.
  - Evidence: `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`

---

## 2) Key Flaws, Risks, and Improvement Needs

### P0 - High Severity (trust, correctness, production risk)

1. Open CORS policy in production path
- `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]` is permissive.
- Risk: broad cross-origin access; weak enterprise security posture.
- Evidence: `analytics_agent/api/app.py`

2. Selected dataset control is not enforced in execution path
- `selected_datasets` is accepted and logged but not propagated into orchestrator/agent query policy.
- Risk: analysis may use non-selected data, reducing governance trust.
- Evidence: `analytics_agent/api/app.py` (`ChatRequest`, `orchestrate_request`), `analytics_agent/api/orchestrator.py`, `analytics_agent/agents/*`

3. Hardcoded synthetic base payload in supervisor flow
- `_build_base_payload()` injects static sample data before execution.
- Risk: accidental blending with real intent inputs and confusing reproducibility.
- Evidence: `analytics_agent/api/orchestrator.py` (`_build_base_payload`)

4. Test coverage effectively absent
- No backend/frontend test files found and `pytest.ini` is empty.
- Risk: regressions in orchestration, schema contracts, and agent outputs.
- Evidence: repository test scan, `pytest.ini`

5. Security and tenancy model not enforced in API path
- Client identity is mostly optional (`anonymous-client` fallback), no explicit RBAC/tenant authorization checks in agent/data routes.
- Risk: weak enterprise isolation and auditability.
- Evidence: `analytics_agent/api/app.py`, `analytics_agent/db/*`

### P1 - Medium Severity (predictability, UX trust, maintainability)

6. API surface fragmentation and overlapping aliases
- Mixed `/api/...`, `/agents/...`, and duplicated alias routes increase integration complexity.
- Evidence: `analytics_agent/api/app.py`

7. Orchestrator requested agent list may differ from executed policy output
- Non-supported planned agents are dropped; defaults/required agents are injected.
- This is valid behavior but not strongly exposed as a first-class audit log contract.
- Evidence: `analytics_agent/api/orchestrator.py` (`_resolve_execution_plan`, `execution_trace`)

8. UI execution timeline is presentation-timer driven
- Supervisor pipeline animation is time-based and independent from backend task-level state streaming.
- Risk: transparency mismatch under failures/slow paths.
- Evidence: `frontend/src/components/supervisor/SupervisorWorkspace.tsx`

9. Data source-of-truth behavior can vary by call path
- Some query helpers prioritize local CSV, others remote-first.
- Risk: inconsistent behavior across environments and endpoints.
- Evidence: `analytics_agent/db/queries.py`

10. Empty production readiness artifact
- `PRODUCTION_READINESS.md` exists but has no operational checklist.
- Evidence: `PRODUCTION_READINESS.md`

### P2 - Product/Maturity Gaps (value scaling)

11. Recommendation system lacks closed-loop outcome tracking
- Recommendations are generated but no acceptance/execution/outcome feedback loop.
- Evidence: `analytics_agent/agents/orchestrator_agent.py`, `analytics_agent/db/agent_results_repo.py`

12. Forecast/model ops missing monitoring lifecycle
- Train/predict routes exist, but no explicit model registry/versioning, drift alarms, or segment-level error dashboards.
- Evidence: `analytics_agent/api/app.py`, `analytics_agent/agents/forecast_agent.py`

13. Reporting outputs are document-export focused, but governance and scheduling workflows are minimal
- Export is available, but no approval lifecycle, scheduled delivery, or report audit trail policy.
- Evidence: `analytics_agent/api/app.py` (`/agents/report/generate`), `frontend/src/components/report/ReportWorkspace.tsx`

---

## 3) Additional Capabilities Needed (Detailed)

### 3.1 Data governance and trust architecture

Must add:
- Hard enforcement of dataset scope (`selected_datasets`) through orchestrator -> agent manager -> query layer.
- Dataset contracts: schema checks, freshness SLA, null/outlier anomaly monitoring.
- Data lineage per result: which dataset, source (local/supabase), row count, timestamp.

Why it matters:
- Marketing teams need reproducible and auditable outputs for budget decisions.

### 3.2 Enterprise security and access controls

Must add:
- Tenant isolation and role-based access checks on all critical endpoints.
- Environment-aware CORS allowlist and stricter auth guardrails.
- Audit logs for data access, orchestration runs, report generation, and downloads.

Why it matters:
- Enterprise procurement and compliance require explicit controls, not implicit conventions.

### 3.3 Deterministic orchestration and explainability

Must add:
- Explicit plan contract (planned agents, policy adjustments, final DAG).
- Run-state telemetry (queued/running/success/failed per agent, timings, failures).
- Explainability cards in UI: assumptions, caveats, confidence drivers, data source.

Why it matters:
- Teams trust systems that explain both output and process.

### 3.4 Forecast/scenario scientific rigor

Must add:
- Backtesting and forecast error reporting by segment/channel.
- Drift detection and retraining policies.
- Better uncertainty decomposition and optional causal/incrementality support.

Why it matters:
- Forecast value decays quickly without ongoing validation and recalibration.

### 3.5 Activation and workflow fit for marketers

Must add:
- Playbooks for launch/mid-flight/post-mortem workflows.
- Role-specific summaries (CMO vs channel manager vs CRM owner).
- Task/collaboration integrations (Jira/Asana/Notion) for actionability.

Why it matters:
- Insight without operational follow-through has low ROI.

---

## 4) Capability Matrix (Now vs Needed)

| Domain | Current State | Needed State |
| --- | --- | --- |
| Analytics breadth | Strong (forecast, scenario, funnel, attribution, cohort, budget allocator) | Add robustness checks, incrementality, and model ops |
| Orchestration | LLM planning + policy fallback + clarification | Deterministic DAG contract + per-agent live status |
| Data control | Dataset APIs and mapping available | Enforced dataset policy + lineage + quality SLAs |
| Security | Google auth endpoint + basic client_id handling | Tenant RBAC, strict CORS, endpoint authorization, audits |
| Persistence | Chat + latest results snapshot persistence | Full run history with reproducibility metadata |
| Reporting | Report generation and export (pdf/doc) | Governance workflows, scheduling, approvals, role templates |
| Testing | Minimal/none visible | Contract, integration, and regression suite in CI |

---

## 5) Prioritized Improvement Roadmap

### Next 30 days (foundation hardening)

1. Enforce `selected_datasets` end-to-end in orchestration and query methods.
2. Remove or isolate synthetic `_build_base_payload()` for production paths.
3. Restrict CORS by environment and define secure defaults.
4. Add baseline tests for orchestration, API contracts, and each specialist agent smoke path.
5. Fill `PRODUCTION_READINESS.md` with go-live checklist, SLOs, rollback, incident process.

### 31-90 days (quality and observability)

1. Add per-agent execution telemetry and UI state synchronization.
2. Standardize versioned API surface (`/v1`) and deprecate duplicates.
3. Implement recommendation prioritization schema (impact/confidence/effort/owner).
4. Add forecast quality dashboard (MAPE/MAE by channel/segment).

### 90-180 days (enterprise and moat)

1. Add RBAC + tenant model + audit trails.
2. Build closed-loop learning from recommendations to measured KPI outcomes.
3. Deliver role-based report templates and scheduled report delivery.
4. Add proactive anomaly alerts (CAC spike, CVR drop, channel waste).

---

## 6) Quick Wins (High ROI, Low-to-Medium Effort)

1. Add strict CORS env configuration and disable wildcard in non-dev.
2. Add `execution_trace` display in frontend for every orchestrated run.
3. Add dataset source and row-count metadata to every agent output card.
4. Add lightweight tests: one success + one failure case per major endpoint.
5. Consolidate endpoint aliases in docs and mark one canonical route per capability.

---

## 7) Recommended Success Metrics

Track these as product-quality KPIs:

- Trust and governance
  - Dataset-scope violations (target: 0)
  - % outputs with lineage metadata
  - Security findings count
- Quality and reliability
  - API error rate, run failure rate
  - Forecast error trend (MAPE/MAE)
  - Deterministic routing consistency on repeated prompts
- Adoption and impact
  - Recommendation acceptance rate
  - Time-to-insight and time-to-action
  - Report generation/reuse frequency

---

## 8) Bottom Line

This codebase is already strong in analytics feature breadth and modular agent design. The critical next step is to convert it from a capable demo/product prototype into a trusted production decision system through governance, determinism, security, and testing discipline.

