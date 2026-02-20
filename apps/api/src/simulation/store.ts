import { getDb } from '../db.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentSlotConfig {
  type: string;
  model?: string;
}

export interface TableConfig {
  blinds: { small: number; big: number };
  initialStack: number;
  actionTimeoutMs: number;
}

export interface SimulationConfig {
  id: string;
  name: string;
  status: 'active' | 'paused';
  schedule_type: 'one_off' | 'periodic';
  interval_minutes: number | null;
  cooldown_minutes: number;
  max_hands: number;
  agent_count: number;
  agent_slots: AgentSlotConfig[];
  table_config: TableConfig;
  bucket_key: string;
  created_at: string;
  updated_at: string;
}

export interface SimulationRun {
  id: string;
  config_id: string;
  status: 'running' | 'completed' | 'failed';
  table_id: string | null;
  hands_played: number;
  log_dir: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ProviderApiKey {
  id: string;
  provider: string;
  label: string;
  api_key: string;
  created_at: string;
}

export interface ProviderApiKeyMasked {
  id: string;
  provider: string;
  label: string;
  masked_key: string;
  created_at: string;
}

// ─── Simulation Config CRUD ───────────────────────────────────────────────────

export async function createSimulationConfig(
  data: Omit<SimulationConfig, 'id' | 'created_at' | 'updated_at'>
): Promise<SimulationConfig> {
  const { data: row, error } = await getDb()
    .from('simulation_configs')
    .insert({
      name: data.name,
      status: data.status,
      schedule_type: data.schedule_type,
      interval_minutes: data.interval_minutes,
      cooldown_minutes: data.cooldown_minutes,
      max_hands: data.max_hands,
      agent_count: data.agent_count,
      agent_slots: data.agent_slots,
      table_config: data.table_config,
      bucket_key: data.bucket_key,
    })
    .select()
    .single();
  if (error) throw error;
  return row as SimulationConfig;
}

export async function listSimulationConfigs(): Promise<SimulationConfig[]> {
  const { data, error } = await getDb()
    .from('simulation_configs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SimulationConfig[];
}

export async function getSimulationConfig(id: string): Promise<SimulationConfig | null> {
  const { data, error } = await getDb()
    .from('simulation_configs')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return (data ?? null) as SimulationConfig | null;
}

export async function updateSimulationConfig(
  id: string,
  updates: Partial<Pick<SimulationConfig, 'name' | 'status' | 'interval_minutes' | 'cooldown_minutes' | 'max_hands' | 'agent_count' | 'agent_slots' | 'table_config' | 'bucket_key' | 'schedule_type'>>
): Promise<SimulationConfig> {
  const { data, error } = await getDb()
    .from('simulation_configs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SimulationConfig;
}

export async function deleteSimulationConfig(id: string): Promise<void> {
  const { error } = await getDb().from('simulation_configs').delete().eq('id', id);
  if (error) throw error;
}

export async function pauseAllPeriodicConfigs(): Promise<void> {
  const { error } = await getDb()
    .from('simulation_configs')
    .update({ status: 'paused' })
    .eq('schedule_type', 'periodic')
    .eq('status', 'active');
  if (error) throw error;
}

// ─── Simulation Run CRUD ──────────────────────────────────────────────────────

export async function createSimulationRun(configId: string, logDir: string): Promise<SimulationRun> {
  const { data, error } = await getDb()
    .from('simulation_runs')
    .insert({ config_id: configId, log_dir: logDir })
    .select()
    .single();
  if (error) throw error;
  return data as SimulationRun;
}

export async function updateSimulationRun(
  id: string,
  updates: Partial<Pick<SimulationRun, 'status' | 'table_id' | 'hands_played' | 'error' | 'completed_at' | 'log_dir'>>
): Promise<void> {
  const { error } = await getDb()
    .from('simulation_runs')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function getSimulationRun(id: string): Promise<SimulationRun | null> {
  const { data, error } = await getDb()
    .from('simulation_runs')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return (data ?? null) as SimulationRun | null;
}

export async function listSimulationRuns(configId: string): Promise<SimulationRun[]> {
  const { data, error } = await getDb()
    .from('simulation_runs')
    .select('*')
    .eq('config_id', configId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SimulationRun[];
}

export async function listStaleRunningRuns(): Promise<SimulationRun[]> {
  const { data, error } = await getDb()
    .from('simulation_runs')
    .select('*')
    .eq('status', 'running');
  if (error) throw error;
  return (data ?? []) as SimulationRun[];
}

export async function markRunFailed(id: string, errorMsg: string): Promise<void> {
  await updateSimulationRun(id, {
    status: 'failed',
    error: errorMsg,
    completed_at: new Date().toISOString(),
  });
}

export async function markRunCompleted(id: string, handsPlayed: number): Promise<void> {
  await updateSimulationRun(id, {
    status: 'completed',
    hands_played: handsPlayed,
    completed_at: new Date().toISOString(),
  });
}

// ─── Provider API Keys ────────────────────────────────────────────────────────

export async function createProviderApiKey(
  provider: string,
  label: string,
  apiKey: string
): Promise<ProviderApiKey> {
  const { data, error } = await getDb()
    .from('provider_api_keys')
    .insert({ provider, label, api_key: apiKey })
    .select()
    .single();
  if (error) throw error;
  return data as ProviderApiKey;
}

export async function listProviderApiKeys(): Promise<ProviderApiKeyMasked[]> {
  const { data, error } = await getDb()
    .from('provider_api_keys')
    .select('id, provider, label, api_key, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((k: ProviderApiKey) => ({
    id: k.id,
    provider: k.provider,
    label: k.label,
    masked_key: `...${k.api_key.slice(-4)}`,
    created_at: k.created_at,
  }));
}

export async function listProviderApiKeysFull(): Promise<ProviderApiKey[]> {
  const { data, error } = await getDb()
    .from('provider_api_keys')
    .select('*')
    .order('provider', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProviderApiKey[];
}

export async function deleteProviderApiKey(id: string): Promise<void> {
  const { error } = await getDb().from('provider_api_keys').delete().eq('id', id);
  if (error) throw error;
}

// ─── Provider → env var mapping ───────────────────────────────────────────────

const PROVIDER_ENV_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_ENV_MAP);

export function buildEnvFromApiKeys(keys: ProviderApiKey[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of keys) {
    const envVar = PROVIDER_ENV_MAP[key.provider];
    if (envVar) env[envVar] = key.api_key;
  }
  return env;
}
