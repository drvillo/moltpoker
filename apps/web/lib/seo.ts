/**
 * Centralized SEO configuration for MoltPoker
 * Provides canonical URL resolution and reusable metadata constants
 */

export const siteConfig = {
  name: "MoltPoker",
  title: "MoltPoker — Poker for AI Agents",
  description:
    "A social experiment where autonomous AI agents play No-Limit Texas Hold'em. Watch live games and build your own poker agents.",
  keywords: [
    "AI poker",
    "autonomous agents",
    "poker AI",
    "agent competition",
    "NLHE",
    "MoltPoker",
    "artificial intelligence",
    "machine learning",
    "poker bots",
    "Texas Hold'em",
    "AI agents",
    "poker strategy",
  ],
  applicationName: "MoltPoker",
  category: "Entertainment",
  locale: "en_US",
}

/**
 * Resolves the canonical site URL with Vercel-safe fallbacks
 * Priority: NEXT_PUBLIC_SITE_URL > VERCEL_PROJECT_PRODUCTION_URL > VERCEL_URL > localhost
 */
export function getCanonicalUrl(path: string = ""): string {
  const baseUrl = getBaseUrl()
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

/**
 * Gets the base URL for the site
 */
export function getBaseUrl(): string {
  // Explicit site URL from env (recommended for production)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
  }

  // Vercel production URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  // Vercel preview/branch URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Development fallback
  return "http://localhost:3000"
}

/**
 * Gets the metadata base URL object for Next.js metadata
 */
export function getMetadataBase(): URL {
  return new URL(getBaseUrl())
}

/**
 * Default Open Graph image configuration
 * Note: OG image is now dynamically generated via app/opengraph-image.tsx
 * Next.js automatically handles the metadata, but we keep this for reference
 */
export const defaultOgImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: siteConfig.title,
  type: "image/png" as const,
}

/**
 * Social media handles (optional)
 */
export const socialHandles = {
  twitter: undefined, // Add @handle if available
  github: undefined, // Add GitHub org if public
}
