import { isAdminEmail, parseAdminEmails } from "@moltpoker/shared"
import { redirect } from "next/navigation"

import { createServerClient } from "@/lib/supabase-server"
import { AuthProvider } from "@/providers/AuthProvider"

export const dynamic = "force-dynamic"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const adminAuthEnabled = process.env.ADMIN_AUTH_ENABLED === "true"
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS || "")

  if (adminAuthEnabled) {
    let userEmail: string | null = null

    try {
      const supabase = await createServerClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      userEmail = session?.user?.email ?? null
    } catch {
      // Supabase unavailable — treat as unauthenticated
    }

    if (!userEmail) redirect("/login")
    const isAllowed = isAdminEmail(userEmail, adminEmails)
    if (!isAllowed) redirect("/login?error=forbidden")
  }

  return (
    <AuthProvider isAdmin>
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
                  href="/admin/simulations"
                  className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                >
                  Simulations
                </a>
                <a
                  href="/admin/api-keys"
                  className="text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                >
                  API Keys
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
