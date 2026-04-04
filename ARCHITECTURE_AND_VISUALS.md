# Architecture & Visual Guide - Supabase Data Integration

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (React/TypeScript)                  │
│                                                                   │
│  ┌──────────────────────┐         ┌──────────────────────────┐   │
│  │  DatasetSelector     │         │  AgentsDataMapping       │   │
│  │  Component           │         │  Component               │   │
│  │                      │         │                          │   │
│  │ - Shows all          │         │ - Shows compatible      │   │
│  │   datasets           │         │   agents                 │   │
│  │ - Checkbox           │         │ - Updates in real-time   │   │
│  │   selection          │────────→│ - Color-coded status     │   │
│  │ - Row counts         │         │ - Compatibility info     │   │
│  │ - Columns preview    │         │                          │   │
│  └──────────────────────┘         └──────────────────────────┘   │
│           │                                │                      │
│           │                                │                      │
│           └────────────────┬───────────────┘                      │
│                            │                                      │
│                   setSelectedDatasets(datasets)                   │
│                            │                                      │
│                            ▼                                      │
│                  ┌────────────────────┐                           │
│                  │   ChatPanel        │                           │
│                  │   (with new field) │                           │
│                  │                    │                           │
│                  │  message:   "..."  │                           │
│                  │  datasets:  [...]  │                           │
│                  └────────────────────┘                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ POST /api/orchestrate
                  │ {
                  │   message: "...",
                  │   selected_datasets: ["campaigns", "events"]
                  │ }
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI/Python)                      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  GET /api/available-datasets                             │   │
│  │  ├─ Queries Supabase tables                              │   │
│  │  ├─ Returns dataset metadata                             │   │
│  │  └─ Caches row counts                                    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  GET /api/agents-data-mapping                            │   │
│  │  └─ Returns hardcoded agent-to-dataset mapping          │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  POST /api/orchestrate                                   │   │
│  │  ├─ Receives message + selected_datasets                │   │
│  │  ├─ Logs dataset selection                              │   │
│  │  ├─ Calls marko_brain.orchestrate(message)              │   │
│  │  └─ Returns analysis with dataset context               │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ Queries available tables
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase (PostgreSQL)                       │
│                                                                   │
│  ┌──────────────┬─────────────┬──────────────┬────────────────┐  │
│  │  campaigns   │    events   │   customers  │  transactions  │  │
│  │  (5K rows)   │  (124K rows)│  (2K rows)   │  (15K rows)    │  │
│  └──────────────┴─────────────┴──────────────┴────────────────┘  │
│                                                                   │
│  + retention table (2K rows)                                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Interaction Flow

```
User Opens App
    │
    ▼
App.tsx useEffect
    │
    ├─ Initializes state: selectedDatasets = []
    │
    ▼
Dashboard Render (activeSection === 'dashboard')
    │
    ├─ Render DatasetSelector component
    │   │
    │   ├─ useEffect: GET /api/available-datasets
    │   │   │
    │   │   └─ Receive: [
    │   │       {name: "campaigns", description: "...", agent_types: [...], ...},
    │   │       {name: "events", description: "...", agent_types: [...], ...},
    │   │       ...
    │   │     ]
    │   │
    │   ├─ Display datasets with checkboxes
    │   │
    │   └─ User clicks checkbox
    │       │
    │       ├─ Update local 'selected' state
    │       │
    │       └─ Call onDatasetsSelected(updated)
    │           │
    │           └─ Updates parent App.tsx selectedDatasets state
    │
    ├─ Render AgentsDataMapping component
    │   │
    │   ├─ useEffect: GET /api/agents-data-mapping
    │   │   │
    │   │   └─ Receive: {
    │   │       "forecast": {
    │   │         name: "Forecast Agent",
    │   │         compatible_datasets: ["campaigns"]
    │   │       },
    │   │       ...
    │   │     }
    │   │
    │   ├─ Receive selectedDatasets from props
    │   │
    │   ├─ Calculate which agents are compatible
    │   │
    │   └─ Render with color coding
    │
    └─ Render ChatPanel
        │
        └─ User types message and sends
            │
            ├─ handleSendMessage called
            │
            ├─ POST /api/orchestrate {
            │   message: "...",
            │   selected_datasets: selectedDatasets  ← IMPORTANT
            │ }
            │
            └─ Backend processes with dataset context
```

## Data Flow Diagram

```
┌─────────────────────┐
│  Supabase Tables    │
└──────────┬──────────┘
           │
           │ (on app load)
           │
           ▼
┌─────────────────────────────────────────────┐
│  GET /api/available-datasets                │
│                                             │
│  For each table:                            │
│  1. Count rows                              │
│  2. Get column names                        │
│  3. Map to agent types                      │
│  4. Create metadata object                  │
└──────────────┬────────────────────────────┘
               │
               │ Returns:
               │ [
               │   {
               │     name: "campaigns",
               │     description: "Campaign performance data...",
               │     agent_types: ["forecast", "scenario", "funnel"],
               │     row_count: 5234,
               │     columns: ["id", "channel", "spend", ...]
               │   },
               │   ...
               │ ]
               │
               ▼
┌──────────────────────────────┐
│  DatasetSelector Component   │
│  Displays all datasets       │
│  Allows user selection       │
└──────────┬───────────────────┘
           │
           │ (user selects datasets)
           │
           ▼
┌──────────────────────────────┐
│  selectedDatasets state      │
│  = ["campaigns", "events"]   │
└──────────┬───────────────────┘
           │
           ├─────────────────────┐
           │                     │
           ▼                     ▼
┌────────────────────┐  ┌──────────────────────┐
│ AgentsDataMapping   │  │ ChatPanel            │
│ shows compatible    │  │ passes datasets to   │
│ agents              │  │ orchestrate endpoint │
└────────────────────┘  └──────┬───────────────┘
                                │
                                │ POST with selected_datasets
                                │
                                ▼
                        ┌──────────────────┐
                        │ Backend received:│
                        │ selected_datasets│
                        │ (logged & used)  │
                        └──────────────────┘
```

## UI Layout Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                        HEADER & SIDEBAR                             │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │           Available Datasets                              [5] │ │
│  │  ────────────────────────────────────────────────────────   │ │
│  │                                                              │ │
│  │  ☑ campaigns (5,234 rows)        [Select all | Clear all]   │ │
│  │  │ Campaign performance data...                             │ │
│  │  │ Agents: forecast, scenario, funnel, roi_forecaster      │ │
│  │  │ ▼ Columns: id, channel, date, spend, impressions...     │ │
│  │  │ ✓ Selected for analysis                                 │ │
│  │  │                                                          │ │
│  │  ☑ events (124,567 rows)                                   │ │
│  │  │ Customer event and interaction data...                  │ │
│  │  │ Agents: funnel, attribution, cohort                    │ │
│  │  │ ▼ Columns: customer_id, timestamp, channel, event_type  │ │
│  │  │ ✓ Selected for analysis                                 │ │
│  │  │                                                          │ │
│  │  ☐ customers (2,000 rows)                                  │ │
│  │    Customer demographic and profile...                     │ │
│  │    Agents: cohort, attribution                             │ │
│  │                                                              │ │
│  │  ☐ retention (2,000 rows)                                  │ │
│  │    Customer retention and churn probability data...        │ │
│  │    Agents: cohort, kpi_validator                           │ │
│  │                                                              │ │
│  │  ☐ transactions (15,234 rows)                              │ │
│  │    Transaction and purchase data...                        │ │
│  │    Agents: attribution, cohort, revenue_attribution        │ │
│  │                                                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │        Agent Data Compatibility                              │ │
│  │  ────────────────────────────────────────────────────────   │ │
│  │                                                              │ │
│  │  Selected datasets will activate compatible agents          │ │
│  │                                                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │ │
│  │  │ [F] Forecast │  │ [S] Scenario │  │ [F] Funnel   │      │ │
│  │  │ Forecasts    │  │ Compares     │  │ Analyzes     │      │ │
│  │  │ future...    │  │ different... │  │ conversion.. │      │ │
│  │  │              │  │              │  │              │      │ │
│  │  │ campaigns    │  │ campaigns    │  │ campaigns    │      │ │
│  │  │ transactions │  │ events       │  │              │      │ │
│  │  │              │  │              │  │              │      │ │
│  │  │ ✓ Ready      │  │ ✓ Ready      │  │ ✓ Ready      │      │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │ │
│  │                                                              │ │
│  │  ┌──────────────┐  ┌──────────────┐                         │ │
│  │  │ [C] Cohort   │  │ [A] Attrib.. │                         │ │
│  │  │ Performs     │  │ Models       │                         │ │
│  │  │ cohort...    │  │ customer...  │                         │ │
│  │  │              │  │              │                         │ │
│  │  │ customers    │  │ events       │                         │ │
│  │  │ transactions │  │ transactions │                         │ │
│  │  │ retention    │  │ customers    │                         │ │
│  │  │ events       │  │              │                         │ │
│  │  │              │  │              │                         │ │
│  │  │ ✓ Ready      │  │ ✓ Ready      │                         │ │
│  │  └──────────────┘  └──────────────┘                         │ │
│  │                                                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   Welcome to Analytics Supervisor              │ │
│  │                                                              │ │
│  │   Select the datasets you want to analyze, then ask         │ │
│  │   about forecasts, scenarios, attribution...                │ │
│  │                                                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      Chat Panel (Right)                       │ │
│  │                                                              │ │
│  │  Message input with send button                             │ │
│  │  (selected_datasets are included in request)                │ │
│  │                                                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## State Management

```
App.tsx State:

selectedDatasets: string[] = []
  └─ Updated by: DatasetSelector.onDatasetsSelected()
  └─ Used by: AgentsDataMapping (for compatibility check)
  └─ Sent in: POST /api/orchestrate request
  └─ Persists: Across new chat sessions

messages: Message[] = []
  └─ Updated by: handleSendMessage()
  └─ Displayed by: MessageList component

currentAnalysis: AnalysisRun | null
  └─ Updated by: orchestrate response
  └─ Displayed by: Dashboard component

activatedAgents: ActivatedAgent[] = []
  └─ Updated by: orchestrate response

executionTimeline: string[] = []
  └─ Updated by: orchestrate response
```

## API Response Examples

### GET /api/available-datasets

```json
{
  "success": true,
  "datasets": [
    {
      "name": "campaigns",
      "description": "Campaign performance data including spend, impressions, clicks, conversions, and revenue",
      "agent_types": ["forecast", "scenario", "funnel", "roi_forecaster"],
      "row_count": 5234,
      "columns": [
        "id", "date", "channel", "campaign_type", "spend",
        "impressions", "clicks", "ctr", "landing_page_views",
        "add_to_cart", "conversion_rate", "purchases", "revenue", "roi"
      ]
    },
    {
      "name": "events",
      "description": "Customer event data including page views, clicks, and interactions",
      "agent_types": ["funnel", "attribution", "cohort"],
      "row_count": 124567,
      "columns": [
        "id", "customer_id", "timestamp", "channel",
        "event_type", "event_value", "session_id"
      ]
    }
  ],
  "timestamp": "2026-04-03T..."
}
```

### GET /api/agents-data-mapping

```json
{
  "success": true,
  "mapping": {
    "forecast": {
      "name": "Forecast Agent",
      "description": "Forecasts future revenue and performance",
      "compatible_datasets": ["campaigns"],
      "icon": "TrendingUp"
    },
    "scenario": {
      "name": "Scenario Agent",
      "description": "Compares different scenarios and budgets",
      "compatible_datasets": ["campaigns", "transactions"],
      "icon": "PieChart"
    }
  },
  "timestamp": "2026-04-03T..."
}
```

### POST /api/orchestrate (with datasets)

Request:
```json
{
  "message": "Forecast revenue for next quarter",
  "selected_datasets": ["campaigns", "transactions"]
}
```

Response:
```json
{
  "success": true,
  "reasoning": "User selected campaigns and transactions. Activated forecast and scenario agents.",
  "intent": {...},
  "activated_agents": [
    {"id": "forecast", "label": "Forecast Agent"},
    {"id": "scenario", "label": "Scenario Agent"}
  ],
  "timeline": [...],
  "payload": {...},
  "result": {...},
  "ui": {...},
  "timestamp": "2026-04-03T..."
}
```

## Color Coding Reference

**DatasetSelector:**
- ☑ Blue checkbox = Selected
- ☐ Gray checkbox = Not selected
- Green bar = Selected indicator
- Blue tags = Compatible agents

**AgentsDataMapping:**
- Blue card = Compatible agent
- Gray card = Incompatible agent (opacity 60%)
- Green badge = Selected dataset
- Gray badge = Not selected dataset

## Performance Notes

- Dataset metadata fetched once on component mount
- Row counts calculated on first load (cached in response)
- Agent mappings are hardcoded (no DB queries)
- No data is sent to frontend, only metadata
- Minimal network overhead

