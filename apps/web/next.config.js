const path = require('path');
const fs = require('fs');

// Explicitly load environment variables from root directory (monorepo support)
// Next.js by default only loads from the project directory, but we need root .env.local
// Use __dirname to resolve paths relative to this config file, not process.cwd()
const projectDir = __dirname;
const rootDir = path.resolve(__dirname, '..', '..');

// Load env files using dotenv (same approach as API package)
// Try to require dotenv, fallback to manual parsing if not available
let dotenv;
try {
  dotenv = require('dotenv');
} catch (e) {
  // dotenv not available, use manual file reading
  dotenv = null;
}

const loadedFiles = [];

if (dotenv) {
  // Use dotenv to load from repo root first, then project dir (allows overrides)
  const rootEnvResult = dotenv.config({ path: path.join(rootDir, '.env.local') });
  if (!rootEnvResult.error) loadedFiles.push(path.join(rootDir, '.env.local'));
  
  const projectEnvResult = dotenv.config({ path: path.join(projectDir, '.env.local') });
  if (!projectEnvResult.error) loadedFiles.push(path.join(projectDir, '.env.local'));
} else {
  // Fallback: manually read and parse .env.local files
  const envFiles = [
    path.join(rootDir, '.env.local'),
    path.join(projectDir, '.env.local'),
  ];
  
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            process.env[key] = value;
          }
        }
      }
      loadedFiles.push(envFile);
    }
  }
}

// Verify critical Supabase env vars are loaded
const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const hasSupabaseAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

if (!hasSupabaseUrl || !hasSupabaseAnonKey) {
  const missing = [];
  if (!hasSupabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!hasSupabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  console.error('\n⚠️  Missing required environment variables:', missing.join(', '));
  console.error('   Ensure .env.local exists at repo root or apps/web/');
  console.error('   Loaded env files:', loadedFiles.join(', ') || 'none');
  console.error('   Restart the dev server after adding the variables.\n');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Environment variables are loaded from root .env.local and apps/web/.env.local via dotenv above
  // NEXT_PUBLIC_* vars are automatically available after loading
};

module.exports = nextConfig;
