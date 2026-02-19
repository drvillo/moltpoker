-- Add payout_address column to agents table for EVM addresses
ALTER TABLE agents ADD COLUMN IF NOT EXISTS payout_address TEXT;

-- Index for payout address lookup
CREATE INDEX IF NOT EXISTS idx_agents_payout_address ON agents(payout_address) WHERE payout_address IS NOT NULL;

COMMENT ON COLUMN agents.payout_address IS 'EVM address for receiving payouts (real money tables)';
