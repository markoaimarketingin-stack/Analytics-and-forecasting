# Data Integration Guide - Supabase Datasets with Analytics Agents

## Overview

This feature enables users to see and select which Supabase datasets are available for their analytics analysis. When users select datasets, the frontend will display which agents can utilize that data and provide recommendations.

## What's New

### Backend Changes

#### 1. New Endpoints

**GET `/api/available-datasets`**
- Returns all available Supabase datasets with metadata
- Includes: dataset name, description, row count, columns, and compatible agent types
- Data Sources:
  - `campaigns` - Campaign performance data
  - `events` - Customer event data
  - `customers` - Customer demographic data
  - `retention` - Customer retention data
  - `transactions` - Purchase and transaction data

**GET `/api/agents-data-mapping`**
- Returns which agents are compatible with which datasets
- Helps frontend show recommendations
- Agent Mappings:
  - **Forecast Agent**: campaigns
  - **Scenario Agent**: campaigns, transactions
  - **Funnel Agent**: campaigns, events
  - **Cohort Agent**: customers, transactions, retention, events
  - **Attribution Agent**: events, transactions, customers

#### 2. Updated Models

- **ChatRequest** now includes `selected_datasets: list[str]`
- **AvailableDataset** model with dataset metadata
- **AvailableDatasetsResponse** model for the response

#### 3. Bug Fixes

- Fixed import error in `analytics_agent/db/queries.py`
  - Changed `from db.supabase_client import get_supabase_client` to `from analytics_agent.clients.supabase_client import get_supabase_client`
  - Fixed function call from `get_supabase()` to `get_supabase_client()`

### Frontend Changes

#### 1. New Components

**DatasetSelector.tsx**
- Displays all available datasets from Supabase
- Shows dataset descriptions, row counts, and columns
- Allows users to select/deselect datasets with checkboxes
- Expandable section to view available columns for each dataset
- Visual feedback for selected datasets
- Select all / Clear all functionality

**AgentsDataMapping.tsx**
- Shows which agents can use the selected datasets
- Displays agent descriptions and compatibility
- Color-coded based on compatibility (blue = compatible, gray = not compatible)
- Real-time updates as user selects/deselects datasets
- Information tooltips showing required datasets for each agent

#### 2. Updated Components

**App.tsx**
- Added `selectedDatasets` state to track user selections
- Integrated DatasetSelector and AgentsDataMapping in the dashboard
- Updated handleSendMessage to include `selected_datasets` in API requests
- Selected datasets persist across new chat sessions

**api.ts (Services)**
- Added `getAvailableDatasets()` function
- Added `getAgentsDataMapping()` function

## How It Works

### User Flow

1. **Open Dashboard**
   - User sees the main analytics interface
   - Two new panels are displayed:
     - Available Datasets selector
     - Agent-to-Dataset compatibility guide

2. **Select Datasets**
   - User browses available datasets
   - Can expand to see columns in each dataset
   - Selects datasets relevant to their analysis
   - Selection indicators show which datasets are chosen

3. **View Compatible Agents**
   - AgentsDataMapping panel updates in real-time
   - Shows which agents can use the selected data
   - Grayed out agents if their required datasets aren't selected
   - "Ready to use" indicators for compatible agents

4. **Chat with Agent**
   - User inputs a message in the chat panel
   - Selected datasets are sent along with the message
   - Backend logs which datasets are being used
   - Agents use only the selected data for analysis

## Database Setup

Ensure your Supabase project has the following tables:

```
- campaigns (spend, impressions, clicks, ctr, conversion_rate, purchases, revenue, roi)
- events (customer_id, timestamp, channel, event_type)
- customers (customer_id, segment, acquisition_date)
- retention (customer_id, churn_probability)
- transactions (customer_id, purchase_date, revenue)
```

## Environment Configuration

Your `.env` file should already have:

```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## API Request Format

When sending a chat request with selected datasets:

```json
{
  "message": "Forecast revenue for next quarter",
  "selected_datasets": ["campaigns", "transactions"]
}
```

## API Response Format

The orchestrate endpoint returns:

```json
{
  "success": true,
  "reasoning": "Selected forecast agent because campaigns data is available",
  "intent": {...},
  "activated_agents": [...],
  "timeline": [...],
  "payload": {...},
  "result": {...},
  "timestamp": "2026-04-03T..."
}
```

## Dataset Details

### Campaigns
- **Used By**: Forecast, Scenario, Funnel, ROI Forecaster
- **Contains**: Channel, campaign type, spend, performance metrics
- **Typical Use**: Revenue forecasting, budget allocation

### Events
- **Used By**: Funnel, Attribution, Cohort
- **Contains**: Customer interactions, page views, clicks
- **Typical Use**: Funnel analysis, attribution modeling

### Customers
- **Used By**: Cohort, Attribution
- **Contains**: Customer demographics, segments
- **Typical Use**: Customer segmentation, cohort analysis

### Retention
- **Used By**: Cohort, KPI Validator
- **Contains**: Churn probability, retention metrics
- **Typical Use**: Churn prediction, retention analysis

### Transactions
- **Used By**: Attribution, Cohort, Revenue Attribution
- **Contains**: Purchase data, revenue, dates
- **Typical Use**: Revenue attribution, customer lifetime value

## UI Layout

### Dashboard
```
┌─────────────────────────────────────────────┐
│            Available Datasets               │
│  ☐ campaigns (5,234 rows)                   │
│  ☑ events (124,567 rows)                    │
│  ☑ transactions (15,234 rows)               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│        Agent Data Compatibility             │
│  [F] Forecast    - Ready to use ✓           │
│  [A] Attribution - Ready to use ✓           │
│  [C] Cohort      - Requires: retention      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│         Chat with Analytics Supervisor       │
│  User: "What's the revenue forecast?"      │
│  Agent: "Based on events and transactions..." │
└─────────────────────────────────────────────┘
```

## Testing the Feature

1. **Start the backend**
   ```bash
   cd analytics_agent
   python -m uvicorn api.app:app --host 0.0.0.0 --port 8001 --reload
   ```

2. **Start the frontend**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Test endpoints**
   ```bash
   # Get available datasets
   curl http://localhost:8001/api/available-datasets
   
   # Get agent mappings
   curl http://localhost:8001/api/agents-data-mapping
   ```

4. **Test dataset selection**
   - Open the dashboard
   - Select different dataset combinations
   - Watch the Agent Data Compatibility panel update
   - Send a message with datasets selected

## Troubleshooting

### No datasets appear
- Check if Supabase credentials in `.env` are correct
- Verify Supabase tables exist and have data
- Check backend logs: `LOG: Failed to fetch available datasets`

### Agents not showing as compatible
- Verify the dataset has rows of data
- Check if the dataset name in the response matches agent mapping
- Review `agents-data-mapping` endpoint response

### Selected datasets not being used
- Verify `selected_datasets` are in the chat request
- Check backend logs for: `LOG: Orchestrating with selected datasets`
- Confirm agents have logic to use selected datasets

## Future Enhancements

- Allow users to define custom data views/filters
- Save dataset selections as "profiles"
- Add data preview functionality
- Support for custom SQL queries
- Dataset refresh scheduling
- Data quality metrics per dataset

## Files Modified/Created

### Backend
- `analytics_agent/api/app.py` - Added endpoints and models
- `analytics_agent/db/queries.py` - Fixed imports

### Frontend
- `frontend/src/components/DatasetSelector.tsx` - New component
- `frontend/src/components/AgentsDataMapping.tsx` - New component
- `frontend/src/App.tsx` - Integrated new components
- `frontend/src/services/api.ts` - Added dataset API functions

