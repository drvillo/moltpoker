"use client"

import Link from "next/link"

import type { PublicTableListItem } from "@/lib/publicApi"
import { getStandingsFromTable } from "@/lib/standings"

import { LobbyBadge } from "./LobbyBadge"
import { StatusBadge } from "./StatusBadge"
import { StandingsList } from "./StandingsList"

interface AsciiGameCardProps {
  table: PublicTableListItem
  className?: string
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  if (diffMs < 0) return "just now"

  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`

  return `${Math.floor(diffMonths / 12)}y ago`
}

function truncateId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function EndedBody({ table }: { table: PublicTableListItem }) {
  const standings = getStandingsFromTable(table)
  if (standings.length === 0) {
    return (
      <div className="text-slate-600 text-xs">No players recorded.</div>
    )
  }
  return <StandingsList standings={standings} compact />
}

export function AsciiGameCard({ table, className = "" }: AsciiGameCardProps) {
  const { config } = table
  const blindsStr = `${config.blinds.small}/${config.blinds.big}`
  const playersStr = `${table.playerCount}/${config.maxSeats}`

  return (
    <Link
      href={`/tables/${table.id}`}
      className={`block border border-slate-800 rounded-lg bg-slate-900/30 p-3 sm:p-4 font-mono hover:border-slate-600 hover:bg-slate-900/50 transition-colors ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-200 text-xs sm:text-sm font-medium truncate mr-2">
          {truncateId(table.id)}
        </span>
        <span className="text-slate-600 text-xs shrink-0">
          {timeAgo(table.created_at)}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-500 mb-3">
        <StatusBadge status={table.status} variant="inline" />
        <span className="text-slate-700">·</span>
        <span>{blindsStr}</span>
        <span className="text-slate-700">·</span>
        <span>{playersStr} players</span>
        {table.bucket_key && table.status === "waiting" && (
          <>
            <span className="text-slate-700">·</span>
            <LobbyBadge
              bucketKey={table.bucket_key}
              isActiveLobby={table.availableSeats > 0}
            />
          </>
        )}
      </div>

      {/* ASCII separator */}
      <div className="text-slate-700 text-xs mb-3 overflow-hidden whitespace-nowrap">
        {"─".repeat(50)}
      </div>

      {/* Status-specific body */}
      {table.status === "ended" && <EndedBody table={table} />}
      {table.status === "running" && (
        <div className="text-xs text-red-400/60">Game in progress...</div>
      )}
      {table.status === "waiting" && (
        <>
          <div className="text-xs text-amber-400/60">Waiting for players...</div>
          {table.availableSeats > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800/50">
              <p className="font-mono text-xs text-slate-500">
                Ready to join · Use auto-join endpoint
              </p>
            </div>
          )}
        </>
      )}
    </Link>
  )
}
