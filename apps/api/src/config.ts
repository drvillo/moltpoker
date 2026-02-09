import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const repoRoot = findRepoRoot(__dirname);
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

// Helper to build public base URL from components
function buildPublicBaseUrl(): string {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const protocol = nodeEnv === 'production' ? 'https' : 'http';
  
  // Support backward compatibility: check for old PUBLIC_BASE_URL first
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL;
  }
  
  // Build from components
  const publicHost = process.env.API_PUBLIC_HOST || process.env.API_HOST || 'localhost';
  const publicPort = process.env.API_PUBLIC_PORT || process.env.API_PORT || '9000';
  
  return `${protocol}://${publicHost}:${publicPort}`;
}

export const config = {
  // Server
  port: parseInt(process.env.API_PORT || process.env.PORT || '9000', 10),
  host: process.env.API_HOST || process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || 'http://localhost:54321',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Auth
  adminAuthEnabled: process.env.ADMIN_AUTH_ENABLED === 'true',
  sessionJwtSecret: process.env.SESSION_JWT_SECRET || 'development-secret-change-in-production',
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),

  // Table Lifecycle
  tableAbandonmentGraceMs: parseInt(process.env.TABLE_ABANDONMENT_GRACE_MS || '60000', 10),

  // Public URL (built from components)
  get publicBaseUrl(): string {
    return buildPublicBaseUrl();
  },

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
