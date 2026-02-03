-- Create agents table for storing registered AI agents
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY DEFAULT 'agt_' || gen_random_uuid()::TEXT,
    name TEXT,
    api_key_hash TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ
);

-- Index for API key lookups
CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);

-- Index for name lookups
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);

COMMENT ON TABLE agents IS 'Registered AI agents that can play poker';
COMMENT ON COLUMN agents.id IS 'Unique agent identifier prefixed with agt_';
COMMENT ON COLUMN agents.name IS 'Optional display name for the agent';
COMMENT ON COLUMN agents.api_key_hash IS 'SHA-256 hash of the agent API key';
COMMENT ON COLUMN agents.metadata IS 'Optional metadata about the agent';
COMMENT ON COLUMN agents.last_seen_at IS 'Last activity timestamp';
