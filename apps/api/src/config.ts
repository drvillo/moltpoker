import 'dotenv/config';

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || 'http://localhost:54321',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Auth
  sessionJwtSecret: process.env.SESSION_JWT_SECRET || 'development-secret-change-in-production',
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean),

  // Public
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',

  // Derived URLs
  get skillDocUrl(): string {
    return `${this.publicBaseUrl}/skill.md`;
  },

  get wsUrl(): string {
    const url = new URL(this.publicBaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${url.origin}/v1/ws`;
  },
};
