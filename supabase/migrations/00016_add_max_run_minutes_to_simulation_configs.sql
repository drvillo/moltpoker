ALTER TABLE simulation_configs
ADD COLUMN IF NOT EXISTS max_run_minutes INT NOT NULL DEFAULT 2 CHECK (max_run_minutes >= 1);
