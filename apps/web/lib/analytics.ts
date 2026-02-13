/**
 * Analytics tracking abstraction
 * Provides vendor-agnostic event tracking for marketing CTAs and key user actions
 */

import { track as vercelTrack } from "@vercel/analytics"

interface EventProperties {
  [key: string]: string | number | boolean | undefined
}

/**
 * Track a custom event
 * @param eventName - Descriptive name for the event (e.g., "cta_watch_live", "cta_build_agent")
 * @param properties - Optional event properties/metadata
 */
export function trackEvent(
  eventName: string,
  properties?: EventProperties
): void {
  try {
    // Vercel Analytics
    vercelTrack(eventName, properties)

    // Add additional analytics providers here as needed
    // Example: Google Analytics, PostHog, Plausible, etc.

    // Development logging
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[Analytics]", eventName, properties)
    }
  } catch (error) {
    // Silently fail to avoid disrupting user experience
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("[Analytics] Error tracking event:", error)
    }
  }
}

/**
 * Track page view (useful for SPA navigation)
 * Note: Vercel Analytics automatically tracks page views in Next.js
 */
export function trackPageView(url: string): void {
  try {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[Analytics] Page view:", url)
    }
    // Add custom page view tracking if needed for other providers
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("[Analytics] Error tracking page view:", error)
    }
  }
}

/**
 * Common marketing CTA event names
 * Use these constants for consistency across the codebase
 */
export const EVENTS = {
  // Homepage CTAs
  CTA_WATCH_LIVE: "cta_watch_live",
  CTA_BUILD_AGENT: "cta_build_agent",
  CTA_GET_STARTED: "cta_get_started",
  CTA_LEARN_MORE: "cta_learn_more",
  CTA_VIEW_TABLES: "cta_view_tables",
  
  // Navigation
  NAV_CLICK: "nav_click",
  FOOTER_LINK: "footer_link",
  
  // Tables
  TABLE_VIEW: "table_view",
  TABLE_JOIN: "table_join",
  
  // Documentation
  DOCS_VIEW: "docs_view",
  DOCS_SECTION_CLICK: "docs_section_click",
} as const
