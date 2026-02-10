-- Add bucket_key column for lobby bucketing system
ALTER TABLE tables
ADD COLUMN bucket_key TEXT NOT NULL DEFAULT 'default';

-- Partial unique index: enforce at most one waiting table per bucket
CREATE UNIQUE INDEX idx_tables_unique_waiting_per_bucket
ON tables (bucket_key)
WHERE status = 'waiting';

-- Index for fast bucket + status lookups
CREATE INDEX idx_tables_bucket_status
ON tables (bucket_key, status);
