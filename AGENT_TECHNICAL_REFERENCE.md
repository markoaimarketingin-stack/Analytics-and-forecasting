# Agent System Technical Reference

## Architecture Overview

The agent system uses a **Coordinator-Specialist pattern**:

```
┌─────────────────────┐
│  User Request       │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────┐
│ AnalyticsSupervisor      │ (Coordinator)
│ - Parses intent          │
│ - Routes to agents       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ AgentManager             │ (Orchestrator)
│ - Manages agents         │
│ - Executes agents        │
│ - Stores results         │
└──────────┬───────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
[Agents]    [Results Store]
```

---

## Class Hierarchy

### AnalyticsSupervisor

```python
class AnalyticsSupervisor:
    def __init__(analytics_runner, gemini_client)
    
    # Main entry point
    def orchestrate(message: str) -> Dict
    
    # Planning with LLM
    def _plan_with_llm(message: str) -> Dict
    def _fallback_plan(message: str) -> Dict
    
    # Payload management
    def _build_base_payload() -> Dict
    def _apply_payload_updates(payload, updates) -> Dict
    
    # Agent mapping
    def _map_agents(agent_ids: List[str]) -> List[Dict]
    
    # Execution
    def _execute(intent: str, payload: Dict) -> Dict
    def _execute_legacy(intent: str, payload: Dict) -> Dict
    
    # Response generation
    def _generate_final_response(...) -> str
    def _build_ui_layout(...) -> Dict
```

**Key Change**: Now initializes and uses `AgentManager` for specialist agent execution.

---

### AgentManager

```python
class AgentManager:
    def __init__()
    
    # Main orchestration
    def orchestrate(intent, agents_to_run, payload) -> Dict
    
    # Agent execution dispatcher
    def _execute_agent(agent_id, payload) -> Dict
    
    # Individual agent executors
    def _run_forecast_agent(payload) -> Dict
    def _run_cohort_agent(payload) -> Dict
    def _run_attribution_agent(payload) -> Dict
    def _run_funnel_agent(payload) -> Dict
    def _run_scenario_agent(payload) -> Dict
    
    # Result management
    def get_agent_results(agent_id=None) -> Dict
    def get_execution_history(limit=10) -> List[Dict]
    def get_agent_status() -> Dict[str, Dict]
    
    # Training
    def train_forecast_agent() -> Dict
    
    # Cleanup
    def clear_results(agent_id=None)
```

**Attributes**:
- `forecast_agent`: ForecastAgent instance
- `cohort_agent`: CohortAgent instance
- `attribution_agent`: AttributionAgent instance
- `funnel_agent`: FunnelAgent instance
- `scenario_agent`: ScenarioAgent instance
- `agent_results`: Dict[str, Dict] - Stores results for discussion
- `execution_history`: List[Dict] - Execution audit trail

---

### Agent Base Classes

Each agent follows the same pattern:

```python
@dataclass
class XyzRequest:
    """Request parameters for the agent"""
    param1: str
    param2: float
    # ...

class XyzAgent:
    def __init__()
    
    # Main method
    def analyze(request: XyzRequest) -> Dict[str, Any]
    
    # Helper methods
    def _method1() -> Any
    def _method2() -> Any
```

---

## Data Flow

### 1. Request Path

```
User Message
    ↓
AnalyticsSupervisor.orchestrate()
    ↓
LLM Planning (Gemini)
    ↓
Intent + Agents determined
    ↓
AgentManager.orchestrate()
    ↓
For each agent:
    - AgentManager._execute_agent()
    - Agent.analyze()/predict()
    - Results stored in agent_results
    ↓
Aggregated Results
    ↓
Response to Frontend
```

### 2. Result Storage Path

```
Agent Execution
    ↓
Result generated
    ↓
Stored in: agent_results[agent_id]
    ↓
Also added to: execution_history
    ↓
Available for later retrieval
```

### 3. Result Retrieval Path

```
User: "Show me previous results"
    ↓
GET /agents/results?agent_id=forecast
    ↓
AgentManager.get_agent_results(agent_id)
    ↓
Returns: agent_results[agent_id]
    ↓
Frontend displays stored results
```

---

## Intent Mapping

The orchestrator maps user intents to agent execution plans:

```python
INTENT_TO_AGENTS = {
    "forecast": ["forecast"],
    "scenario_forecast": ["scenario", "forecast"],
    "funnel_analysis": ["funnel"],
    "attribution_analysis": ["attribution"],
    "cohort_analysis": ["cohort"],
    "dashboard": ["forecast", "funnel", "attribution", "cohort"],
    "report_generation": ["forecast", "funnel", "attribution", "cohort"],
    "budget_optimization": ["scenario"],
    "break_even": ["scenario"],
    "ltv_projection": ["cohort"],
    "executive_summary": ["forecast", "scenario", "cohort"],
}
```

---

## Request/Response Structures

### Forecast Agent

**Request**:
```python
@dataclass
class ForecastRequest:
    channel: str
    campaign_type: str
    spend: float
    impressions: int
    ctr: float
    conversion_rate: float
    horizon_days: int = 30
```

**Response**:
```python
{
    "predicted_roi": float,
    "predicted_revenue": float,
    "predicted_profit": float,
    "predicted_clicks": int,
    "predicted_purchases": int,
    "retention_adjustment": {
        "available": bool,
        "average_churn_probability": float,
        "average_retention": float,
        "future_revenue_multiplier": float,
    },
    "daily_forecast": [
        {
            "day": int,
            "forecast_spend": float,
            "forecast_roi": float,
            "forecast_revenue": float,
            "forecast_profit": float,
        },
        ...
    ],
    "top_drivers": [
        {
            "feature": str,
            "importance": float,
        },
        ...
    ],
}
```

### Cohort Agent

**Request**:
```python
@dataclass
class CohortRequest:
    cohort_period: str = "week"  # 'week', 'month', 'quarter'
    metric: str = "retention"    # 'retention', 'revenue', 'engagement'
```

**Response** (to be implemented):
```python
{
    "cohort_analysis": {...},
    "retention_rates": {...},
    "ltv_by_cohort": {...},
    # ... more fields
}
```

### Attribution Agent

**Request**:
```python
@dataclass
class AttributionRequest:
    model: str = "last_click"  # 'last_click', 'first_click', 'linear', 'time_decay'
    metric: str = "conversions"  # 'conversions', 'revenue', 'engagement'
```

**Response** (to be implemented):
```python
{
    "channel_attribution": {...},
    "touchpoint_analysis": {...},
    "roi_by_channel": {...},
    # ... more fields
}
```

### Funnel Agent

**Request**:
```python
@dataclass
class FunnelRequest:
    channel: str | None = None
    campaign_type: str | None = None
    time_period: str = "month"  # 'day', 'week', 'month'
```

**Response** (to be implemented):
```python
{
    "stages": [...],
    "dropoff_rates": [...],
    "bottlenecks": [...],
    # ... more fields
}
```

### Scenario Agent

**Request**:
```python
@dataclass
class ScenarioRequest:
    base_spend: float
    adjustments: Dict[str, float]  # e.g., {'spend_change': 0.20}
    scenario_name: str = "scenario_1"
```

**Response** (to be implemented):
```python
{
    "scenarios": {...},
    "projections": {...},
    "risk_assessment": {...},
    # ... more fields
}
```

---

## Error Handling

### AgentManager Error Handling

```python
try:
    result = agent.analyze(request)
    execution_log["results"][agent_id] = result
except NotImplementedError as e:
    # Expected for skeleton agents
    execution_log["errors"][agent_id] = f"Agent not yet implemented: {str(e)}"
    execution_log["results"][agent_id] = {
        "status": "not_implemented",
        "message": str(e)
    }
except Exception as e:
    # Unexpected errors
    execution_log["errors"][agent_id] = str(e)
    execution_log["results"][agent_id] = {
        "status": "error",
        "error": str(e)
    }
```

### API Error Handling

```python
try:
    result = agent_manager.orchestrate(...)
    return {"success": True, "data": result, ...}
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```

---

## Result Storage and Retrieval

### Storage Mechanism

Results are stored in `AgentManager.agent_results` dictionary:

```python
self.agent_results: Dict[str, Dict[str, Any]] = {
    "forecast": {
        "status": "success",
        "agent": "forecast",
        "data": {...}
    },
    "cohort": {
        "status": "not_implemented",
        "message": "..."
    },
    # ...
}
```

### Retrieval

```python
# Get specific agent results
results = agent_manager.get_agent_results("forecast")

# Get all results
all_results = agent_manager.get_agent_results()

# Results available immediately after execution
# Can be accessed anytime before they're cleared
```

### Execution History

```python
execution_history: List[Dict[str, Any]] = [
    {
        "intent": "forecast",
        "agents_requested": ["forecast"],
        "timestamp": "2026-04-03T...",
        "results": {...},
        "errors": {},
        "duration_ms": 1234
    },
    # ... more executions
]
```

---

## Forecast Agent Implementation Details

### Model: CatBoost Regressor

**Configuration**:
```python
CatBoostRegressor(
    iterations=500,      # Number of boosting iterations
    depth=6,             # Tree depth
    learning_rate=0.05,  # Learning rate
    loss_function="RMSE", # Loss function
    verbose=False,       # No console output
)
```

### Features (13 total)

```python
FEATURE_COLUMNS = [
    "channel",                # Categorical: e.g., "Google Ads"
    "campaign_type",          # Categorical: e.g., "Conversion"
    "spend",                  # Continuous: Campaign spend
    "impressions",            # Continuous: Number of impressions
    "clicks",                 # Continuous: Number of clicks
    "ctr",                    # Continuous: Click-through rate
    "landing_page_views",     # Continuous: LPV count
    "add_to_cart",            # Continuous: ATC count
    "conversion_rate",        # Continuous: Conversion rate
    "purchases",              # Continuous: Purchase count
    "month",                  # Categorical: Month (1-12)
    "quarter",                # Categorical: Quarter (1-4)
    "is_weekend",             # Categorical: 0 or 1
]

CATEGORICAL_COLUMNS = ["channel", "campaign_type"]
```

### Training Data Preparation

```python
def _prepare_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    # Parse dates
    df["date"] = pd.to_datetime(df["date"])
    
    # Extract temporal features
    df["month"] = df["date"].dt.month
    df["quarter"] = df["date"].dt.quarter
    df["is_weekend"] = (df["date"].dt.dayofweek >= 5).astype(int)
    
    # Handle missing values
    df = df.fillna(0)
    
    return df
```

### Training Process

```python
1. Load campaign data from Supabase
2. Prepare features (13 columns)
3. Split: 80% train, 20% test
4. Train CatBoost with categorical features
5. Evaluate: RMSE and MAE metrics
6. Save model to: analytics_agent/models/forecast_model.pkl
```

### Prediction Process

```python
1. Calculate derived metrics:
   - clicks = impressions * ctr
   - landing_page_views = clicks * 0.65
   - add_to_cart = lpv * 0.18
   - purchases = atc * conversion_rate

2. Add temporal features:
   - month = current month
   - quarter = current quarter
   - is_weekend = current day

3. Create feature vector (13 dimensions)

4. Predict ROI using model

5. Calculate metrics:
   - revenue = spend * (1 + roi)
   - profit = revenue - spend

6. Generate forecast curve (daily projections)

7. Apply retention adjustments
```

### Forecast Curve Generation

```python
for day in 1..horizon_days:
    # Apply daily growth
    growth_factor = 1 + (0.0025 * day)  # 0.25% daily growth
    
    # Apply seasonality
    seasonal_factor = 1.10 if day % 7 in [5,6] else 1.0  # 10% weekend boost
    
    # Calculate metrics
    spend = base_spend * growth_factor
    roi = base_roi * seasonal_factor
    revenue = spend * (1 + roi)
    profit = revenue - spend
    
    # Store result
    forecast_curve.append({
        "day": day,
        "forecast_spend": spend,
        "forecast_roi": roi,
        "forecast_revenue": revenue,
        "forecast_profit": profit,
    })
```

---

## Extending the System

### Adding a New Agent

1. **Create agent file**:
   ```python
   # analytics_agent/agents/new_agent.py
   
   @dataclass
   class NewRequest:
       param1: str
       param2: float
   
   class NewAgent:
       def __init__(self):
           pass
       
       def analyze(self, request: NewRequest) -> Dict[str, Any]:
           # Implementation
           return {...}
   ```

2. **Add to AgentManager**:
   ```python
   # In __init__
   self.new_agent = NewAgent()
   
   # Add executor method
   def _run_new_agent(self, payload: Dict) -> Dict:
       request = NewRequest(...)
       result = self.new_agent.analyze(request)
       return {"status": "success", "agent": "new", "data": result}
   
   # Add to _execute_agent dispatcher
   elif agent_id == "new":
       return self._run_new_agent(payload)
   ```

3. **Update intent mapping**:
   ```python
   INTENT_TO_AGENTS = {
       "new_analysis": ["new"],
       "dashboard": ["...", "new"],
       # ...
   }
   ```

4. **Add API endpoint** (optional):
   ```python
   @app.post("/agents/new/analyze")
   async def analyze_new(payload: dict):
       result = marko_brain.agent_manager.orchestrate(
           intent="new_analysis",
           agents_to_run=["new"],
           payload=payload,
       )
       return {"success": True, "data": result, ...}
   ```

---

## Performance Considerations

### Result Caching

- Agent results are automatically cached in `agent_results` dict
- No need to re-execute agents for same request
- Reduces latency for repeated requests

### Execution History

- Limited to in-memory list
- Recommended limit: Last 100 executions
- Can be persisted to database for long-term auditing

### Parallel Execution

- Currently sequential (one agent after another)
- Future: Implement parallel execution for independent agents
- Would require async/await implementation

### Model Loading

- Forecast model loaded once at AgentManager init
- Subsequent predictions reuse same model
- No reload overhead for multiple predictions

---

## Debugging

### Check Agent Status

```python
status = agent_manager.get_agent_status()
print(status)
# Shows: ready/not_implemented, model_loaded, last_execution
```

### View Execution History

```python
history = agent_manager.get_execution_history(limit=10)
for execution in history:
    print(f"Intent: {execution['intent']}")
    print(f"Agents: {execution['agents_requested']}")
    print(f"Errors: {execution['errors']}")
    print(f"Duration: {execution['duration_ms']}ms")
```

### Retrieve Agent Results

```python
results = agent_manager.get_agent_results("forecast")
if results:
    print(results["data"]["predicted_roi"])
else:
    print("No results for forecast agent")
```

### Handle Errors

```python
# Check agent_results for error details
result = agent_results.get("forecast", {})
if result.get("status") == "error":
    print(f"Error: {result.get('error')}")
elif result.get("status") == "not_implemented":
    print(f"Not implemented: {result.get('message')}")
else:
    # Use result.get("data")
    pass
```

---

## Testing

### Unit Tests

```python
def test_forecast_agent_prediction():
    agent = ForecastAgent()
    # Load model first
    request = ForecastRequest(...)
    result = agent.predict_campaign(request)
    assert "predicted_roi" in result
    assert result["predicted_roi"] > 0

def test_agent_manager_orchestration():
    manager = AgentManager()
    result = manager.orchestrate(
        intent="forecast",
        agents_to_run=["forecast"],
        payload={...}
    )
    assert result["success"]
    assert "forecast" in result["agent_results"]
```

### Integration Tests

```python
def test_api_forecast_endpoint():
    response = client.post(
        "/agents/forecast/predict",
        json={...}
    )
    assert response.status_code == 200
    assert response.json()["success"]
```

---

## Monitoring

### Metrics to Track

- Agent execution time (duration_ms)
- Success/failure rate by agent
- Most common intents
- Execution history length
- Model prediction accuracy (RMSE, MAE)

### Alerts

- Agent execution > 5 seconds
- Agent failure rate > 5%
- Model accuracy degradation
- Model not loaded for forecast agent

---

**Technical implementation complete and ready for integration!** ✅

