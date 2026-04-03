# ⚡ Agent System Quick Reference Card

**Print this page for quick access!**

---

## 🚀 3-Minute Setup

```bash
# 1. Install packages (30 seconds)
pip install -r requirements.txt

# 2. Start API (10 seconds)
uvicorn analytics_agent.api.app:app --reload

# 3. Test it works (10 seconds)
curl http://localhost:8000/api
```

---

## 📌 Most Used Endpoints

### Train Model
```bash
curl -X POST http://localhost:8000/agents/forecast/train
```

### Make Prediction
```bash
curl -X POST http://localhost:8000/agents/forecast/predict \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "Google Ads",
    "campaign_type": "Conversion",
    "spend": 10000,
    "impressions": 50000,
    "ctr": 0.12,
    "conversion_rate": 0.08
  }'
```

### Get Results
```bash
curl http://localhost:8000/agents/results?agent_id=forecast
```

### Check Status
```bash
curl http://localhost:8000/agents/status
```

### View History
```bash
curl http://localhost:8000/agents/history?limit=10
```

---

## 📚 Documentation Quick Links

| Need | Read |
|------|------|
| 5-min overview | AGENT_SYSTEM_READY.md |
| Quick start | AGENT_QUICKSTART.md |
| Architecture | AGENT_IMPLEMENTATION_SUMMARY.md |
| Technical details | AGENT_TECHNICAL_REFERENCE.md |
| Verify setup | AGENT_CHECKLIST.md |
| Navigation | AGENT_DOCUMENTATION_INDEX.md |

---

## 🔧 File Locations

```
Agents:        analytics_agent/agents/
  - forecast_agent.py          ✅ READY
  - cohort_agent.py            🔄 Skeleton
  - attribution_agent.py        🔄 Skeleton
  - funnel_agent.py            🔄 Skeleton
  - scenario_agent.py          🔄 Skeleton

API:           analytics_agent/api/
  - agent_manager.py           ✅ READY
  - orchestrator.py            ✅ READY
  - app.py                     ✅ READY

Models:        analytics_agent/models/
  - forecast_model.pkl         (created on train)
```

---

## 🎯 Common Tasks

### Task: Make a Forecast
```python
# Step 1: Train
POST /agents/forecast/train

# Step 2: Predict
POST /agents/forecast/predict
{
  "channel": "Google Ads",
  "campaign_type": "Conversion",
  "spend": 10000,
  "impressions": 50000,
  "ctr": 0.12,
  "conversion_rate": 0.08
}

# Step 3: Get results later
GET /agents/results?agent_id=forecast
```

### Task: Check What's Running
```bash
GET /agents/status
# Shows: forecast ✅, cohort 🔄, attribution 🔄, etc.
```

### Task: See All Past Executions
```bash
GET /agents/history?limit=20
# Shows: last 20 executions with timing
```

### Task: Run Multiple Agents
```python
POST /agents/orchestrate
{
  "intent": "dashboard",
  "agents": ["forecast", "funnel", "cohort"],
  "payload": {}
}
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Model not trained" | Run `POST /agents/forecast/train` first |
| "Agent not implemented" | Normal - skeleton agents are templates |
| Import error | Run `pip install -r requirements.txt` |
| Port 8000 busy | Change port in uvicorn command |
| Models dir missing | Created automatically on first train |

---

## 💡 Key Concepts

### Result Storage
- Results automatically saved when agents run
- Can be retrieved without re-execution
- Perfect for discussion and analysis

### Execution History
- All agent runs are tracked
- Includes timing and errors
- Useful for auditing and debugging

### Agent Status
- Shows which agents are ready
- Model loaded status
- Last execution time

### Intent Routing
- "forecast" → runs Forecast Agent
- "dashboard" → runs multiple agents
- "scenario_forecast" → runs Scenario + Forecast

---

## 🔌 Python Integration

### Using AgentManager Directly
```python
from analytics_agent.api.agent_manager import AgentManager

manager = AgentManager()

# Orchestrate agents
result = manager.orchestrate(
    intent="forecast",
    agents_to_run=["forecast"],
    payload={"channel": "Google Ads", ...}
)

# Get stored results
results = manager.get_agent_results("forecast")

# Check status
status = manager.get_agent_status()

# View history
history = manager.get_execution_history(limit=10)
```

### Using Forecast Agent Directly
```python
from analytics_agent.agents.forecast_agent import ForecastAgent, ForecastRequest

agent = ForecastAgent()

# Train
metrics = agent.train()

# Predict
request = ForecastRequest(
    channel="Google Ads",
    campaign_type="Conversion",
    spend=10000,
    impressions=50000,
    ctr=0.12,
    conversion_rate=0.08
)
result = agent.predict_campaign(request)
```

---

## 📊 Response Format

### Forecast Prediction Response
```json
{
  "predicted_roi": 5.82,
  "predicted_revenue": 68200.00,
  "predicted_profit": 58200.00,
  "predicted_clicks": 6000,
  "predicted_purchases": 312,
  "retention_adjustment": {
    "available": true,
    "average_churn_probability": 0.28,
    "average_retention": 0.72,
    "future_revenue_multiplier": 1.18
  },
  "daily_forecast": [
    {
      "day": 1,
      "forecast_spend": 10025.00,
      "forecast_roi": 5.802,
      "forecast_revenue": 68277.55,
      "forecast_profit": 58252.55
    },
    ...
  ],
  "top_drivers": [
    {"feature": "conversion_rate", "importance": 31.4},
    {"feature": "spend", "importance": 22.1},
    ...
  ]
}
```

### Agent Status Response
```json
{
  "forecast": {
    "status": "ready",
    "model_loaded": true,
    "last_execution": "2026-04-03T..."
  },
  "cohort": {
    "status": "ready",
    "last_execution": null
  },
  ...
}
```

---

## ⏱️ Performance Expectations

| Operation | Time |
|-----------|------|
| Model training (250 rows) | 2-5 seconds |
| Single prediction | 100-500 ms |
| Result retrieval | <10 ms |
| Status check | <5 ms |
| History retrieval | <10 ms |

---

## 🎓 Learning Path

### If you have 5 minutes:
1. Read: AGENT_SYSTEM_READY.md
2. Run: 3 setup commands

### If you have 30 minutes:
1. Read: AGENT_SYSTEM_READY.md
2. Read: AGENT_QUICKSTART.md
3. Try: Example commands

### If you have 2 hours:
1. Read all documentation
2. Study code examples
3. Try advanced features

---

## ✅ Implementation Status

```
✅ Forecast Agent           - READY
🔄 Cohort Agent             - SKELETON (ready for impl)
🔄 Attribution Agent        - SKELETON (ready for impl)
🔄 Funnel Agent             - SKELETON (ready for impl)
🔄 Scenario Agent           - SKELETON (ready for impl)
✅ Agent Manager            - READY
✅ API Endpoints (6)        - READY
✅ Result Storage           - READY
✅ Execution History        - READY
✅ Documentation            - READY
```

---

## 📞 When in Doubt

```
Question                          Check This
─────────────────────────────────────────────────
How do I...?                  → AGENT_QUICKSTART.md
What is...?                   → AGENT_IMPLEMENTATION_SUMMARY.md
How does ... work?            → AGENT_TECHNICAL_REFERENCE.md
Where is...?                  → AGENT_DOCUMENTATION_INDEX.md
Is ... complete?              → AGENT_CHECKLIST.md
```

---

## 🚨 Emergency Contacts

**API not starting?**
→ Check: `pip install -r requirements.txt`

**Model training fails?**
→ Check: Campaign data in Supabase

**Prediction fails?**
→ Check: Model trained first

**Wrong results?**
→ Check: Input parameters match ForecastRequest

**Can't find docs?**
→ Check: AGENT_DOCUMENTATION_INDEX.md

---

## 🎯 Next Action

Pick one:
- [ ] Read AGENT_SYSTEM_READY.md (5 min)
- [ ] Run the 3-minute setup
- [ ] Read full AGENT_QUICKSTART.md
- [ ] Check documentation index

**Let's go!** 🚀

---

**Print this card!**  
**Keep it handy!**  
**Reference as needed!**  

*Last Updated: April 3, 2026*

