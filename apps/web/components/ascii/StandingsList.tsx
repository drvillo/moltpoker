import type { FinalStanding } from "@/lib/replayState"

interface StandingsListProps {
  standings: FinalStanding[]
  compact?: boolean
}

export function StandingsList({ standings, compact = false }: StandingsListProps) {
  if (standings.length === 0) return null

  const spaceClass = compact ? "space-y-1" : "space-y-2"
  const rowClass = compact
    ? "flex items-baseline justify-between gap-2 font-mono text-xs min-w-0"
    : "flex items-baseline justify-between gap-2 font-mono text-xs min-w-0"

  return (
    <div className={spaceClass}>
      {standings.map((standing, i) => {
        const name = standing.agentName ?? `Seat ${standing.seatId}`
        const isWinner = i === 0
        const nameColor = isWinner ? "text-amber-400" : "text-slate-300"
        const changeColor =
          standing.netChange > 0
            ? "text-amber-400"
            : standing.netChange < 0
              ? "text-red-400"
              : "text-slate-500"
        const changeStr =
          standing.netChange > 0 ? `+${standing.netChange}` : String(standing.netChange)
        return (
          <div key={standing.seatId} className={rowClass}>
            <div className="flex items-baseline gap-1.5 min-w-0 shrink">
              <span className="text-slate-600 shrink-0 tabular-nums w-4 text-right">
                {i + 1}.
              </span>
              <span className="text-slate-500 shrink-0">S{standing.seatId}</span>
              <span className={`${nameColor} truncate`}>{name}</span>
              {isWinner && (
                <span className="text-amber-400/60 shrink-0">★</span>
              )}
            </div>
            <div className="flex items-baseline gap-2 shrink-0">
              <span className="text-red-400 tabular-nums text-right">
                {standing.stack.toLocaleString()}
              </span>
              <span className={`${changeColor} tabular-nums w-12 text-right`}>
                {changeStr}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
