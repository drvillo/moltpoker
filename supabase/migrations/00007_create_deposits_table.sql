-- Create deposits table for tracking Vault deposits
CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY DEFAULT 'dep_' || gen_random_uuid()::TEXT,
    table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    seat_id INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'expired_late', 'invalid_amount', 'pending_confirmation', 'refunded')),
    amount_usdc NUMERIC(20, 6) NOT NULL,
    expected_amount_usdc NUMERIC(20, 6) NOT NULL,
    chain_id INT NOT NULL,
    token_address TEXT NOT NULL,
    vault_address TEXT NOT NULL,
    vault_tx_hash TEXT,
    vault_event_name TEXT,
    vault_event_index INT,
    confirmation_block BIGINT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(table_id, agent_id)
);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

-- Index for agent lookup
CREATE INDEX IF NOT EXISTS idx_deposits_agent_id ON deposits(agent_id);

-- Index for table lookup
CREATE INDEX IF NOT EXISTS idx_deposits_table_id ON deposits(table_id);

-- Index for tx hash lookup
CREATE INDEX IF NOT EXISTS idx_deposits_vault_tx_hash ON deposits(vault_tx_hash) WHERE vault_tx_hash IS NOT NULL;

-- Index for expired deposits
CREATE INDEX IF NOT EXISTS idx_deposits_expires_at ON deposits(expires_at) WHERE status = 'pending';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_deposits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deposits_updated_at_trigger
    BEFORE UPDATE ON deposits
    FOR EACH ROW
    EXECUTE FUNCTION update_deposits_updated_at();

COMMENT ON TABLE deposits IS 'Vault deposit records for real money tables';
COMMENT ON COLUMN deposits.id IS 'Unique deposit identifier prefixed with dep_';
COMMENT ON COLUMN deposits.table_id IS 'Table associated with this deposit';
COMMENT ON COLUMN deposits.agent_id IS 'Agent making the deposit';
COMMENT ON COLUMN deposits.seat_id IS 'Seat ID for this deposit';
COMMENT ON COLUMN deposits.status IS 'Current deposit status: pending, settled, expired_late, invalid_amount, pending_confirmation, refunded';
COMMENT ON COLUMN deposits.amount_usdc IS 'Actual deposited amount in USDC';
COMMENT ON COLUMN deposits.expected_amount_usdc IS 'Expected deposit amount in USDC';
COMMENT ON COLUMN deposits.vault_tx_hash IS 'Transaction hash of the deposit';
COMMENT ON COLUMN deposits.vault_event_name IS 'Vault event name (e.g., DepositReceived)';
COMMENT ON COLUMN deposits.vault_event_index IS 'Event log index in the transaction';
COMMENT ON COLUMN deposits.confirmation_block IS 'Block number where deposit was confirmed';
COMMENT ON COLUMN deposits.expires_at IS 'Timestamp when deposit request expires';
