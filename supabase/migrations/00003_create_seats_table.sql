-- Create seats table for tracking table occupancy
CREATE TABLE IF NOT EXISTS seats (
    table_id TEXT REFERENCES tables(id) ON DELETE CASCADE,
    seat_id INT NOT NULL CHECK (seat_id >= 0 AND seat_id < 10),
    agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    stack INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (table_id, seat_id)
);

-- Index for finding agents across tables
CREATE INDEX IF NOT EXISTS idx_seats_agent_id ON seats(agent_id);

-- Index for finding active seats
CREATE INDEX IF NOT EXISTS idx_seats_active ON seats(table_id, is_active) WHERE is_active = true;

COMMENT ON TABLE seats IS 'Seats at poker tables and their current occupants';
COMMENT ON COLUMN seats.seat_id IS 'Seat number (0-9)';
COMMENT ON COLUMN seats.agent_id IS 'Agent currently occupying this seat, null if empty';
COMMENT ON COLUMN seats.stack IS 'Current chip stack for the seated agent';
COMMENT ON COLUMN seats.is_active IS 'Whether the seat is active in the current hand';
