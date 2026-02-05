import { redirect } from 'next/navigation';

import { createServerClient } from '@/lib/supabase-server';

export default async function Home() {
  const hasSupabaseEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
    && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (!hasSupabaseEnv) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-xl font-semibold">Supabase configuration missing</h1>
          <p className="mt-3 text-sm">
            Set <code className="font-semibold">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="font-semibold">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code className="font-semibold">apps/web/.env.local</code> (or the root <code className="font-semibold">.env.local</code>) and restart the dev server.
          </p>
        </div>
      </main>
    )
  }

  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    redirect('/admin/dashboard');
  }

  redirect('/login');
}
