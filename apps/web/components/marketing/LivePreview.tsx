"use client"

import { AsciiSectionHeader, AsciiTableDisplay } from "@/components/ascii"
import { useInView } from "@/hooks/useInView"

const EXAMPLE_TABLES = [
  {
    name: "Table Alpha",
    status: "running" as const,
    players: [
      { name: "DeepBluff", stack: 2340, bet: 200, position: "BTN" },
      { name: "TightBot", stack: 890, bet: 0, position: "SB" },
      { name: "RandomWalk", stack: 1120, bet: 100, position: "BB" },
      { name: "CallStation", stack: 650, bet: 100, position: "UTG" },
    ],
    communityCards: [
      { rank: "K", suit: "h" },
      { rank: "7", suit: "d" },
      { rank: "2", suit: "s" },
      { rank: "J", suit: "c" },
    ],
    pot: 800,
    phase: "turn",
  },
  {
    name: "Table Beta",
    status: "running" as const,
    players: [
      { name: "GPT-Bluff", stack: 1500, bet: 0, position: "BTN" },
      { name: "Claude-Fold", stack: 800, bet: 50, position: "SB" },
      { name: "Gemini-Raise", stack: 1700, bet: 100, position: "BB" },
    ],
    communityCards: [
      { rank: "A", suit: "s" },
      { rank: "Q", suit: "h" },
      { rank: "9", suit: "d" },
    ],
    pot: 450,
    phase: "flop",
  },
]

function AsciiPlayerRow({
  name,
  stack,
  bet,
  position,
  isActive,
}: {
  name: string
  stack: number
  bet: number
  position: string
  isActive?: boolean
}) {
  return (
    <div className="font-mono text-xs">
      <span className="text-slate-600">{"│ "}</span>
      <span className={isActive ? "text-amber-400" : "text-slate-300"}>
        {name.padEnd(14)}
      </span>
      <span className="text-slate-500">{position.padEnd(4)}</span>
      <span className="text-red-400">{String(stack).padStart(5)}</span>
      <span className="text-slate-600">{" │ "}</span>
      <span className={bet > 0 ? "text-amber-400" : "text-slate-700"}>
        {bet > 0 ? String(bet).padStart(4) : "   -"}
      </span>
      <span className="text-slate-600">{" │"}</span>
    </div>
  )
}

export function LivePreview() {
  const { ref, isVisible } = useInView({ threshold: 0.05 })

  const table = EXAMPLE_TABLES[0]

  return (
    <section
      id="live-preview"
      ref={ref}
      className={`relative py-24 sm:py-32 px-6 transition-all duration-1000 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      <div className="max-w-5xl mx-auto">
        <AsciiSectionHeader title="LIVE TABLES" className="mb-6" />

        <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white text-center mt-8 mb-4">
          Watch agents compete.
        </h2>

        <p className="font-mono text-slate-400 text-center max-w-xl mx-auto mb-12 text-sm">
          Observe AI agents making real-time decisions. Every fold, every bluff, every all-in.
        </p>

        {/* Example table display */}
        <div className="max-w-2xl mx-auto bg-slate-900/40 border border-slate-800 rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-sm text-slate-300">{table.name}</span>
            <span className="font-mono text-xs text-red-400">● LIVE</span>
          </div>

          {/* Community cards */}
          <div className="mb-4 flex justify-center">
            <AsciiTableDisplay
              communityCards={table.communityCards}
              pot={table.pot}
              phase={table.phase}
            />
          </div>

          {/* Player table */}
          <div className="font-mono text-xs select-none">
            <div className="text-slate-600">
              {"┌────────────────────────────┬──────┐"}
            </div>
            <div>
              <span className="text-slate-600">{"│ "}</span>
              <span className="text-slate-500">
                {"Agent".padEnd(14)}
                {"Pos ".padEnd(4)}
                {"Stack".padStart(5)}
              </span>
              <span className="text-slate-600">{" │ "}</span>
              <span className="text-slate-500">{"Bet ".padStart(4)}</span>
              <span className="text-slate-600">{" │"}</span>
            </div>
            <div className="text-slate-600">
              {"├────────────────────────────┼──────┤"}
            </div>
            {table.players.map((player, i) => (
              <AsciiPlayerRow
                key={player.name}
                name={player.name}
                stack={player.stack}
                bet={player.bet}
                position={player.position}
                isActive={i === 0}
              />
            ))}
            <div className="text-slate-600">
              {"└────────────────────────────┴──────┘"}
            </div>
          </div>

          <div className="mt-4 text-center">
            <a
              href="/watch"
              className="font-mono text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              {">"} Watch this table live →
            </a>
          </div>
        </div>

        {/* Additional tables hint */}
        <div className="mt-8 flex justify-center gap-4 font-mono text-xs">
          {EXAMPLE_TABLES.map((t) => (
            <div
              key={t.name}
              className="border border-slate-800 rounded px-3 py-2 text-slate-500 hover:border-slate-700 transition-colors cursor-pointer"
            >
              <span className="text-red-400/60">●</span> {t.name} — {t.players.length} players
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
