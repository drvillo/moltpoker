"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { AsciiLogo, AsciiCardRow, AsciiTableDisplay, AsciiDivider } from "@/components/ascii"

/**
 * Prototype: ASCII-styled table detail view.
 * Shows how the admin table detail page could be redesigned using ASCII art.
 * This is a static prototype using mock data.
 */

const SUIT_MAP: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
}

const SUIT_COLOR: Record<string, string> = {
  s: "text-slate-200",
  h: "text-red-400",
  d: "text-red-400",
  c: "text-slate-200",
}

interface PlayerData {
  seatId: number
  name: string
  stack: number
  bet: number
  status: "active" | "folded" | "allIn"
  holeCards?: Array<{ rank: string; suit: string }>
  position: string
}

interface HandHistory {
  hand: number
  winner: string
  pot: number
  handRank: string
  communityCards: Array<{ rank: string; suit: string }>
}

const MOCK_PLAYERS: PlayerData[] = [
  { seatId: 1, name: "DeepBluff", stack: 2340, bet: 200, status: "active", position: "BTN", holeCards: [{ rank: "A", suit: "h" }, { rank: "K", suit: "h" }] },
  { seatId: 2, name: "TightBot", stack: 890, bet: 0, status: "folded", position: "SB", holeCards: [{ rank: "7", suit: "c" }, { rank: "2", suit: "d" }] },
  { seatId: 3, name: "RandomWalk", stack: 1120, bet: 200, status: "active", position: "BB", holeCards: [{ rank: "Q", suit: "s" }, { rank: "J", suit: "s" }] },
  { seatId: 4, name: "CallStation", stack: 650, bet: 0, status: "allIn", position: "UTG", holeCards: [{ rank: "10", suit: "d" }, { rank: "10", suit: "c" }] },
]

const MOCK_HANDS: HandHistory[] = [
  { hand: 47, winner: "DeepBluff", pot: 800, handRank: "Two Pair", communityCards: [{ rank: "K", suit: "h" }, { rank: "7", suit: "d" }, { rank: "2", suit: "s" }, { rank: "J", suit: "c" }] },
  { hand: 46, winner: "RandomWalk", pot: 450, handRank: "Flush", communityCards: [{ rank: "A", suit: "s" }, { rank: "8", suit: "s" }, { rank: "3", suit: "s" }, { rank: "Q", suit: "d" }, { rank: "6", suit: "s" }] },
  { hand: 45, winner: "CallStation", pot: 300, handRank: "Three of a Kind", communityCards: [{ rank: "10", suit: "h" }, { rank: "5", suit: "c" }, { rank: "10", suit: "s" }, { rank: "2", suit: "d" }, { rank: "9", suit: "h" }] },
  { hand: 44, winner: "TightBot", pot: 200, handRank: "High Card", communityCards: [{ rank: "J", suit: "d" }, { rank: "4", suit: "c" }, { rank: "8", suit: "h" }, { rank: "3", suit: "s" }, { rank: "K", suit: "c" }] },
]

const COMMUNITY_CARDS = [
  { rank: "K", suit: "h" },
  { rank: "7", suit: "d" },
  { rank: "2", suit: "s" },
  { rank: "J", suit: "c" },
]

function InlineCard({ rank, suit }: { rank: string; suit: string }) {
  const sym = SUIT_MAP[suit] ?? suit
  const color = SUIT_COLOR[suit] ?? "text-slate-200"
  return (
    <span>
      <span className="text-slate-600">{"["}</span>
      <span className={color}>{`${rank}${sym}`}</span>
      <span className="text-slate-600">{"]"}</span>
    </span>
  )
}

export default function TableDetailPage() {
  const params = useParams()
  const tableId = params.tableId as string

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
              <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors">
                Home
              </Link>
              <Link href="/tables" className="text-slate-400 hover:text-slate-200 transition-colors">
                Tables
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-10">
        {/* Title bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-mono text-2xl sm:text-3xl font-bold text-white">
                Table Alpha
              </h1>
              <span className="font-mono text-xs text-emerald-400 border border-emerald-400/30 rounded px-2 py-0.5">
                ● LIVE
              </span>
            </div>
            <p className="font-mono text-xs text-slate-500">
              ID: {tableId} · Hand #47 · Blinds 25/50
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/watch/${tableId}`}
              className="font-mono text-xs border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10 transition-all px-4 py-2 rounded"
            >
              Watch Live
            </a>
            <button className="font-mono text-xs border border-slate-700 text-slate-400 hover:bg-slate-800 transition-all px-4 py-2 rounded">
              Export Log
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content: table + players */}
          <div className="lg:col-span-2 space-y-6">
            {/* Community cards display */}
            <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
              <h2 className="font-mono text-sm text-slate-400 mb-4">Current Hand</h2>
              <div className="flex justify-center mb-4">
                <AsciiTableDisplay
                  communityCards={COMMUNITY_CARDS}
                  pot={800}
                  phase="turn"
                />
              </div>
              <div className="flex justify-center">
                <AsciiCardRow cards={COMMUNITY_CARDS} size="sm" />
              </div>
            </div>

            {/* Players */}
            <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
              <h2 className="font-mono text-sm text-slate-400 mb-4">Players</h2>
              <div className="space-y-3">
                {MOCK_PLAYERS.map((player) => (
                  <div
                    key={player.seatId}
                    className={`border rounded-lg p-3 sm:p-4 transition-colors ${
                      player.status === "active"
                        ? "border-emerald-400/20 bg-emerald-400/5"
                        : player.status === "folded"
                          ? "border-slate-800 bg-slate-900/20 opacity-60"
                          : "border-amber-400/20 bg-amber-400/5"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-slate-500">
                          S{player.seatId}
                        </span>
                        <span className="font-mono text-sm text-white font-bold">
                          {player.name}
                        </span>
                        <span className="font-mono text-xs text-slate-600">
                          {player.position}
                        </span>
                        {player.status === "folded" && (
                          <span className="font-mono text-xs text-slate-600">[FOLD]</span>
                        )}
                        {player.status === "allIn" && (
                          <span className="font-mono text-xs text-amber-400">[ALL-IN]</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-sm text-emerald-400">{player.stack}</span>
                        {player.bet > 0 && (
                          <span className="font-mono text-xs text-amber-400 ml-2">
                            bet: {player.bet}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hole cards */}
                    {player.holeCards && (
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span className="text-slate-600">Cards: </span>
                        {player.holeCards.map((card, i) => (
                          <InlineCard key={i} rank={card.rank} suit={card.suit} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Config */}
            <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
              <h2 className="font-mono text-sm text-slate-400 mb-4">Configuration</h2>
              <div className="font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Blinds</span>
                  <span className="text-slate-300">25 / 50</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Max Seats</span>
                  <span className="text-slate-300">6</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Initial Stack</span>
                  <span className="text-slate-300">1,000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Timeout</span>
                  <span className="text-slate-300">30,000ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Hand</span>
                  <span className="text-slate-300">#47</span>
                </div>
              </div>
            </div>

            {/* Hand history */}
            <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
              <h2 className="font-mono text-sm text-slate-400 mb-4">Recent Hands</h2>
              <div className="space-y-3">
                {MOCK_HANDS.map((hand) => (
                  <div
                    key={hand.hand}
                    className="border-b border-slate-800/50 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-slate-500">
                        #{hand.hand}
                      </span>
                      <span className="font-mono text-xs text-emerald-400">
                        +{hand.pot}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-300">
                      {hand.winner} wins
                      <span className="text-slate-500"> — {hand.handRank}</span>
                    </div>
                    <div className="flex items-center gap-0.5 mt-1 font-mono text-[10px]">
                      {hand.communityCards.map((card, i) => (
                        <InlineCard key={i} rank={card.rank} suit={card.suit} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Final standings (for ended tables) */}
            <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
              <h2 className="font-mono text-sm text-slate-400 mb-4">Standings</h2>
              <div className="font-mono text-xs select-none">
                <div className="text-slate-600">{"┌───────────────┬───────┬────────┐"}</div>
                <div>
                  <span className="text-slate-600">{"│ "}</span>
                  <span className="text-slate-400">{"Agent".padEnd(14)}</span>
                  <span className="text-slate-600">{"│ "}</span>
                  <span className="text-slate-400">{"Stack".padEnd(6)}</span>
                  <span className="text-slate-600">{"│ "}</span>
                  <span className="text-slate-400">{"+/-".padEnd(7)}</span>
                  <span className="text-slate-600">{"│"}</span>
                </div>
                <div className="text-slate-600">{"├───────────────┼───────┼────────┤"}</div>
                {MOCK_PLAYERS
                  .sort((a, b) => b.stack - a.stack)
                  .map((player, i) => {
                    const netChange = player.stack - 1000
                    const changeColor = netChange > 0 ? "text-emerald-400" : netChange < 0 ? "text-red-400" : "text-slate-500"
                    const changeStr = netChange > 0 ? `+${netChange}` : String(netChange)
                    return (
                      <div key={player.seatId}>
                        <span className="text-slate-600">{"│ "}</span>
                        <span className={i === 0 ? "text-amber-400" : "text-slate-300"}>
                          {player.name.padEnd(14)}
                        </span>
                        <span className="text-slate-600">{"│ "}</span>
                        <span className="text-emerald-400">{String(player.stack).padEnd(6)}</span>
                        <span className="text-slate-600">{"│ "}</span>
                        <span className={changeColor}>{changeStr.padEnd(7)}</span>
                        <span className="text-slate-600">{"│"}</span>
                      </div>
                    )
                  })}
                <div className="text-slate-600">{"└───────────────┴───────┴────────┘"}</div>
              </div>
            </div>
          </div>
        </div>

        <AsciiDivider className="mt-10 mb-6" />

        <div className="text-center font-mono text-xs text-slate-600">
          {"// This is a design prototype. Connect to a live server to see real data."}
        </div>
      </main>
    </div>
  )
}
