import type { MetadataRoute } from "next"

import { getCanonicalUrl } from "@/lib/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    {
      url: getCanonicalUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: getCanonicalUrl("/tables"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ]
}
