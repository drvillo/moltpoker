-- Create payouts table for tracking Vault payouts
CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY DEFAULT 'pay_' || gen_random_uuid()::TEXT,
    table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    seat_id INT NOT NULL,
    settlement_type TEXT NOT NULL CHECK (settlement_type IN ('payout', 'refund')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'pending_confirmation', 'refund_pending_manual')),
    amount_usdc NUMERIC(20, 6) NOT NULL,
    final_stack INT,
    vault_tx_hash TEXT,
    vault_event_name TEXT,
    vault_event_index INT,
    confirmation_block BIGINT,
    settlement_batch_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(table_id, agent_id, settlement_type)
);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);

-- Index for agent lookup
CREATE INDEX IF NOT EXISTS idx_payouts_agent_id ON payouts(agent_id);

-- Index for table lookup
CREATE INDEX IF NOT EXISTS idx_payouts_table_id ON payouts(table_id);

-- Index for tx hash lookup
CREATE INDEX IF NOT EXISTS idx_payouts_vault_tx_hash ON payouts(vault_tx_hash) WHERE vault_tx_hash IS NOT NULL;

-- Index for settlement batch
CREATE INDEX IF NOT EXISTS idx_payouts_settlement_batch_id ON payouts(settlement_batch_id) WHERE settlement_batch_id IS NOT NULL;

-- Index for settlement type
CREATE INDEX IF NOT EXISTS idx_payouts_settlement_type ON payouts(settlement_type);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_payouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payouts_updated_at_trigger
    BEFORE UPDATE ON payouts
    FOR EACH ROW
    EXECUTE FUNCTION update_payouts_updated_at();

COMMENT ON TABLE payouts IS 'Vault payout and refund records for real money tables';
COMMENT ON COLUMN payouts.id IS 'Unique payout identifier prefixed with pay_';
COMMENT ON COLUMN payouts.table_id IS 'Table associated with this payout';
COMMENT ON COLUMN payouts.agent_id IS 'Agent receiving the payout';
COMMENT ON COLUMN payouts.seat_id IS 'Seat ID for this payout';
COMMENT ON COLUMN payouts.settlement_type IS 'Type of settlement: payout or refund';
COMMENT ON COLUMN payouts.status IS 'Current payout status: pending, completed, failed, pending_confirmation, refund_pending_manual';
COMMENT ON COLUMN payouts.amount_usdc IS 'Payout amount in USDC';
COMMENT ON COLUMN payouts.final_stack IS 'Final chip stack (null for refunds)';
COMMENT ON COLUMN payouts.vault_tx_hash IS 'Transaction hash of the payout';
COMMENT ON COLUMN payouts.vault_event_name IS 'Vault event name (e.g., TablePayoutSettled, TableRefundSettled)';
COMMENT ON COLUMN payouts.vault_event_index IS 'Event log index in the transaction';
COMMENT ON COLUMN payouts.confirmation_block IS 'Block number where payout was confirmed';
COMMENT ON COLUMN payouts.settlement_batch_id IS 'Batch ID for grouped settlements';
COMMENT ON COLUMN payouts.error_message IS 'Error message if settlement failed';
