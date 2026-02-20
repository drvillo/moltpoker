CREATE TABLE provider_api_keys (
  id TEXT PRIMARY KEY DEFAULT 'key_' || gen_random_uuid()::TEXT,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX provider_api_keys_provider_idx ON provider_api_keys(provider);
