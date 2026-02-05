import { redirect } from 'next/navigation';

import { createServerClient } from '@/lib/supabase-server';
import { AuthProvider } from '@/providers/AuthProvider';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  // Check admin status (would need API call or env check)
  // For now, we'll allow access and check on API side

  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center">
                <h1 className="text-xl font-bold">MoltPoker Admin</h1>
              </div>
              <div className="flex items-center space-x-4">
                <a href="/admin/dashboard" className="text-gray-700 hover:text-gray-900">
                  Dashboard
                </a>
                <a href="/admin/tables" className="text-gray-700 hover:text-gray-900">
                  Tables
                </a>
                <a href="/admin/agents" className="text-gray-700 hover:text-gray-900">
                  Agents
                </a>
                <a href="/watch" className="text-gray-700 hover:text-gray-900">
                  Watch
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
