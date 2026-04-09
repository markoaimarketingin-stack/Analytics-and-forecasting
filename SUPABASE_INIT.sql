-- ============================================================================
-- SUPABASE DATABASE INITIALIZATION SCRIPT
-- Run this in your Supabase SQL Editor to create the internal app tables
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create AGENTS table
CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create FILES table
CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    storage_path VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create AGENT_FILE_ASSOCIATION table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS agent_file_association (
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, file_id)
);

-- 4. Create ANALYTICS_MODELS table
CREATE TABLE IF NOT EXISTS analytics_models (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    state JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create FORECAST_RESULTS table
CREATE TABLE IF NOT EXISTS forecast_results (
    id SERIAL PRIMARY KEY,
    model_id INTEGER,
    monthly JSONB,
    totals JSONB,
    breakeven_month INTEGER
);

-- 6. Create SCENARIO_OUTPUTS table
CREATE TABLE IF NOT EXISTS scenario_outputs (
    id SERIAL PRIMARY KEY,
    model_id INTEGER,
    scenarios JSONB
);

-- 7. Create COHORT_DATA table
CREATE TABLE IF NOT EXISTS cohort_data (
    id SERIAL PRIMARY KEY,
    model_id INTEGER,
    data JSONB
);

-- 8. Create FUNNEL_MODELS table
CREATE TABLE IF NOT EXISTS funnel_models (
    id SERIAL PRIMARY KEY,
    model_id INTEGER,
    data JSONB
);

-- 9. Create ATTRIBUTION_MODELS table
CREATE TABLE IF NOT EXISTS attribution_models (
    id SERIAL PRIMARY KEY,
    model_id INTEGER,
    data JSONB
);

-- 10. Create KPI_HISTORY table
CREATE TABLE IF NOT EXISTS kpi_history (
    id SERIAL PRIMARY KEY,
    kpi VARCHAR(64),
    value FLOAT,
    at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Create ANALYTICS_LOGS table
CREATE TABLE IF NOT EXISTS analytics_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(16),
    message TEXT,
    context JSONB,
    at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Create CHAT_THREADS table
CREATE TABLE IF NOT EXISTS chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Chat',
    last_message_preview TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 13. Create CHAT_MESSAGES table
CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_client_last_message
    ON chat_threads(client_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created_at
    ON chat_messages(thread_id, created_at ASC);

-- ============================================================================
-- Insert a default agent for the application
-- ============================================================================
INSERT INTO agents (name) VALUES ('Default Agent')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Done! Your Supabase database is now initialized.
-- ============================================================================

