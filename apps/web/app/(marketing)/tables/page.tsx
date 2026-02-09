"use client"

import Link from "next/link"

import { AsciiLogo, AsciiDivider } from "@/components/ascii"

/**
 * Prototype: ASCII-styled public tables list.
 * This is a static design prototype showing how the admin table listing
 * could be redesigned using the ASCII art design system.
 */

interface TablePreview {
  id: string
  name: string
  status: "running" | "waiting" | "ended"
  players: number
  maxSeats: number
  blinds: string
  pot: number
  hand: number
  createdAt: string
}

const MOCK_TABLES: TablePreview[] = [
  {
    id: "tbl_001",
    name: "Table Alpha",
    status: "running",
    players: 4,
    maxSeats: 6,
    blinds: "25/50",
    pot: 800,
    hand: 47,
    createdAt: "2h ago",
  },
  {
    id: "tbl_002",
    name: "Table Beta",
    status: "running",
    players: 3,
    maxSeats: 6,
    blinds: "50/100",
    pot: 1200,
    hand: 23,
    createdAt: "1h ago",
  },
  {
    id: "tbl_003",
    name: "Table Gamma",
    status: "waiting",
    players: 1,
    maxSeats: 4,
    blinds: "10/20",
    pot: 0,
    hand: 0,
    createdAt: "30m ago",
  },
  {
    id: "tbl_004",
    name: "Table Delta",
    status: "ended",
    players: 4,
    maxSeats: 6,
    blinds: "25/50",
    pot: 0,
    hand: 112,
    createdAt: "5h ago",
  },
]

function statusIndicator(status: string) {
  switch (status) {
    case "running":
      return <span className="text-red-400">● LIVE</span>
    case "waiting":
      return <span className="text-amber-400">○ WAIT</span>
    case "ended":
      return <span className="text-slate-500">◌ END </span>
    default:
      return <span className="text-slate-600">{status}</span>
  }
}

export default function TablesPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-300">
      {/* Header */}
      <nav className="border-b border-slate-800/50">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
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
              <Link
                href="/tables"
                className="text-red-400"
              >
                Tables
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-10">
        {/* Title */}
        <div className="mb-8">
          <h1 className="font-mono text-2xl sm:text-3xl font-bold text-white mb-2">
            Poker Tables
          </h1>
          <p className="font-mono text-sm text-slate-500">
            Browse active and past tables. Click to view details and replay hands.
          </p>
        </div>

        {/* Status summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Running", count: MOCK_TABLES.filter((t) => t.status === "running").length, color: "text-red-400" },
            { label: "Waiting", count: MOCK_TABLES.filter((t) => t.status === "waiting").length, color: "text-amber-400" },
            { label: "Ended", count: MOCK_TABLES.filter((t) => t.status === "ended").length, color: "text-slate-500" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="border border-slate-800 rounded-lg p-4 bg-slate-900/30"
            >
              <div className={`font-mono text-2xl font-bold ${stat.color}`}>
                {stat.count}
              </div>
              <div className="font-mono text-xs text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <AsciiDivider className="mb-8" />

        {/* Table list as ASCII */}
        <div className="font-mono text-xs sm:text-sm select-none overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Header */}
            <div className="text-slate-600">
              {"┌──────────────────┬────────┬──────────┬─────────┬────────┬──────────┐"}
            </div>
            <div>
              <span className="text-slate-600">{"│ "}</span>
              <span className="text-slate-400">{"Table".padEnd(17)}</span>
              <span className="text-slate-600">{"│ "}</span>
              <span className="text-slate-400">{"Status".padEnd(7)}</span>
              <span className="text-slate-600">{"│ "}</span>
              <span className="text-slate-400">{"Players".padEnd(9)}</span>
              <span className="text-slate-600">{"│ "}</span>
              <span className="text-slate-400">{"Blinds".padEnd(8)}</span>
              <span className="text-slate-600">{"│ "}</span>
              <span className="text-slate-400">{"Hand #".padEnd(7)}</span>
              <span className="text-slate-600">{"│ "}</span>
              <span className="text-slate-400">{"Created".padEnd(9)}</span>
              <span className="text-slate-600">{"│"}</span>
            </div>
            <div className="text-slate-600">
              {"├──────────────────┼────────┼──────────┼─────────┼────────┼──────────┤"}
            </div>

            {/* Rows */}
            {MOCK_TABLES.map((table) => (
              <Link
                key={table.id}
                href={`/tables/${table.id}`}
                className="block hover:bg-slate-800/30 transition-colors"
              >
                <span className="text-slate-600">{"│ "}</span>
                <span className="text-slate-200">{table.name.padEnd(17)}</span>
                <span className="text-slate-600">{"│ "}</span>
                {statusIndicator(table.status)}
                <span className="text-slate-600">{" │ "}</span>
                <span className="text-slate-300">{`${table.players}/${table.maxSeats}`.padEnd(9)}</span>
                <span className="text-slate-600">{"│ "}</span>
                <span className="text-slate-300">{table.blinds.padEnd(8)}</span>
                <span className="text-slate-600">{"│ "}</span>
                <span className="text-slate-300">{String(table.hand || "-").padEnd(7)}</span>
                <span className="text-slate-600">{"│ "}</span>
                <span className="text-slate-500">{table.createdAt.padEnd(9)}</span>
                <span className="text-slate-600">{"│"}</span>
              </Link>
            ))}

            <div className="text-slate-600">
              {"└──────────────────┴────────┴──────────┴─────────┴────────┴──────────┘"}
            </div>
          </div>
        </div>

        {/* Help text */}
        <div className="mt-8 text-center font-mono text-xs text-slate-600">
          {"// Click a table to view details and replay hands"}
        </div>
      </main>
    </div>
  )
}
