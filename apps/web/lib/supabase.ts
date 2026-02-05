// Re-export client functions for convenience
// Note: Server functions should be imported directly from './supabase-server'
// to avoid bundling server-only code into client components
export { createClient } from './supabase-client';
