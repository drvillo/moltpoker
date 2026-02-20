-- One-time cleanup: remove simulation configs with invalid slot/count shape.
-- simulation_runs rows are removed via FK cascade (config_id -> simulation_configs.id ON DELETE CASCADE).
DELETE FROM simulation_configs
WHERE CASE
  WHEN jsonb_typeof(agent_slots) = 'array'
    THEN jsonb_array_length(agent_slots) <> agent_count
  ELSE TRUE
END;
