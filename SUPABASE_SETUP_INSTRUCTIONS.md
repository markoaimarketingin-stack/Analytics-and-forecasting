# 🗄️ How to Initialize Your Supabase Database

Your Supabase has the **analytics data** (campaigns, events, customers, etc.) but is **missing the internal app tables** (agents, files, etc.).

---

## ✅ Quick Fix (5 minutes)

### Step 1: Open Supabase SQL Editor
1. Go to: **Supabase Dashboard → Your Project → SQL Editor**
2. Click: **"New Query"** button

### Step 2: Copy the SQL Script
Open the file: `SUPABASE_INIT.sql` in this project root
Copy ALL the SQL code

### Step 3: Paste & Run
1. Paste the SQL into the SQL Editor
2. Click: **"Run"** button (or Ctrl+Enter)

### Step 4: Done!
You should see:
```
Rows affected: 1 (or similar)
```

---

## ✅ What This Script Does

Creates all these tables in your Supabase:
- ✅ `agents` - Tracks agents in the system
- ✅ `files` - Tracks uploaded files
- ✅ `agent_file_association` - Links agents to files
- ✅ `analytics_models` - Stores model results
- ✅ `forecast_results` - Stores forecast data
- ✅ `scenario_outputs` - Stores scenarios
- ✅ `cohort_data` - Stores cohort analysis
- ✅ `funnel_models` - Stores funnel data
- ✅ `attribution_models` - Stores attribution data
- ✅ `kpi_history` - Tracks KPI changes
- ✅ `analytics_logs` - Application logs

Plus inserts a **default agent** automatically.

---

## ✅ After Running the Script

1. Restart your backend:
   ```bash
   # Stop backend (Ctrl+C)
   # Restart:
   python -m uvicorn analytics_agent.api.app:app --reload
   ```

2. The error should be gone! ✅

---

## 🎯 Summary

Your setup:
- ✅ Supabase connected (DB credentials in .env)
- ✅ Analytics data uploaded (campaigns, events, etc.)
- ❌ Internal tables missing (agents, files, etc.) ← FIX THIS
- ⏳ Run the SQL script above to fix it

That's it!

---

**File to run:** `SUPABASE_INIT.sql`
**Where:** Supabase SQL Editor
**Time:** 1 minute

