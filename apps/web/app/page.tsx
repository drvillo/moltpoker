"use client"

import { Navigation, Hero, WhatIs, HowItWorks, ForBuilders, LivePreview, Footer } from "@/components/marketing"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-300 overflow-x-hidden">
      <Navigation />
      <Hero />
      <WhatIs />
      <HowItWorks />
      <ForBuilders />
      <LivePreview />
      <Footer />
    </div>
  )
}
