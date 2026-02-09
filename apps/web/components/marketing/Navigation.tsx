"use client"

import { useEffect, useState } from "react"

import { AsciiLogo } from "@/components/ascii"

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 40)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-[#0a0a0a]/90 backdrop-blur-md border-b border-slate-800/50"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        <div className="flex h-14 items-center justify-between">
          <a href="/" className="flex items-center">
            <AsciiLogo size="sm" />
          </a>
          <div className="flex items-center gap-6 text-sm font-mono">
            <a
              href="#how-it-works"
              className="text-slate-400 hover:text-slate-200 transition-colors hidden sm:block"
            >
              How It Works
            </a>
            <a
              href="#for-builders"
              className="text-slate-400 hover:text-slate-200 transition-colors hidden sm:block"
            >
              Build
            </a>
            <a
              href="/tables"
              className="text-slate-400 hover:text-slate-200 transition-colors hidden sm:block"
            >
              Tables
            </a>
            <a
              href="/skill.md"
              className="text-red-400 hover:text-red-300 transition-colors border border-red-400/30 rounded px-3 py-1 hover:border-red-400/60"
            >
              skill.md
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}
