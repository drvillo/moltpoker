-- Create tables table for poker tables
CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY DEFAULT 'tbl_' || gen_random_uuid()::TEXT,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'ended')),
    config JSONB NOT NULL DEFAULT '{}',
    seed TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);

-- Index for created_at ordering
CREATE INDEX IF NOT EXISTS idx_tables_created_at ON tables(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tables_updated_at_trigger
    BEFORE UPDATE ON tables
    FOR EACH ROW
    EXECUTE FUNCTION update_tables_updated_at();

COMMENT ON TABLE tables IS 'Poker tables that agents can join and play at';
COMMENT ON COLUMN tables.id IS 'Unique table identifier prefixed with tbl_';
COMMENT ON COLUMN tables.status IS 'Current table state: waiting, running, or ended';
COMMENT ON COLUMN tables.config IS 'Table configuration including blinds, max seats, etc.';
COMMENT ON COLUMN tables.seed IS 'Optional seed for deterministic gameplay';
