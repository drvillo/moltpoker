import { createClient } from './supabase';

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * Sign out
 */
export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get current session
 */
export async function getSession() {
  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

/**
 * Check if user is admin.
 * Admin status is determined server-side in the admin layout
 * (Supabase session + ADMIN_EMAILS allowlist). Use the useAuth()
 * hook's `isAdmin` flag on the client instead of calling this.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.email) return false;
  // Server-side check is authoritative; this client helper is informational only
  return false;
}
