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

CREATE TABLE IF NOT EXISTS training_uploads (
    id BIGSERIAL PRIMARY KEY,
    client_id TEXT NOT NULL,
    agent_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    local_storage_path TEXT,
    remote_storage_path TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_training_uploads_client_created
    ON training_uploads(client_id, created_at DESC);

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

-- 13b. Repair/upgrade legacy CHAT schema (existing tables are not modified by CREATE TABLE IF NOT EXISTS)
ALTER TABLE IF EXISTS chat_threads
    ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'New Chat',
    ADD COLUMN IF NOT EXISTS last_message_preview TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE IF EXISTS chat_messages
    ADD COLUMN IF NOT EXISTS thread_id UUID,
    ADD COLUMN IF NOT EXISTS session_id UUID,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

DO $$
DECLARE
    v_id_type TEXT;
    v_session_nullable TEXT;
BEGIN
    -- Ensure FK exists if thread_id is present.
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'chat_messages'
          AND column_name = 'thread_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chat_messages_thread_id_fkey'
    ) THEN
        ALTER TABLE chat_messages
            ADD CONSTRAINT chat_messages_thread_id_fkey
            FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE;
    END IF;

    -- Legacy environments can have id as NOT NULL without a default.
    SELECT data_type INTO v_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'id'
    LIMIT 1;

    IF v_id_type = 'uuid' THEN
        ALTER TABLE chat_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ELSIF v_id_type = 'bigint' THEN
        BEGIN
            ALTER TABLE chat_messages ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
        EXCEPTION WHEN others THEN
            -- Ignore if identity/default already configured.
            NULL;
        END;
    END IF;

    -- Some legacy schemas require session_id while current app uses thread_id.
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'chat_messages'
          AND column_name = 'session_id'
    ) THEN
        UPDATE chat_messages
        SET session_id = thread_id
        WHERE session_id IS NULL
          AND thread_id IS NOT NULL;

        SELECT is_nullable INTO v_session_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'chat_messages'
          AND column_name = 'session_id'
        LIMIT 1;

        IF v_session_nullable = 'NO' THEN
            ALTER TABLE chat_messages ALTER COLUMN session_id DROP NOT NULL;
        END IF;
    END IF;
END $$;

-- 14. Create CLIENT_AGENT_LATEST_RESULTS table
CREATE TABLE IF NOT EXISTS client_agent_latest_results (
    client_id TEXT NOT NULL,
    agent_key TEXT NOT NULL,
    result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    thread_id UUID NULL,
    intent TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (client_id, agent_key)
);

CREATE INDEX IF NOT EXISTS idx_client_agent_latest_results_updated
    ON client_agent_latest_results(client_id, updated_at DESC);

-- 15. Create CLIENT_LATEST_ANALYSIS_SNAPSHOTS table
CREATE TABLE IF NOT EXISTS client_latest_analysis_snapshots (
    client_id TEXT PRIMARY KEY,
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    executive_summary TEXT NULL,
    thread_id UUID NULL,
    intent TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_client_latest_analysis_snapshots_updated
    ON client_latest_analysis_snapshots(updated_at DESC);

-- 16. Create RECOMMENDATION_OUTCOMES table
CREATE TABLE IF NOT EXISTS recommendation_outcomes (
    client_id TEXT NOT NULL,
    thread_id TEXT NOT NULL DEFAULT 'global',
    suggestion_id TEXT NOT NULL,
    title TEXT NULL,
    description TEXT NULL,
    prompt TEXT NULL,
    source TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    accepted_at TIMESTAMPTZ NULL,
    submitted_at TIMESTAMPTZ NULL,
    owner TEXT NULL,
    due_date DATE NULL,
    expected_impact TEXT NULL,
    actual_impact TEXT NULL,
    outcome_notes TEXT NULL,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (client_id, thread_id, suggestion_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_client_updated
    ON recommendation_outcomes(client_id, last_updated_at DESC);

-- ============================================================================
-- Insert a default agent for the application
-- ============================================================================
INSERT INTO agents (name) VALUES ('Default Agent')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Done! Your Supabase database is now initialized.
-- ============================================================================

