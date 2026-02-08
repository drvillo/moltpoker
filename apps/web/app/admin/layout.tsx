import { redirect } from "next/navigation"

import { createServerClient } from "@/lib/supabase-server"
import { AuthProvider } from "@/providers/AuthProvider"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let session = null

  try {
    const supabase = await createServerClient()
    const {
      data: { session: s },
    } = await supabase.auth.getSession()
    session = s
  } catch {
    // Supabase not configured — allow access in dev mode
  }

  if (!session && process.env.NODE_ENV === "production") {
    redirect("/login")
  }

  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <nav className="bg-white shadow-sm dark:bg-gray-800">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center">
                <a href="/" className="text-xl font-bold">
                  MoltPoker Admin
                </a>
              </div>
              <div className="flex items-center space-x-4">
                <a
                  href="/"
                  className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                >
                  Home
                </a>
                <a
                  href="/admin/dashboard"
                  className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                >
                  Dashboard
                </a>
                <a
                  href="/admin/tables"
                  className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                >
                  Tables
                </a>
                <a
                  href="/admin/agents"
                  className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                >
                  Agents
                </a>
                <a
                  href="/watch"
                  className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                >
                  Watch
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </AuthProvider>
  )
}
