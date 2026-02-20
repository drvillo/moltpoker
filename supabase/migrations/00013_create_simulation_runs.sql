CREATE TABLE simulation_runs (
  id TEXT PRIMARY KEY DEFAULT 'run_' || gen_random_uuid()::TEXT,
  config_id TEXT NOT NULL REFERENCES simulation_configs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  table_id TEXT REFERENCES tables(id) ON DELETE SET NULL,
  hands_played INT DEFAULT 0,
  log_dir TEXT,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX simulation_runs_config_id_idx ON simulation_runs(config_id);
CREATE INDEX simulation_runs_status_idx ON simulation_runs(status);
