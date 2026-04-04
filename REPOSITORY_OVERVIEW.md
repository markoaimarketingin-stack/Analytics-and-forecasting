# Analytics-and-Forecasting Repository Overview

## Project Summary

This is a **Growth Analytics & Forecasting Engine** built with Python that performs sophisticated marketing analytics, ROI forecasting, and scenario modeling. It uses **LangGraph** (agentic framework) to orchestrate a series of computational nodes that analyze marketing performance and generate actionable insights.

The system is designed to help growth/marketing teams:
- Forecast revenue based on historical performance and channel data
- Estimate Customer Acquisition Cost (CAC) and Return on Ad Spend (ROAS)
- Model different business scenarios (Best/Base/Worst case)
- Analyze customer cohorts and retention patterns
- Analyze marketing funnels and identify conversion bottlenecks
- Attribute revenue to marketing channels
- Generate AI-powered executive summaries using Google Gemini

---

## Project Structure

```
Analytics-and-forecasting/
├── analytics_runner.py          # Main entry point - orchestrates analysis
├── graph.py                     # LangGraph setup - defines node execution flow
├── state.py                     # Pydantic data models - defines state schema
├── clients/
│   └── gemini_client.py         # Google Gemini AI integration
├── nodes/                       # Computational pipeline nodes
│   ├── kpi_validator.py         # Validates and normalizes primary KPI
│   ├── cac_roas_estimator.py    # Calculates CAC, ROAS, LTV metrics
│   ├── roi_forecaster.py        # Forecasts revenue over time periods
│   ├── scenario_modeler.py      # Generates best/base/worst case scenarios
│   ├── cohort_analyzer.py       # Analyzes customer cohorts & retention
│   ├── funnel_modeler.py        # Models conversion funnels & dropoffs
│   ├── revenue_attribution_modeler.py  # Attributes revenue to channels
│   ├── assumption_engine.py     # Calculates confidence scores
│   └── suggestion_generator.py  # Generates actionable recommendations
├── db/
│   ├── models.py                # SQLAlchemy ORM models for persistence
│   └── repo.py                  # Database initialization & session management
└── LICENSE                      # GNU GPL v3 license
```

---

## Core Components

### 1. **analytics_runner.py** - Main Entry Point

**Purpose**: Orchestrates the entire analysis workflow and provides utility methods.

**Key Methods**:
- `run(payload)` - Executes the full analytics pipeline with given data
- `budget_sensitivity(base_payload, budgets)` - Analyzes ROI across different budget levels
- `break_even(payload)` - Calculates minimum ROAS and conversion rates needed for profitability
- `ltv_projection(payload, months)` - Projects customer lifetime value over time
- `cfo_mode(payload)` - Generates executive summary for C-suite

**Capabilities**:
- ROI forecasting
- CAC/ROAS estimation
- Scenario modeling
- KPI definition

---

### 2. **state.py** - State Management

Defines the data flow through the system using **Pydantic BaseModel**:

**Input Fields**:
- `primary_kpi` - The main metric to optimize (revenue, ROAS, new_customers, ltv, profit)
- `channel_performance` - Spend, conversions, and revenue by channel
- `historical_data` - Historical performance data for cohort analysis
- `conversion_rates` - CTR, LPV rate, ATC rate, CVR, etc.
- `revenue_data` - AOV (Average Order Value), LTV
- `cost_structure` - Variable COGS rate
- `structured_context` - Forecast horizon, growth rate, seasonality, market conditions

**Output Fields**:
- `metrics` - Calculated CAC, ROAS, LTV, contribution margin
- `forecast_results` - Monthly and total revenue/spend/profit forecasts
- `scenarios` - Best/Base/Worst case analysis
- `cohort_results` - LTV by cohort, retention index
- `funnel_model` - Conversion funnel stages and dropoff rates
- `attribution_model` - Revenue attribution across channels
- `assumptions` - List of assumptions made
- `confidence_score` - Overall confidence in the forecast
- `suggestions_list` - Actionable recommendations
- `warnings` - Data quality or methodology warnings

---

### 3. **graph.py** - Execution Pipeline

Uses **LangGraph** to define a state machine that chains computational nodes:

**Node Execution Flow**:
```
kpi_validator
    ↓
load_performance_data
    ↓
cac_roas_estimator (calculates base metrics)
    ↓
roi_forecaster (forecasts revenue)
    ↓
scenario_modeler (generates scenarios)
    ↓
[CONDITIONAL BRANCH]
├─ IF historical_data exists → cohort_analyzer
│   ↓
│   funnel_modeler
│   ↓
├─ ELSE → funnel_modeler (skip cohort)
    ↓
revenue_attribution_modeler
    ↓
assumption_engine (calculates confidence)
    ↓
suggestion_generator (generates recommendations)
    ↓
END
```

---

## Processing Nodes (Detailed Breakdown)

### **1. kpi_validator** 
- Validates that the primary KPI is measurable (not vague like "growth" or "scale")
- Accepts: revenue, ROAS, new_customers, LTV, profit
- Issues warnings for unmeasurable KPIs
- Suggests clarification via UI

### **2. cac_roas_estimator**
- Aggregates channel performance data
- Calculates:
  - **CAC** = Total Spend / Total Conversions
  - **ROAS** = Total Revenue / Total Spend
  - **LTV** = Revenue per Customer (from historical or derived)
  - **LTV/CAC Ratio** = Indicator of customer profitability
  - **Contribution Margin** = 1 - COGS Rate - (CAC/LTV)

### **3. roi_forecaster**
- Projects revenue month-by-month using:
  - Base ROAS and spend
  - Growth rate (compounded monthly)
  - Seasonality multipliers
- Calculates cumulative profit and break-even month
- Returns monthly breakdown: spend, revenue, ROAS, profit, cumulative profit

### **4. scenario_modeler**
- Creates three scenarios based on ±20% variation in metrics:
  - **Best Case**: Improved CTR, CVR, CPC; higher retention
  - **Base Case**: Current performance
  - **Worst Case**: Degraded metrics
- Adjusts ROAS based on metric changes
- Assigns confidence levels (70% base, 55% best, 45% worst)

### **5. cohort_analyzer** (Runs only if historical_data exists)
- Segments customers by cohort (e.g., acquisition month)
- Calculates:
  - **LTV by cohort** - Lifetime value per cohort
  - **Retention index** - Estimated retention from revenue patterns
- Highlights cohort trends over time

### **6. funnel_modeler**
- Models conversion funnel stages:
  - Impressions → Clicks → Landing Page Views → Add to Cart → Purchases
- Calculates dropoff rates at each stage
- Identifies biggest conversion bottleneck
- Warns about low conversion rates

### **7. revenue_attribution_modeler**
- Attributes revenue to channels using three models:
  - **Last-Click**: Revenue credited to the final touchpoint
  - **Multi-Touch**: Equal credit across all channels
  - **Blended**: Average of last-click and multi-touch (50/50)
- Helps optimize budget allocation

### **8. assumption_engine**
- Scores forecast confidence (0-100%) based on:
  - **Data Availability** (30%) - Do we have channel, historical, conversion, revenue, cost data?
  - **Data Consistency** (20%) - Historical data variance
  - **Stability** (20%) - Market stability level (low/medium/high)
  - **Assumption Risk** (20%) - How many assumptions did we make?
  - **External Uncertainty** (10%) - External market conditions
- Returns confidence score used in final output

### **9. suggestion_generator**
- Generates contextual, actionable recommendations:
  - Missing historical data? → Suggest "Create a dashboard"
  - Have historical data? → Suggest "Conduct cohort analysis"
  - Low funnel conversions? → Suggest "Setup funnel tracking"
  - Always suggests "Analyze marketing impact on revenue"
- Each suggestion includes:
  - Title, description, reasoning
  - Execute action (UI hook)
  - Dismiss option

---

## Database Layer

### **models.py** - ORM Models (SQLAlchemy)

Tables for persistence:

- **AnalyticsModel** - Stores full analysis state as JSON
- **ForecastResult** - Monthly and total forecast data
- **ScenarioOutput** - Scenario analysis results
- **CohortData** - Cohort analysis results
- **FunnelModel** - Funnel conversion stages
- **AttributionModel** - Channel attribution results
- **KPIHistory** - Historical KPI values over time
- **AnalyticsLog** - Logs of all analysis runs

### **repo.py** - Database Interface

Simple utilities:
- `get_engine()` - Creates SQLAlchemy engine (defaults to SQLite)
- `init_db()` - Creates all tables
- `get_session()` - Returns database session

---

## Clients

### **gemini_client.py** - Google Generative AI Integration

Integrates with Google Gemini API for AI-powered narrative:
- Generates plain-English summaries of forecasts
- Creates executive-level explanations
- Requires `GEMINI_API_KEY` environment variable
- Gracefully degrades if API unavailable

---

## Input/Output Example

### **Input Payload** (Example):
```python
{
    "primary_kpi": "revenue",
    "channel_performance": {
        "google_ads": {"spend": 10000, "conversions": 100, "revenue": 50000},
        "facebook": {"spend": 5000, "conversions": 50, "revenue": 30000}
    },
    "conversion_rates": {"ctr": 0.02, "conversion_rate": 0.05},
    "revenue_data": {"aov": 500, "ltv": 2500},
    "cost_structure": {"variable_cogs_rate": 0.3},
    "structured_context": {
        "forecast_months": 6,
        "projected_growth_rate": 0.1,
        "seasonality_multipliers": [1.0, 1.1, 0.9, 1.0, 1.2, 1.1]
    }
}
```

### **Output** (Example):
```python
{
    "capabilities": ["ROI forecasting", "CAC/ROAS estimation", "Scenario modeling", "KPI definition"],
    "primary_kpi": "revenue",
    "metrics": {
        "cac": 133.3333,
        "roas": 5.3333,
        "ltv": 2500,
        "ltv_cac_ratio": 18.75,
        "contribution_margin": 0.6467
    },
    "forecast_results": {
        "monthly": [
            {"month": 1, "spend": 15000, "revenue": 80000, "roas": 5.333, "profit": 41000, "cum_profit": 41000},
            # ... more months ...
        ],
        "totals": {"spend": 90000, "revenue": 480000, "profit": 246000},
        "breakeven_month": 1
    },
    "scenarios": [
        {"label": "Best Case", "spend": 15000, "revenue": 90000, "roas": 6.0, "profit": 47100, "confidence": 0.55},
        {"label": "Base Case", "spend": 15000, "revenue": 80000, "roas": 5.333, "profit": 41000, "confidence": 0.7},
        {"label": "Worst Case", "spend": 15000, "revenue": 70000, "roas": 4.667, "profit": 34900, "confidence": 0.45}
    ],
    "cohort_results": {
        "ltv_by_cohort": {"2024-01": 2400, "2024-02": 2500},
        "retention_index": {"2024-01": 0.95, "2024-02": 0.98}
    },
    "funnel_model": {
        "impressions": 1000000,
        "clicks": 20000,
        "lp_views": 10000,
        "add_to_cart": 1000,
        "purchases": 150,
        "dropoffs": {
            "impr_to_click": 0.98,
            "click_to_lp": 0.5,
            "lp_to_atc": 0.9,
            "atc_to_purchase": 0.85
        }
    },
    "attribution_model": {
        "last_click": {"google_ads": 50000, "facebook": 30000},
        "multi_touch": {"google_ads": 40000, "facebook": 40000},
        "blended": {"google_ads": 45000, "facebook": 35000}
    },
    "confidence_score": 75.5,
    "suggestions": [
        {
            "title": "Analyze the impact of marketing on revenue",
            "description": "Connect marketing spend with revenue...",
            "reasoning": "Attribution and ROAS insights...",
            "actions": {"execute": "run:attribution_report", "ignore": "dismiss"}
        }
    ],
    "warnings": ["Biggest funnel leakage: click_to_lp at 50.0%"],
    "reasoning_summary": "Based on current performance, the forecast shows strong ROI..."
}
```

---

## Utility Methods in AnalyticsRunner

### **budget_sensitivity(base_payload, budgets)**
Analyzes how changing marketing budget affects ROAS and revenue:
- Takes a list of budget amounts
- Proportionally scales channel spend
- Returns ROAS, revenue, profit for each budget level
- Useful for optimizing budget allocation

### **break_even(payload)**
Calculates minimum metrics needed for profitability:
- Returns minimum ROAS to cover spend + COGS
- Returns minimum conversion rate to achieve profitable CAC
- Uses deterministic calculation

### **ltv_projection(payload, months=12)**
Projects customer lifetime value:
- Uses AOV and repeat purchase rate
- Compounds repeat purchases over months
- Returns monthly revenue breakdown and total LTV
- Helps understand long-term customer value

### **cfo_mode(payload)**
Executive summary for C-level:
- Highlights next-period revenue forecast
- Shows base ROAS
- Includes confidence score
- Optional: Generates Gemini-powered narrative

---

## Tech Stack

- **Python** 3.7+
- **LangGraph** - Agentic orchestration framework
- **Pydantic** - Data validation and modeling
- **SQLAlchemy** - ORM for database persistence
- **Google Generative AI** (Gemini) - Optional AI narrative generation
- **SQLite** - Default database (configurable)

---

## Key Features

✅ **End-to-End Analytics** - From raw data to actionable insights  
✅ **Flexible Input** - Accepts channel data, historical trends, conversion metrics  
✅ **Multiple Forecast Methods** - Growth rates, seasonality, scenario analysis  
✅ **Confidence Scoring** - Quantifies forecast reliability  
✅ **AI-Powered Narratives** - Gemini generates business-friendly summaries  
✅ **Actionable Suggestions** - Context-aware recommendations  
✅ **Database Persistence** - Store and retrieve analysis history  
✅ **Utility Analysis** - Budget sensitivity, break-even, LTV projections  

---

## License

GNU General Public License v3 (GPL-3.0)

---

## Summary

This is a **production-grade analytics engine** designed for growth/marketing teams to forecast revenue, optimize budgets, and understand customer economics. It combines deterministic financial modeling with data-driven analysis and AI narrative generation to provide both quantitative rigor and business-friendly explanations.

The LangGraph orchestration ensures each analysis step builds on previous calculations, with conditional logic to adapt to available data. The result is a flexible, extensible framework for marketing analytics and forecasting.
