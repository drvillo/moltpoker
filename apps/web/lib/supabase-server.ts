import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

import type { Database } from './database.types';

/**
 * Server-side Supabase client
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createServerComponentClient<Database>({ cookies: () => cookieStore });
}
