-- Create sessions table for WebSocket authentication
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT 'ses_' || gen_random_uuid()::TEXT,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    seat_id INT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (table_id, seat_id) REFERENCES seats(table_id, seat_id) ON DELETE CASCADE
);

-- Index for agent session lookups
CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);

-- Index for table session lookups
CREATE INDEX IF NOT EXISTS idx_sessions_table_id ON sessions(table_id);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

COMMENT ON TABLE sessions IS 'Active WebSocket sessions for agents at tables';
COMMENT ON COLUMN sessions.id IS 'Unique session identifier prefixed with ses_';
COMMENT ON COLUMN sessions.expires_at IS 'Session expiration timestamp for security';
