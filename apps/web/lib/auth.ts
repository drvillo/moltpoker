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
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.email) return false;

  // Check against ADMIN_EMAILS env var (would need to be exposed via API)
  // For now, we'll check this on the server side
  return false; // Will be checked server-side
}
