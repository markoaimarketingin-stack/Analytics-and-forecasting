# Agent System Quick Start Guide

## Overview

The Analytics system now has a complete multi-agent orchestration architecture. Users can:
1. Request specific analytics (forecasts, funnel analysis, etc.)
2. Agents execute and store results
3. Discuss results with the system later
4. View execution history and agent status

---

## Quick Start: 3 Steps

### Step 1: Train the Forecast Model
```bash
curl -X POST http://localhost:8000/agents/forecast/train
```

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "trained",
    "rows": 250,
    "rmse": 0.1234,
    "mae": 0.0987
  },
  "message": "Forecast model trained successfully"
}
```

### Step 2: Make a Forecast Prediction
```bash
curl -X POST http://localhost:8000/agents/forecast/predict \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "Google Ads",
    "campaign_type": "Conversion",
    "spend": 10000,
    "impressions": 50000,
    "ctr": 0.12,
    "conversion_rate": 0.08,
    "horizon_days": 30
  }'
```

**Response**: Includes ROI, revenue, daily forecasts, and top drivers

### Step 3: Retrieve Stored Results for Discussion
```bash
curl -X GET "http://localhost:8000/agents/results?agent_id=forecast"
```

**Response**: Previously stored forecast results ready for discussion

---

## Common Tasks

### Get Agent Status
```bash
curl -X GET http://localhost:8000/agents/status
```
Shows which agents are ready and their last execution time.

### View Execution History
```bash
curl -X GET "http://localhost:8000/agents/history?limit=10"
```
Shows last 10 agent executions with duration and errors.

### Orchestrate Multiple Agents
```bash
curl -X POST http://localhost:8000/agents/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "dashboard",
    "agents": ["forecast", "funnel", "cohort"],
    "payload": {
      "channel": "Google Ads",
      "horizon_days": 30
    }
  }'
```
Executes multiple agents and aggregates results.

---

## Frontend Integration Examples

### Example 1: Simple Forecast Request
```javascript
// User: "Forecast my Google Ads campaign"
const response = await fetch('/agents/forecast/predict', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: 'Google Ads',
    campaign_type: 'Conversion',
    spend: 10000,
    impressions: 50000,
    ctr: 0.12,
    conversion_rate: 0.08
  })
});

const data = await response.json();
// Display: predicted_roi, revenue_projection, daily_forecast, top_drivers
```

### Example 2: Results Discussion
```javascript
// User: "Tell me about the top drivers for my last forecast"
const response = await fetch('/agents/results?agent_id=forecast');
const storedResults = await response.json();

// Access: storedResults.results.data.top_drivers
// Shows feature importance and drivers of ROI
```

### Example 3: Full Analytics Dashboard
```javascript
// User: "Give me a complete dashboard"
const response = await fetch('/agents/orchestrate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    intent: 'dashboard',
    agents: ['forecast', 'funnel', 'attribution', 'cohort'],
    payload: { channel: 'Google Ads' }
  })
});

const data = await response.json();
// data.agent_results.forecast -> ROI predictions
// data.agent_results.funnel -> Funnel metrics
// data.agent_results.cohort -> Cohort analysis
// data.agent_results.attribution -> Channel attribution
```

---

## Agent Details

### Forecast Agent ✅ (Ready)
Predicts campaign ROI, revenue, and generates daily forecasts.
- **Input**: Channel, campaign type, spend, impressions, CTR, conversion rate
- **Output**: ROI, revenue, profit, daily forecast, retention impact, top drivers
- **Status**: ✅ Fully implemented with ML model

### Cohort Agent 🔄 (Skeleton)
Analyzes user cohorts and retention.
- **Input**: Cohort period, metric
- **Output**: Cohort metrics, retention rates, LTV by cohort
- **Status**: 🔄 Skeleton - ready for implementation

### Attribution Agent 🔄 (Skeleton)
Models channel attribution and effectiveness.
- **Input**: Attribution model type, metric
- **Output**: Channel attribution scores, ROI by channel
- **Status**: 🔄 Skeleton - ready for implementation

### Funnel Agent 🔄 (Skeleton)
Analyzes conversion funnel and bottlenecks.
- **Input**: Channel, campaign type, time period
- **Output**: Funnel stages, drop-off rates, bottlenecks
- **Status**: 🔄 Skeleton - ready for implementation

### Scenario Agent 🔄 (Skeleton)
What-if analysis and scenario planning.
- **Input**: Base spend, adjustments, scenario name
- **Output**: Projected metrics, risk assessment, recommendations
- **Status**: 🔄 Skeleton - ready for implementation

---

## Agent Results Storage

When agents execute, results are stored in `agent_results` dictionary:

```python
# Example structure
agent_results = {
    "forecast": {
        "status": "success",
        "agent": "forecast",
        "data": {
            "predicted_roi": 5.82,
            "predicted_revenue": 68200,
            "predicted_profit": 58200,
            "daily_forecast": [...],
            "top_drivers": [...]
        }
    },
    "cohort": {...},
    "attribution": {...}
}
```

**Key Benefits**:
1. Results persist across multiple requests
2. Frontend can retrieve stored results anytime
3. Discussion and review of past analyses
4. No need to re-run expensive analyses
5. Full execution history available for auditing

---

## Example Conversation Flow

```
User: "I want to forecast my Google Ads campaign"
↓
System: Orchestrator determines intent = "forecast", agents = ["forecast"]
↓
System: AgentManager executes Forecast Agent
↓
System: Results stored in agent_results["forecast"]
↓
System: Returns ROI prediction, revenue forecast, daily breakdown

---

User: "What are the top drivers of ROI?"
↓
System: Retrieves stored results from agent_results["forecast"]
↓
System: Shows top_drivers from the stored forecast
↓
System: No re-execution needed, results already cached

---

User: "Compare this to last month's forecast"
↓
System: Retrieves execution history with GET /agents/history
↓
System: Shows comparison between executions
↓
System: Enables discussion of trends and changes
```

---

## API Reference

### POST /agents/orchestrate
Orchestrate multiple agents for analysis
- **Body**: intent, agents[], payload{}
- **Returns**: Aggregated agent results

### GET /agents/status
Get current status of all agents
- **Returns**: Status, model_loaded, last_execution for each agent

### GET /agents/results
Get stored results from previous executions
- **Query**: agent_id (optional)
- **Returns**: Stored agent results

### GET /agents/history
Get execution history for auditing
- **Query**: limit (default 10)
- **Returns**: List of past executions with duration

### POST /agents/forecast/train
Train the forecast ML model
- **Returns**: Training metrics (rows, RMSE, MAE)

### POST /agents/forecast/predict
Make a forecast prediction
- **Body**: Campaign parameters
- **Returns**: Forecast results

---

## Troubleshooting

### Model Not Trained
```
Error: "Forecast model not trained"
Solution: Run POST /agents/forecast/train first
```

### Agent Not Implemented
```
Error: "Agent not yet implemented"
Solution: This is expected for cohort, attribution, funnel, scenario agents
Status: Will show as "not_implemented" in /agents/status
```

### No Results Found
```
Error: Results not found for agent
Solution: Run the agent first with /agents/orchestrate or specific endpoint
```

### Execution Failed
```
Check: GET /agents/history to see error details
Debug: Error message in agent_results[agent_id].error
```

---

## Performance Notes

- Forecast prediction: ~100-500ms
- Model training: Depends on data size (with 250 rows: ~2-5s)
- Result retrieval: <10ms (cached results)
- History retrieval: <10ms (in-memory list)

---

## Best Practices

1. **Train once, predict many times**: Train the forecast model once, then make unlimited predictions
2. **Store results for later**: Results are cached, no need to re-run same request
3. **Use history for auditing**: Track all executions for compliance and review
4. **Check agent status**: Before relying on agents, verify status with /agents/status
5. **Handle not-implemented gracefully**: Skeleton agents return "not_implemented" status

---

## Implementation Timeline

✅ **Completed**:
- Forecast Agent (full implementation)
- Agent Manager (orchestration layer)
- Orchestrator integration
- 6 API endpoints
- Result storage and history

🔄 **Next Phase**:
- Cohort Agent implementation
- Attribution Agent implementation
- Funnel Agent implementation
- Scenario Agent implementation

---

**Ready to Use!** The agent system is ready for frontend integration and usage. 🚀

