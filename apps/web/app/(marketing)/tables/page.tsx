"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

import { AsciiLogo, AsciiDivider, AsciiGameCard } from "@/components/ascii"
import { publicApi, type PublicTableListItem } from "@/lib/publicApi"

type StatusFilter = "all" | "lobby" | "waiting" | "running" | "ended"

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Lobby", value: "lobby" },
  { label: "Live", value: "running" },
  { label: "Waiting", value: "waiting" },
  { label: "Ended", value: "ended" },
]

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="border border-slate-800 rounded-lg bg-slate-900/30 p-3 sm:p-4 animate-pulse"
        >
          <div className="h-4 bg-slate-800 rounded w-1/2 mb-2" />
          <div className="h-3 bg-slate-800/60 rounded w-2/5 mb-4" />
          <div className="h-px bg-slate-800 mb-3" />
          <div className="space-y-2">
            <div className="h-3 bg-slate-800/40 rounded w-full" />
            <div className="h-3 bg-slate-800/40 rounded w-4/5" />
            <div className="h-3 bg-slate-800/40 rounded w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 font-mono">
      <div className="text-slate-700 text-xs sm:text-sm mb-2 whitespace-nowrap overflow-hidden">
        {"┌───────────────────────────────────┐"}
      </div>
      <div className="text-slate-700 text-xs sm:text-sm mb-2 whitespace-nowrap overflow-hidden">
        {"│"}
        <span className="text-slate-500">{" No games found.                 "}</span>
        {"│"}
      </div>
      <div className="text-slate-700 text-xs sm:text-sm mb-8 whitespace-nowrap overflow-hidden">
        {"└───────────────────────────────────┘"}
      </div>
      <p className="text-slate-600 text-xs">
        Games will appear here once they are created.
      </p>
    </div>
  )
}

function TablesPageContent() {
  const searchParams = useSearchParams()
  const [tables, setTables] = useState<PublicTableListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>("all")

  useEffect(() => {
    const filterParam = searchParams?.get("filter")?.toLowerCase()
    if (!filterParam) {
      setFilter("all")
      return
    }

    if (filterParam === "live") {
      setFilter("running")
      return
    }

    const matchingFilter = FILTERS.find((entry) => entry.value === filterParam)
    if (!matchingFilter) {
      setFilter("all")
      return
    }

    setFilter(matchingFilter.value)
  }, [searchParams])

  useEffect(() => {
    async function loadTables() {
      try {
        const data = await publicApi.listTables()
        setTables(data)
      } catch (err) {
        console.error("Failed to load tables:", err)
        setError("Failed to load games. Please try again later.")
      } finally {
        setIsLoading(false)
      }
    }
    loadTables()
  }, [])

  const filteredTables = filter === "all"
    ? tables
    : filter === "lobby"
      ? tables.filter((t) => t.status === "waiting" && t.availableSeats > 0)
      : tables.filter((t) => t.status === filter)

  const countLabel = filter === "all"
    ? `${filteredTables.length} game${filteredTables.length !== 1 ? "s" : ""}`
    : `${filteredTables.length} ${filter} game${filteredTables.length !== 1 ? "s" : ""}`

  return (
    <>
      {/* Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="font-mono text-2xl sm:text-3xl font-bold text-white mb-2">
          Tables
        </h1>
        <p className="font-mono text-sm text-slate-500">
          {isLoading
            ? "Loading games..."
            : error
              ? error
              : countLabel}
        </p>
      </div>

      {/* Status filter */}
      {!isLoading && !error && (
        <div className="flex items-center gap-2 mb-6 sm:mb-8 font-mono text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded border transition-colors ${
                filter === f.value
                  ? "border-red-400/50 text-red-400 bg-red-400/10"
                  : "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <AsciiDivider className="mb-6 sm:mb-8" />

      {/* Content */}
      {isLoading && <LoadingSkeleton />}

      {!isLoading && !error && filteredTables.length === 0 && <EmptyState />}

      {!isLoading && error && (
        <div className="text-center py-16 font-mono text-red-400/60 text-sm">
          {error}
        </div>
      )}

      {!isLoading && !error && filteredTables.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {filteredTables.map((table) => (
            <AsciiGameCard key={table.id} table={table} />
          ))}
        </div>
      )}

      {/* Footer hint */}
      {!isLoading && !error && filteredTables.length > 0 && (
        <div className="mt-8 text-center font-mono text-xs text-slate-600">
          {"// Click a table to view details"}
        </div>
      )}
    </>
  )
}

export default function TablesPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-300">
      {/* Header */}
      <nav className="border-b border-slate-800/50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
          <div className="flex h-14 items-center justify-between">
            <Link href="/" className="flex items-center">
              <AsciiLogo size="sm" />
            </Link>
            <div className="flex items-center gap-6 font-mono text-sm">
              <Link
                href="/"
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                Home
              </Link>
              <Link href="/tables" className="text-red-400">
                Tables
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8 py-8 sm:py-10">
        <Suspense fallback={<LoadingSkeleton />}>
          <TablesPageContent />
        </Suspense>
      </main>
    </div>
  )
}
