import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { mockRedirect, mockCreateServerClient } = vi.hoisted(() => {
  return {
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`)
    }),
    mockCreateServerClient: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('@moltpoker/shared', () => ({
  parseAdminEmails: (emails: string) =>
    emails
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  isAdminEmail: (email: string, adminEmails: string[]) => adminEmails.includes(email.toLowerCase()),
}))

import AdminLayout, { dynamic } from '@/app/admin/layout'

function setSessionEmail(email: string | null) {
  const session = email ? { user: { email } } : null
  mockCreateServerClient.mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session },
      }),
    },
  })
}

describe('AdminLayout', () => {
  const originalAdminAuthEnabled = process.env.ADMIN_AUTH_ENABLED
  const originalAdminEmails = process.env.ADMIN_EMAILS

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_AUTH_ENABLED = 'true'
    process.env.ADMIN_EMAILS = 'admin@example.com'
  })

  afterEach(() => {
    process.env.ADMIN_AUTH_ENABLED = originalAdminAuthEnabled
    process.env.ADMIN_EMAILS = originalAdminEmails
  })

  it('forces dynamic rendering so auth uses runtime env', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('redirects to login when admin auth is enabled and session is missing', async () => {
    setSessionEmail(null)

    await expect(AdminLayout({ children: <div>Dashboard</div> })).rejects.toThrow('REDIRECT:/login')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects forbidden when user email is not in admin allowlist', async () => {
    setSessionEmail('user@example.com')

    await expect(AdminLayout({ children: <div>Dashboard</div> })).rejects.toThrow(
      'REDIRECT:/login?error=forbidden'
    )
    expect(mockRedirect).toHaveBeenCalledWith('/login?error=forbidden')
  })

  it('does not redirect when auth is disabled, even without session', async () => {
    process.env.ADMIN_AUTH_ENABLED = 'false'
    setSessionEmail(null)

    await expect(AdminLayout({ children: <div>Dashboard</div> })).resolves.toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('reads ADMIN_AUTH_ENABLED at request time (can change after module import)', async () => {
    setSessionEmail(null)

    process.env.ADMIN_AUTH_ENABLED = 'true'
    await expect(AdminLayout({ children: <div>Dashboard</div> })).rejects.toThrow('REDIRECT:/login')

    vi.clearAllMocks()
    process.env.ADMIN_AUTH_ENABLED = 'false'
    await expect(AdminLayout({ children: <div>Dashboard</div> })).resolves.toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
