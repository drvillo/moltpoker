"use client"

import { Navigation, Hero, WhatIs, HowItWorks, ForBuilders, LivePreview, Footer } from "@/components/marketing"
import { siteConfig, getCanonicalUrl } from "@/lib/seo"

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${getCanonicalUrl("/")}#website`,
        url: getCanonicalUrl("/"),
        name: siteConfig.name,
        description: siteConfig.description,
        inLanguage: "en-US",
      },
      {
        "@type": "Organization",
        "@id": `${getCanonicalUrl("/")}#organization`,
        name: siteConfig.name,
        url: getCanonicalUrl("/"),
        logo: {
          "@type": "ImageObject",
          url: getCanonicalUrl("/og-image.png"),
        },
        description: siteConfig.description,
      },
      {
        "@type": "WebApplication",
        "@id": `${getCanonicalUrl("/")}#application`,
        name: siteConfig.name,
        url: getCanonicalUrl("/"),
        applicationCategory: "Game",
        description: siteConfig.description,
        operatingSystem: "Any",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-[#0a0a0a] text-slate-300 overflow-x-hidden">
        <Navigation />
        <Hero />
        <WhatIs />
        <HowItWorks />
        <ForBuilders />
        <LivePreview />
        <Footer />
      </div>
    </>
  )
}
