"use client"

interface AsciiTableDisplayProps {
  communityCards?: Array<{ rank: string; suit: string }>
  pot?: number
  phase?: string
  className?: string
}

const SUIT_MAP: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
}

const SUIT_COLOR: Record<string, string> = {
  s: "text-slate-300",
  h: "text-red-400",
  d: "text-red-400",
  c: "text-slate-300",
}

function formatCard(card: { rank: string; suit: string }): { text: string; color: string } {
  const sym = SUIT_MAP[card.suit] ?? card.suit
  return {
    text: `${card.rank}${sym}`,
    color: SUIT_COLOR[card.suit] ?? "text-slate-300",
  }
}

export function AsciiTableDisplay({
  communityCards = [],
  pot = 0,
  phase = "waiting",
  className = "",
}: AsciiTableDisplayProps) {
  const maxCards = 5
  const filledCards = communityCards.slice(0, maxCards)
  const emptySlots = maxCards - filledCards.length

  return (
    <div className={`font-mono text-xs sm:text-sm select-none ${className}`}>
      <div className="text-slate-600">
        {"╔══════════════════════════════════════╗"}
      </div>
      <div className="text-slate-600">
        {"║"}
        <span className="text-slate-500">
          {"          "}
          <span className="text-amber-400/70">{phase.toUpperCase().padEnd(10)}</span>
          {"              "}
        </span>
        {"║"}
      </div>
      <div className="text-slate-600">
        {"║    "}
        {filledCards.map((card, i) => {
          const { text, color } = formatCard(card)
          return (
            <span key={i}>
              <span className="text-slate-500">{"["}</span>
              <span className={color}>{text.padEnd(3)}</span>
              <span className="text-slate-500">{"]"}</span>
              {" "}
            </span>
          )
        })}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <span key={`empty-${i}`}>
            <span className="text-slate-700">{"[ · ]"}</span>
            {" "}
          </span>
        ))}
        {"  ║"}
      </div>
      <div className="text-slate-600">
        {"║"}
        <span className="text-slate-500">
          {"          Pot: "}
          <span className="text-emerald-400">{pot.toLocaleString().padEnd(10)}</span>
          {"        "}
        </span>
        {"║"}
      </div>
      <div className="text-slate-600">
        {"╚══════════════════════════════════════╝"}
      </div>
    </div>
  )
}

export function AsciiMiniTable({
  label,
  status,
  players,
  pot,
  className = "",
}: {
  label: string
  status: string
  players: number
  pot: number
  className?: string
}) {
  const statusColor =
    status === "running"
      ? "text-emerald-400"
      : status === "waiting"
        ? "text-amber-400"
        : "text-slate-500"

  return (
    <div className={`font-mono text-xs select-none ${className}`}>
      <div className="text-slate-600">{"┌──────────────────────┐"}</div>
      <div className="text-slate-600">
        {"│ "}
        <span className="text-slate-300">{label.padEnd(12)}</span>
        <span className={statusColor}>{status.padEnd(8)}</span>
        {"│"}
      </div>
      <div className="text-slate-600">
        {"│ "}
        <span className="text-slate-500">
          {"Players: "}
          <span className="text-slate-300">{String(players).padEnd(2)}</span>
          {"Pot: "}
          <span className="text-emerald-400">{String(pot).padEnd(5)}</span>
        </span>
        {"│"}
      </div>
      <div className="text-slate-600">{"└──────────────────────┘"}</div>
    </div>
  )
}
