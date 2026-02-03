-- Create events table for game event logging
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    seq INT NOT NULL,
    hand_number INT,
    type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(table_id, seq)
);

-- Index for table event retrieval
CREATE INDEX IF NOT EXISTS idx_events_table_seq ON events(table_id, seq);

-- Index for hand-specific queries
CREATE INDEX IF NOT EXISTS idx_events_table_hand ON events(table_id, hand_number);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

COMMENT ON TABLE events IS 'Complete event log for deterministic replay';
COMMENT ON COLUMN events.seq IS 'Monotonically increasing sequence number per table';
COMMENT ON COLUMN events.hand_number IS 'Hand number within the session';
COMMENT ON COLUMN events.type IS 'Event type: HAND_START, PLAYER_ACTION, STREET_DEALT, etc.';
COMMENT ON COLUMN events.payload IS 'Event-specific data for replay';
