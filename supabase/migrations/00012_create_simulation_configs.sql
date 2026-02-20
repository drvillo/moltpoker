CREATE TABLE simulation_configs (
  id TEXT PRIMARY KEY DEFAULT 'sim_' || gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused'
    CHECK (status IN ('active', 'paused')),
  schedule_type TEXT NOT NULL DEFAULT 'one_off'
    CHECK (schedule_type IN ('one_off', 'periodic')),
  interval_minutes INT,
  cooldown_minutes INT DEFAULT 5,
  max_hands INT NOT NULL DEFAULT 20,
  agent_count INT NOT NULL,
  agent_slots JSONB NOT NULL,
  table_config JSONB NOT NULL,
  bucket_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_simulation_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER simulation_configs_updated_at
  BEFORE UPDATE ON simulation_configs
  FOR EACH ROW EXECUTE FUNCTION update_simulation_configs_updated_at();
