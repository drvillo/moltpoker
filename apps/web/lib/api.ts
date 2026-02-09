import type { TableConfig } from '@moltpoker/shared';

/**
 * Build API URL from environment variables.
 *
 * Protocol is explicit via NEXT_PUBLIC_API_PROTOCOL (default "http").
 * NODE_ENV is NOT used because `next build` hard-codes "production"
 * into the client bundle, which would force https even for local dev.
 */
function getApiUrl(): string {
  // Support backward compatibility: check for old NEXT_PUBLIC_API_URL first
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Build from components — default to http for local development
  const protocol = process.env.NEXT_PUBLIC_API_PROTOCOL || 'http';
  const host = process.env.NEXT_PUBLIC_API_HOST || 'localhost';
  const port = process.env.NEXT_PUBLIC_API_PUBLIC_PORT || '9000';
  
  return `${protocol}://${host}:${port}`;
}

const API_URL = getApiUrl();

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Get auth headers for API requests
 */
async function getAuthHeaders(hasBody: boolean): Promise<HeadersInit> {
  const headers: HeadersInit = {};

  // Only set Content-Type if there's a body
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  // Get Supabase session token
  if (typeof window !== 'undefined') {
    try {
      const { createClient } = await import('./supabase');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (err) {
      // Ignore auth errors for public endpoints
    }
  }

  return headers;
}

/**
 * Make an API request with error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const hasBody = options.body !== undefined;
  const headers = await getAuthHeaders(hasBody);

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: {
        code: 'UNKNOWN_ERROR',
        message: `HTTP ${response.status}: ${response.statusText}`,
      },
    }));
    throw error;
  }

  return response.json();
}

/**
 * Admin API client
 */
export const adminApi = {
  /**
   * List all agents
   */
  async listAgents() {
    return apiRequest<{ agents: Array<{
      agent_id: string;
      name: string | null;
      created_at: string;
      last_seen_at: string | null;
      status: 'connected' | 'disconnected';
      current_table_id: string | null;
      current_seat_id: number | null;
    }> }>('/v1/admin/agents');
  },

  /**
   * Get table details
   */
  async getTable(tableId: string) {
    return apiRequest<{
      id: string;
      status: 'waiting' | 'running' | 'ended';
      config: TableConfig;
      seats: Array<{
        seat_id: number;
        agent_id: string | null;
        agent_name: string | null;
        stack: number;
        connected: boolean;
      }>;
      current_hand_number: number | null;
      created_at: string;
    }>(`/v1/admin/tables/${tableId}`);
  },

  /**
   * List tables (uses public endpoint, but with auth for admin context)
   */
  async listTables(status?: string) {
    const query = status ? `?status=${status}` : '';
    const response = await apiRequest<{ tables: Array<{
      id: string;
      status: string;
      config: unknown;
      created_at: Date;
    }> }>(`/v1/tables${query}`);
    return response.tables.map(t => ({ ...t, created_at: new Date(t.created_at).toISOString() }));
  },

  /**
   * Create table
   */
  async createTable(data: { config?: TableConfig; seed?: string }) {
    return apiRequest<{
      id: string;
      status: string;
      config: TableConfig;
      seats: unknown[];
      created_at: string;
    }>('/v1/admin/tables', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Start table
   */
  async startTable(tableId: string) {
    return apiRequest<{ success: boolean; message: string; hand_number?: number }>(
      `/v1/admin/tables/${tableId}/start`,
      { method: 'POST' }
    );
  },

  /**
   * Stop table
   */
  async stopTable(tableId: string) {
    return apiRequest<{ success: boolean; message: string }>(
      `/v1/admin/tables/${tableId}/stop`,
      { method: 'POST' }
    );
  },

  /**
   * Get table events
   */
  async getTableEvents(tableId: string, options?: { fromSeq?: number; limit?: number }) {
    const params = new URLSearchParams();
    if (options?.fromSeq !== undefined) params.set('fromSeq', options.fromSeq.toString());
    if (options?.limit !== undefined) params.set('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{
      events: Array<{
        seq: number;
        type: string;
        payload: unknown;
        created_at: string;
      }>;
      hasMore: boolean;
    }>(`/v1/admin/tables/${tableId}/events${query}`);
  },

  /**
   * Export table events
   */
  async exportTableEvents(tableId: string): Promise<Blob> {
    const url = `${API_URL}/v1/admin/tables/${tableId}/export`;
    const headers = await getAuthHeaders(false);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: {
          code: 'UNKNOWN_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      }));
      throw error;
    }
    return response.blob();
  },

  /**
   * Kick agent from table
   */
  async kickAgent(agentId: string) {
    return apiRequest<{ success: boolean; message: string; table_id: string; seat_id: number }>(
      `/v1/admin/agents/${agentId}/kick`,
      { method: 'POST' }
    );
  },
};
