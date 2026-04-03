# Quick Start Guide - Data Integration Feature

## 🚀 What's New?

Your analytics platform now shows which datasets are available from Supabase and which agents can use them. Users can select datasets and see real-time compatibility with analytics agents.

## ⚡ 30-Second Setup

### 1. Verify Backend (Python)
```bash
cd C:\Users\karan\PycharmProjects\Analytics-and-forecasting
python -m py_compile analytics_agent\api\app.py
python -m py_compile analytics_agent\db\queries.py
```
✅ If no errors, Python code is ready

### 2. Verify Frontend (TypeScript)
```bash
cd C:\Users\karan\PycharmProjects\Analytics-and-forecasting\frontend
npx tsc --noEmit
```
✅ If no errors, TypeScript is ready

### 3. Start Backend
```bash
cd C:\Users\karan\PycharmProjects\Analytics-and-forecasting\analytics_agent
python -m uvicorn api.app:app --host 0.0.0.0 --port 8001 --reload
```
✅ You should see "Uvicorn running on..."

### 4. Start Frontend (New Terminal)
```bash
cd C:\Users\karan\PycharmProjects\Analytics-and-forecasting\frontend
npm run dev
```
✅ You should see "Local: http://localhost:5173"

### 5. Open Browser
```
http://localhost:5173
```
✅ You should see:
- "Available Datasets" panel with 5 datasets
- "Agent Data Compatibility" panel with agent cards

## 📊 What You'll See

### Available Datasets Panel
Shows all Supabase tables with:
- Dataset name (campaigns, events, customers, etc.)
- Description
- Number of rows
- List of compatible agents
- Expandable columns list
- Checkbox to select/deselect

### Agent Compatibility Panel
Shows all analytics agents with:
- Agent name and description
- Required datasets
- Real-time compatibility status (blue = ready, gray = needs data)
- "Ready to use" indicator for compatible agents

## 🎯 How to Use

### For End Users

1. **Open Dashboard** → See available datasets and agents
2. **Select Datasets** → Check datasets relevant to your analysis
3. **View Compatibility** → See which agents can use your data
4. **Chat with Agent** → Type your question
5. **Get Results** → Analysis runs on selected data

### For Developers

1. **Add New Dataset** → Edit `get_available_datasets()` in `app.py`
2. **Change Agent Mapping** → Edit `mapping` dict in `get_agents_data_mapping()`
3. **Customize UI** → Modify `DatasetSelector.tsx` or `AgentsDataMapping.tsx`
4. **Track Selections** → Check `selectedDatasets` state in `App.tsx`

## 📁 File Structure

### New Files Created
```
frontend/src/components/
  ├─ DatasetSelector.tsx          ← Display & select datasets
  └─ AgentsDataMapping.tsx        ← Show agent compatibility

Documentation/
  ├─ DATA_INTEGRATION_GUIDE.md     ← Full documentation
  ├─ IMPLEMENTATION_SUMMARY.md     ← Quick overview
  ├─ ARCHITECTURE_AND_VISUALS.md   ← Diagrams & flow
  ├─ TESTING_CHECKLIST.md          ← Test guide
  └─ QUICK_START.md                ← This file
```

### Modified Files
```
Backend:
  ├─ analytics_agent/api/app.py    ← Added endpoints & models
  └─ analytics_agent/db/queries.py ← Fixed imports

Frontend:
  ├─ frontend/src/App.tsx          ← Integrated components
  └─ frontend/src/services/api.ts  ← Added API functions
```

## 🔌 API Endpoints

### GET /api/available-datasets
Returns all available Supabase datasets with metadata
```bash
curl http://localhost:8001/api/available-datasets
```

Response includes:
- Dataset name, description, row count, columns
- Which agents can use each dataset

### GET /api/agents-data-mapping
Returns which agents work with which datasets
```bash
curl http://localhost:8001/api/agents-data-mapping
```

Response includes:
- Agent name, description, icon
- Required/compatible datasets for each agent

### POST /api/orchestrate
Send a message with selected datasets
```bash
curl -X POST http://localhost:8001/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Forecast revenue",
    "selected_datasets": ["campaigns", "transactions"]
  }'
```

## 🎨 Component Architecture

```
App.tsx (Main App)
  ├─ [selectedDatasets state]
  │
  ├─ Dashboard (when activeSection === 'dashboard')
  │   ├─ DatasetSelector
  │   │   └─ Shows: campaigns, events, customers, retention, transactions
  │   │   └─ Emits: onDatasetsSelected(selectedDatasets)
  │   │
  │   ├─ AgentsDataMapping
  │   │   └─ Receives: selectedDatasets (prop)
  │   │   └─ Shows: Real-time agent compatibility
  │   │
  │   └─ ChatPanel
  │       └─ Receives: selectedDatasets in handleSendMessage
  │       └─ Sends: {message, selected_datasets} to /api/orchestrate
  │
  └─ [Other Workspaces]
```

## 🧪 Quick Test

### Test 1: Load Datasets
1. Open browser console (F12)
2. Navigate to dashboard
3. Look for 5 datasets in "Available Datasets" panel
4. No errors in console
✅ Pass = All datasets load

### Test 2: Select Dataset
1. Click checkbox next to "campaigns"
2. Checkbox should be checked ✓
3. Green bar should appear
4. "Agent Data Compatibility" section should update
✅ Pass = Selection works

### Test 3: Agent Compatibility
1. Select "campaigns" dataset
2. Forecast, Scenario, Funnel agents should turn blue
3. Deselect "campaigns"
4. All agents should turn gray again
✅ Pass = Compatibility updates in real-time

### Test 4: Send Chat
1. Select some datasets
2. Type message: "What is my revenue forecast?"
3. Click send
4. Check backend terminal for log:
   ```
   INFO: Orchestrating with selected datasets
   datasets=['campaigns', ...]
   ```
✅ Pass = Backend receives datasets

## 🐛 Troubleshooting

### Datasets Not Showing
**Problem:** "Available Datasets" panel is empty
**Solution:**
1. Check if Supabase is connected
2. Verify tables exist in Supabase
3. Check backend logs for errors
4. Ensure row counts > 0

### Agents Not Showing as Compatible
**Problem:** All agent cards are gray
**Solution:**
1. Make sure you've selected at least one dataset
2. Check dataset names match agent mapping
3. Verify dataset has data (row_count > 0)

### Console Errors
**Problem:** See red errors in browser console
**Solution:**
1. Check API URL is correct (http://localhost:8001/api)
2. Verify backend is running
3. Check for CORS errors
4. Refresh page and try again

### Backend API Errors
**Problem:** See errors in backend terminal
**Solution:**
1. Check Supabase credentials in `.env`
2. Verify database tables exist
3. Check Python version (3.8+)
4. Run: `python -m py_compile analytics_agent/api/app.py`

## 📖 Documentation Files

| File | Purpose |
|------|---------|
| `DATA_INTEGRATION_GUIDE.md` | Complete feature documentation |
| `IMPLEMENTATION_SUMMARY.md` | Overview of what was built |
| `ARCHITECTURE_AND_VISUALS.md` | Diagrams and architecture |
| `TESTING_CHECKLIST.md` | Comprehensive testing guide |
| `QUICK_START.md` | This file |

## 🎓 Learning Path

### For Users
1. Read `QUICK_START.md` (this file)
2. Try out the feature in the UI
3. Read `DATA_INTEGRATION_GUIDE.md` for details

### For Developers
1. Read `IMPLEMENTATION_SUMMARY.md`
2. Review `ARCHITECTURE_AND_VISUALS.md`
3. Check the modified code files
4. Review `TESTING_CHECKLIST.md`
5. Customize as needed

### For DevOps
1. Check `DATA_INTEGRATION_GUIDE.md` section on deployment
2. Verify environment variables
3. Test endpoints manually
4. Review `TESTING_CHECKLIST.md` before going live

## 🔒 Security Notes

- No full data is sent to frontend (only metadata)
- Supabase uses service role key (server-side only)
- Dataset selections are session-only (not persisted)
- User cannot access full dataset without backend analysis

## 📈 Performance

- Dataset metadata fetched once on component mount
- Agent mappings are hardcoded (no DB query)
- Minimal API calls and network overhead
- Smooth UI updates with React state

## 🎯 Next Steps

### Immediate
- [ ] Run through quick test section above
- [ ] Verify all 5 datasets appear
- [ ] Test dataset selection
- [ ] Test agent compatibility
- [ ] Send a chat message

### Short Term
- [ ] Read full documentation
- [ ] Customize agent mapping if needed
- [ ] Add more datasets if available
- [ ] Test on different browsers
- [ ] Load test with concurrent users

### Long Term
- [ ] Add data preview feature
- [ ] Save dataset preferences
- [ ] Add custom filters
- [ ] Monitor usage analytics
- [ ] Gather user feedback

## 💡 Tips & Tricks

1. **Select All at Once** → Click "Select all datasets" button
2. **Clear Selection** → Click "Clear all" button
3. **View Columns** → Click ▼ next to dataset name
4. **Check Compatibility** → Look at agent cards for real-time status
5. **Persist Selection** → Your selection stays when you start new chat
6. **Check Logs** → Backend logs dataset selections for debugging

## 📞 Support

If something doesn't work:

1. **Check Console** → Open F12, look at Console and Network tabs
2. **Check Logs** → Look at backend terminal output
3. **Verify Setup** → Run through "30-Second Setup" again
4. **Read Documentation** → Check `DATA_INTEGRATION_GUIDE.md`
5. **Check Files** → Verify all new files exist
6. **Test Endpoints** → Use curl commands above to test APIs

## 🎉 Success!

You now have a fully functional data integration system that:
✅ Shows available datasets from Supabase
✅ Displays dataset metadata (columns, row counts)
✅ Shows real-time agent compatibility
✅ Allows users to select datasets for analysis
✅ Passes selections to backend for processing
✅ Has comprehensive documentation and testing guides

Enjoy your enhanced analytics platform! 🚀

