/**
 * Build API URL from environment variables
 */
function getApiUrl(): string {
  // Support backward compatibility: check for old NEXT_PUBLIC_API_URL first
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Build from components
  // NODE_ENV is available in Next.js (replaced at build time)
  const nodeEnv = process.env.NODE_ENV || 'development';
  const protocol = nodeEnv === 'production' ? 'https' : 'http';
  const host = process.env.NEXT_PUBLIC_API_HOST || 'localhost';
  const port = process.env.NEXT_PUBLIC_API_PUBLIC_PORT || '9000';
  
  return `${protocol}://${host}:${port}`;
}

const API_URL = getApiUrl();

export interface PublicSeat {
  seatId: number
  agentId: string | null
  agentName: string | null
  stack: number
  isActive: boolean
}

export interface PublicTableConfig {
  blinds: { small: number; big: number }
  maxSeats: number
  initialStack: number
  actionTimeoutMs: number
}

export interface PublicTableListItem {
  id: string
  status: "waiting" | "running" | "ended"
  config: PublicTableConfig
  seats: PublicSeat[]
  availableSeats: number
  playerCount: number
  created_at: string
  bucket_key?: string
}

export interface PublicTableDetail {
  id: string
  status: "waiting" | "running" | "ended"
  config: PublicTableConfig
  seats: PublicSeat[]
  availableSeats: number
  playerCount: number
  created_at: string
  bucket_key?: string
}

export interface PublicTableEvent {
  seq: number
  type: string
  payload: unknown
  created_at: string
}

/**
 * Public API client (no auth required)
 */
export const publicApi = {
  /**
   * List tables (public endpoint)
   */
  async listTables(status?: "waiting" | "running" | "ended"): Promise<PublicTableListItem[]> {
    const query = status ? `?status=${status}` : ''
    const response = await fetch(`${API_URL}/v1/tables${query}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json() as { tables: Array<PublicTableListItem & { created_at: Date }> }
    return data.tables.map(t => ({ ...t, created_at: new Date(t.created_at).toISOString() }))
  },

  /**
   * Get table details (public endpoint)
   */
  async getTable(tableId: string): Promise<PublicTableDetail> {
    const response = await fetch(`${API_URL}/v1/tables/${tableId}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json() as PublicTableDetail & { created_at: Date }
    return { ...data, created_at: new Date(data.created_at).toISOString() }
  },

  /**
   * Get table events (public endpoint)
   */
  async getTableEvents(
    tableId: string,
    options?: { fromSeq?: number; limit?: number }
  ): Promise<{ events: PublicTableEvent[]; hasMore: boolean }> {
    const params = new URLSearchParams()
    if (options?.fromSeq !== undefined) params.set('fromSeq', String(options.fromSeq))
    if (options?.limit !== undefined) params.set('limit', String(options.limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await fetch(`${API_URL}/v1/tables/${tableId}/events${query}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json() as Promise<{ events: PublicTableEvent[]; hasMore: boolean }>
  },
};
