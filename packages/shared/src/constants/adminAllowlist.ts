/**
 * Parse a comma-separated ADMIN_EMAILS string into a normalized array.
 */
export function parseAdminEmails(raw: string): string[] {
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Check if an email is in the admin allowlist.
 * Returns false when the allowlist is empty (block-all by default).
 */
export function isAdminEmail(email: string, adminEmails: string[]): boolean {
  if (adminEmails.length === 0) return false
  return adminEmails.includes(email.trim().toLowerCase())
}
