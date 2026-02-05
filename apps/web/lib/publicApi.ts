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

/**
 * Public API client (no auth required)
 */
export const publicApi = {
  /**
   * List tables (public endpoint)
   */
  async listTables(status?: string) {
    const query = status ? `?status=${status}` : '';
    const response = await fetch(`${API_URL}/v1/tables${query}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { tables: Array<{
      id: string;
      status: string;
      config: unknown;
      created_at: Date;
    }> };
    return data.tables.map(t => ({ ...t, created_at: new Date(t.created_at).toISOString() }));
  },
};
