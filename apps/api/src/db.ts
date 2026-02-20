import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { config } from './config.js';

let supabase: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (!config.supabaseServiceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required. Add it to .env or .env.local. Get it from Supabase: Project Settings > API > service_role key.'
    );
  }
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabase;
}

// Agent operations
export async function createAgent(
  id: string,
  name: string | null,
  apiKeyHash: string,
  metadata: Record<string, unknown> = {}
) {
  const { data, error } = await getDb()
    .from('agents')
    .insert({
      id,
      name,
      api_key_hash: apiKeyHash,
      metadata,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAgentByApiKeyHash(apiKeyHash: string) {
  const { data, error } = await getDb()
    .from('agents')
    .select()
    .eq('api_key_hash', apiKeyHash)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getAgentById(agentId: string) {
  const { data, error } = await getDb().from('agents').select().eq('id', agentId).single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function updateAgentLastSeen(agentId: string) {
  const { error } = await getDb()
    .from('agents')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', agentId);

  if (error) throw error;
}

// Table operations
export async function createTable(
  id: string,
  configData: Record<string, unknown>,
  seed: string | null = null,
  bucketKey: string = 'default'
) {
  const { data, error } = await getDb()
    .from('tables')
    .insert({
      id,
      status: 'waiting',
      config: configData,
      seed,
      bucket_key: bucketKey,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function findWaitingTableInBucket(bucketKey: string) {
  const { data, error } = await getDb()
    .from('tables')
    .select()
    .eq('bucket_key', bucketKey)
    .eq('status', 'waiting')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function createTableWithBucket(
  id: string,
  bucketKey: string,
  configData: Record<string, unknown>,
  seed: string | null = null
) {
  const { data, error } = await getDb()
    .from('tables')
    .insert({
      id,
      bucket_key: bucketKey,
      status: 'waiting',
      config: configData,
      seed,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTable(tableId: string) {
  const { data, error } = await getDb().from('tables').select().eq('id', tableId).single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function updateTableStatus(tableId: string, status: string) {
  const { error } = await getDb().from('tables').update({ status }).eq('id', tableId);

  if (error) throw error;
}

export async function listTables(status?: string) {
  let query = getDb().from('tables').select();

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Seat operations
export async function createSeats(tableId: string, maxSeats: number) {
  const seats = Array.from({ length: maxSeats }, (_, i) => ({
    table_id: tableId,
    seat_id: i,
    agent_id: null,
    stack: 0,
    is_active: true,
  }));

  const { error } = await getDb().from('seats').insert(seats);
  if (error) throw error;
}

export async function getSeats(tableId: string) {
  const { data, error } = await getDb()
    .from('seats')
    .select('*, agents(name)')
    .eq('table_id', tableId)
    .order('seat_id');

  if (error) throw error;
  return data || [];
}

export async function getSeatByAgentId(tableId: string, agentId: string) {
  const { data, error } = await getDb()
    .from('seats')
    .select()
    .eq('table_id', tableId)
    .eq('agent_id', agentId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function assignSeat(
  tableId: string,
  seatId: number,
  agentId: string,
  initialStack: number
) {
  const { error } = await getDb()
    .from('seats')
    .update({ agent_id: agentId, stack: initialStack, is_active: true })
    .eq('table_id', tableId)
    .eq('seat_id', seatId)
    .is('agent_id', null);

  if (error) throw error;
}

export async function clearSeat(tableId: string, seatId: number) {
  const { error } = await getDb()
    .from('seats')
    .update({ agent_id: null, stack: 0, is_active: false })
    .eq('table_id', tableId)
    .eq('seat_id', seatId);

  if (error) throw error;
}

export interface FinalStackRow {
  seatId: number;
  stack: number;
}

/**
 * Batch-update seat stacks for a table (single DB round-trip).
 * Only updates stack; does not touch agent_id or is_active.
 * Returns the number of rows updated.
 */
export async function updateSeatStacksBatch(
  tableId: string,
  finalStacks: FinalStackRow[]
): Promise<number> {
  if (finalStacks.length === 0) return 0;
  const { data, error } = await getDb().rpc('update_seat_stacks', {
    p_table_id: tableId,
    p_stacks: finalStacks,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function findAvailableSeat(tableId: string, preferredSeat?: number) {
  // First try preferred seat
  if (preferredSeat !== undefined) {
    const { data } = await getDb()
      .from('seats')
      .select()
      .eq('table_id', tableId)
      .eq('seat_id', preferredSeat)
      .is('agent_id', null)
      .single();

    if (data) return data;
  }

  // Find any available seat
  const { data, error } = await getDb()
    .from('seats')
    .select()
    .eq('table_id', tableId)
    .is('agent_id', null)
    .order('seat_id')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// Session operations
export async function createSession(
  id: string,
  agentId: string,
  tableId: string,
  seatId: number,
  expiresAt: Date
) {
  const { data, error } = await getDb()
    .from('sessions')
    .insert({
      id,
      agent_id: agentId,
      table_id: tableId,
      seat_id: seatId,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getSession(sessionId: string) {
  const { data, error } = await getDb().from('sessions').select().eq('id', sessionId).single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function deleteSession(sessionId: string) {
  const { error } = await getDb().from('sessions').delete().eq('id', sessionId);
  if (error) throw error;
}

export async function deleteSessionsByAgent(agentId: string, tableId: string) {
  const { error } = await getDb()
    .from('sessions')
    .delete()
    .eq('agent_id', agentId)
    .eq('table_id', tableId);

  if (error) throw error;
}

// Event operations
export async function createEvent(
  tableId: string,
  seq: number,
  type: string,
  payload: Record<string, unknown>,
  handNumber?: number
) {
  const { data, error } = await getDb()
    .from('events')
    .insert({
      table_id: tableId,
      seq,
      type,
      payload,
      hand_number: handNumber ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getEvents(tableId: string, fromSeq?: number) {
  let query = getDb()
    .from('events')
    .select()
    .eq('table_id', tableId)
    .order('seq', { ascending: true });

  if (fromSeq !== undefined) {
    query = query.gte('seq', fromSeq);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function getLastEventSeq(tableId: string): Promise<number> {
  const { data, error } = await getDb()
    .from('events')
    .select('seq')
    .eq('table_id', tableId)
    .order('seq', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data?.seq ?? 0;
}

/**
 * Get the latest TABLE_ENDED event for a table (for backfilling seat stacks).
 */
export async function getLatestTableEndedEvent(tableId: string): Promise<{
  payload: { finalStacks?: Array<{ seatId: number; agentId: string; stack: number }> };
} | null> {
  const { data, error } = await getDb()
    .from('events')
    .select('payload')
    .eq('table_id', tableId)
    .eq('type', 'TABLE_ENDED')
    .order('seq', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
