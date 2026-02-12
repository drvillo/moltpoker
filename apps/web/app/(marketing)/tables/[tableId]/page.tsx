"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { AsciiLogo, AsciiCardRow, AsciiTableDisplay, AsciiDivider, StatusBadge } from "@/components/ascii"
import { publicApi, type PublicTableDetail } from "@/lib/publicApi"
import {
  buildReplayData,
  getHandNumberForIndex,
  getIndexForHand,
  type ReplayData,
  type FinalStanding,
} from "@/lib/replayState"

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

function LoadingState() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-300 flex items-center justify-center">
      <div className="text-center font-mono">
        <div className="text-slate-500 text-sm animate-pulse">Loading table...</div>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-300 flex items-center justify-center">
      <div className="text-center font-mono">
        <div className="text-red-400/60 text-sm mb-4">{message}</div>
        <Link href="/tables" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Back to tables
        </Link>
      </div>
    </div>
  )
}

export default function TableDetailPage() {
  const params = useParams()
  const tableId = Array.isArray(params?.tableId) ? params?.tableId[0] : params?.tableId ?? ""

  const [table, setTable] = useState<PublicTableDetail | null>(null)
  const [replayData, setReplayData] = useState<ReplayData | null>(null)
  const [finalStacks, setFinalStacks] = useState<FinalStanding[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isReplayLoading, setIsReplayLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLiveUpdating, setIsLiveUpdating] = useState(false)
  
  // Use refs to track values we need in polling without triggering re-fetches
  const lastUpdateSeqRef = useRef<number>(0)
  const currentIndexRef = useRef<number>(0)
  const replayDataLengthRef = useRef<number>(0)
  
  // Keep refs in sync
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])
  
  useEffect(() => {
    replayDataLengthRef.current = replayData?.snapshots.length ?? 0
  }, [replayData?.snapshots.length])

  // Load table details
  useEffect(() => {
    if (!tableId) return
    async function loadTable() {
      try {
        const data = await publicApi.getTable(tableId)
        setTable(data)
      } catch (err) {
        console.error("Failed to load table:", err)
        setError("Failed to load table. It may not exist.")
      } finally {
        setIsLoading(false)
      }
    }
    loadTable()
  }, [tableId])

  // Load replay events once table is loaded
  useEffect(() => {
    if (!tableId || !table) return
    // Only load replay for tables that have events (running or ended)
    if (table.status === "waiting") return

    let cancelled = false
    let pollInterval: NodeJS.Timeout | null = null
    let allLoadedEvents: Awaited<ReturnType<typeof publicApi.getTableEvents>>["events"] = []

    async function loadEvents(isInitialLoad = false) {
      if (isInitialLoad) setIsReplayLoading(true)
      try {
        // For incremental updates, only fetch events after lastUpdateSeq
        const startSeq = isInitialLoad ? undefined : (lastUpdateSeqRef.current > 0 ? lastUpdateSeqRef.current + 1 : undefined)
        
        const newEvents: Awaited<ReturnType<typeof publicApi.getTableEvents>>["events"] = []
        let fromSeq = startSeq
        let hasMore = true
        
        while (hasMore) {
          if (cancelled) return
          const { events, hasMore: more } = await publicApi.getTableEvents(tableId, {
            fromSeq,
            limit: 5000,
          })
          newEvents.push(...events)
          hasMore = more && events.length > 0
          fromSeq = events.length > 0 ? events[events.length - 1].seq + 1 : undefined
          if (events.length === 0) break
        }
        
        if (cancelled) return
        
        // For initial load, replace all events; for updates, append new ones
        if (isInitialLoad) {
          allLoadedEvents = newEvents
        } else if (newEvents.length > 0) {
          allLoadedEvents = [...allLoadedEvents, ...newEvents]
          // Show subtle update indicator
          setIsLiveUpdating(true)
          setTimeout(() => setIsLiveUpdating(false), 800)
        } else {
          // No new events, skip rebuild
          return
        }
        
        // Update last known sequence number
        if (allLoadedEvents.length > 0) {
          lastUpdateSeqRef.current = allLoadedEvents[allLoadedEvents.length - 1].seq
        }
        
        const data = buildReplayData(tableId, allLoadedEvents)
        const oldLength = replayDataLengthRef.current
        const newLength = data.snapshots.length
        
        setReplayData(data)
        setFinalStacks(data.finalStacks)
        
        // If this is the initial load, start at the end
        if (isInitialLoad && data.snapshots.length > 0) {
          setCurrentIndex(data.snapshots.length - 1)
        }
        // If user is viewing the last snapshot, keep them at the end
        else if (currentIndexRef.current >= oldLength - 1 && newLength > oldLength) {
          setCurrentIndex(newLength - 1)
        }
      } catch (err) {
        console.error("Failed to load events:", err)
      } finally {
        if (!cancelled && isInitialLoad) setIsReplayLoading(false)
      }
    }

    // Initial load
    loadEvents(true)

    // Poll for new events if table is running
    if (table.status === "running") {
      pollInterval = setInterval(() => {
        if (!cancelled) loadEvents(false)
      }, 2000) // Poll every 2 seconds
    }

    return () => {
      cancelled = true
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [tableId, table])

  // Navigation callbacks
  const goToStart = useCallback(() => setCurrentIndex(0), [])
  const goToPrev = useCallback(
    () => setCurrentIndex((i) => Math.max(0, i - 1)),
    []
  )
  const goToNext = useCallback(
    () => setCurrentIndex((i) =>
      replayData ? Math.min(replayData.snapshots.length - 1, i + 1) : i
    ),
    [replayData]
  )
  const goToEnd = useCallback(
    () => setCurrentIndex(replayData ? replayData.snapshots.length - 1 : 0),
    [replayData]
  )
  const goToHand = useCallback(
    (handNumber: number) => {
      if (replayData) setCurrentIndex(getIndexForHand(replayData, handNumber))
    },
    [replayData]
  )

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goToPrev()
      else if (e.key === "ArrowRight") goToNext()
      else if (e.key === "Home") goToStart()
      else if (e.key === "End") goToEnd()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [goToPrev, goToNext, goToStart, goToEnd])

  if (!tableId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-slate-300 flex items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-sm text-slate-400">Missing table id.</p>
          <Link href="/tables" className="mt-4 inline-block text-xs text-red-400 hover:text-red-300">
            Back to tables
          </Link>
        </div>
      </div>
    )
  }

  if (isLoading) return <LoadingState />
  if (error || !table) return <ErrorState message={error ?? "Table not found."} />

  const hasReplay = replayData && replayData.snapshots.length > 0
  const snapshot = hasReplay ? replayData.snapshots[currentIndex] : null
  const gameState = snapshot?.gameState ?? null
  const handComplete = snapshot?.handComplete ?? null
  const currentHand = hasReplay ? getHandNumberForIndex(replayData, currentIndex) : 0
  const isAtStart = currentIndex === 0
  const isAtEnd = hasReplay ? currentIndex === replayData.snapshots.length - 1 : true

  const totalPot = gameState?.pots.reduce((sum, p) => sum + p.amount, 0) ?? 0

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
                Table
              </h1>
              <StatusBadge status={table.status} />
              {table.status === "running" && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
                  <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    isLiveUpdating ? "bg-red-400 scale-125" : "bg-red-500 animate-pulse"
                  }`} />
                  <span className="font-mono text-xs text-red-400">LIVE</span>
                </div>
              )}
            </div>
            <p className="font-mono text-xs text-slate-500">
              ID: {tableId}
              {hasReplay && gameState && <> · Hand #{gameState.handNumber}</>}
              {" · "}Blinds {table.config.blinds.small}/{table.config.blinds.big}
              {table.status === "running" && <> · Auto-updating every 2s</>}
            </p>
          </div>
          <Link
            href="/tables"
            className="font-mono text-xs border border-slate-700 text-slate-400 hover:bg-slate-800 transition-all px-4 py-2 rounded self-start"
          >
            Back to Tables
          </Link>
        </div>

        {/* Replay navigation controls */}
        {hasReplay && (
          <div className="border border-slate-800 rounded-lg p-3 sm:p-4 bg-slate-900/30 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Step controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={goToStart}
                  disabled={isAtStart}
                  className="font-mono text-xs px-2.5 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ⏮
                </button>
                <button
                  onClick={goToPrev}
                  disabled={isAtStart}
                  className="font-mono text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ◀ Prev
                </button>
                <button
                  onClick={goToNext}
                  disabled={isAtEnd}
                  className="font-mono text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next ▶
                </button>
                <button
                  onClick={goToEnd}
                  disabled={isAtEnd}
                  className="font-mono text-xs px-2.5 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ⏭
                </button>
              </div>

              {/* Step counter */}
              <span className="font-mono text-xs text-slate-500">
                Step {currentIndex + 1} / {replayData.snapshots.length}
              </span>

              {/* Hand jump */}
              {replayData.totalHands > 0 && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">Hand:</span>
                  <select
                    value={String(currentHand)}
                    onChange={(e) => goToHand(Number(e.target.value))}
                    className="font-mono text-xs bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-red-400/50"
                  >
                    {Array.from({ length: replayData.totalHands }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        #{i + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Event description */}
            {snapshot && (
              <div className="mt-3 pt-3 border-t border-slate-800/50">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-slate-600">{snapshot.eventType}</span>
                  <span className="font-mono text-sm text-slate-300">{snapshot.eventDescription}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content: table + players */}
          <div className="lg:col-span-2 space-y-6">
            {/* Community cards display */}
            <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30 transition-all duration-300">
              <h2 className="font-mono text-sm text-slate-400 mb-4">
                {gameState?.handNumber && gameState.handNumber > 0 ? `Hand #${gameState.handNumber}` : "Game State"}
              </h2>
              {isReplayLoading ? (
                <div className="flex justify-center py-8">
                  <span className="font-mono text-sm text-slate-500 animate-pulse">Loading game...</span>
                </div>
              ) : table.status === "waiting" ? (
                <div className="flex justify-center py-8">
                  <span className="font-mono text-sm text-amber-400/60">Waiting for players...</span>
                </div>
              ) : !hasReplay || !gameState ? (
                <div className="flex justify-center py-8">
                  <span className="font-mono text-sm text-slate-500">No game data</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-center mb-4">
                    <AsciiTableDisplay
                      communityCards={gameState.communityCards}
                      pot={totalPot}
                      phase={gameState.phase}
                    />
                  </div>
                  {gameState.communityCards.length > 0 && (
                    <div className="flex justify-center transition-opacity duration-300">
                      <AsciiCardRow cards={gameState.communityCards} size="sm" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Players */}
            <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
              <h2 className="font-mono text-sm text-slate-400 mb-4">Players</h2>
              {!hasReplay || !gameState ? (
                <div className="text-center py-8">
                  <span className="font-mono text-sm text-slate-500">No player data</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {gameState.players.map((player) => {
                    const isFolded = player.folded
                    const isAllIn = player.allIn
                    const isCurrentTurn = player.seatId === gameState.currentSeat
                    const isDealer = player.seatId === gameState.dealerSeat

                    return (
                      <div
                        key={player.seatId}
                        className={`border rounded-lg p-3 sm:p-4 transition-all duration-300 ${
                          isCurrentTurn
                            ? "border-red-400/30 bg-red-400/5"
                            : isFolded
                              ? "border-slate-800 bg-slate-900/20 opacity-60"
                              : isAllIn
                                ? "border-amber-400/20 bg-amber-400/5"
                                : "border-slate-800 bg-slate-900/20"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-slate-500">
                              S{player.seatId}
                            </span>
                            <span className="font-mono text-sm text-white font-bold">
                              {player.agentName ?? `Seat ${player.seatId}`}
                            </span>
                            {isDealer && (
                              <span className="font-mono text-xs text-amber-400 border border-amber-400/30 rounded px-1 transition-opacity duration-300">D</span>
                            )}
                            {isCurrentTurn && (
                              <span className="font-mono text-xs text-red-400 transition-opacity duration-300">[TURN]</span>
                            )}
                            {isFolded && (
                              <span className="font-mono text-xs text-slate-600 transition-opacity duration-300">[FOLD]</span>
                            )}
                            {isAllIn && (
                              <span className="font-mono text-xs text-amber-400 transition-opacity duration-300">[ALL-IN]</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-sm text-red-400 transition-all duration-300 tabular-nums">{player.stack}</span>
                            {player.bet > 0 && (
                              <span className="font-mono text-xs text-amber-400 ml-2 transition-all duration-300 tabular-nums">
                                bet: {player.bet}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Hole cards */}
                        {player.holeCards && player.holeCards.length > 0 && (
                          <div className="flex items-center gap-1 font-mono text-xs transition-opacity duration-300">
                            <span className="text-slate-600">Cards: </span>
                            {player.holeCards.map((card, i) => (
                              <InlineCard key={i} rank={card.rank} suit={card.suit} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Hand results (when hand is complete) */}
            {hasReplay && handComplete && (
              <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30 transition-all duration-300">
                <h2 className="font-mono text-sm text-slate-400 mb-4">Hand Result</h2>
                <div className="space-y-2">
                  {handComplete.results.map((r, i) => {
                    const isWinner = r.winnings > 0
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between font-mono text-xs sm:text-sm transition-all duration-300 ${
                          isWinner ? "text-amber-400" : "text-slate-500"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>Seat {r.seatId}</span>
                          {r.holeCards && r.holeCards.length > 0 && (
                            <span className="flex items-center gap-0.5">
                              {r.holeCards.map((card, ci) => (
                                <InlineCard key={ci} rank={card.rank} suit={card.suit} />
                              ))}
                            </span>
                          )}
                          {r.handRank && (
                            <span className="text-slate-500">({r.handRank})</span>
                          )}
                        </div>
                        <span className={`tabular-nums transition-all duration-300 ${isWinner ? "text-green-400" : "text-slate-600"}`}>
                          {isWinner ? `+${r.winnings}` : r.winnings}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Last action (when no hand complete) */}
            {hasReplay && gameState?.lastAction && !handComplete && (
              <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30 transition-all duration-300">
                <h2 className="font-mono text-sm text-slate-400 mb-3">Last Action</h2>
                <div className="font-mono text-xs text-slate-300 transition-all duration-300">
                  Seat {gameState.lastAction.seatId} - {gameState.lastAction.kind}
                  {gameState.lastAction.amount !== undefined && ` (${gameState.lastAction.amount})`}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Config + Standings: first row, two columns when both exist */}
            <div
              className={
                finalStacks.length > 0
                  ? "grid grid-cols-1 sm:grid-cols-2 gap-4"
                  : ""
              }
            >
              <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
                <h2 className="font-mono text-sm text-slate-400 mb-4">Configuration</h2>
                <div className="font-mono text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Blinds</span>
                    <span className="text-slate-300 tabular-nums">{table.config.blinds.small} / {table.config.blinds.big}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Max Seats</span>
                    <span className="text-slate-300 tabular-nums">{table.config.maxSeats}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Initial Stack</span>
                    <span className="text-slate-300 tabular-nums">{table.config.initialStack.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Timeout</span>
                    <span className="text-slate-300 tabular-nums">{table.config.actionTimeoutMs.toLocaleString()}ms</span>
                  </div>
                  {hasReplay && (
                    <div className="flex justify-between transition-all duration-300">
                      <span className="text-slate-500">Total Hands</span>
                      <span className="text-slate-300 tabular-nums">{replayData.totalHands}</span>
                    </div>
                  )}
                </div>
              </div>

              {finalStacks.length > 0 && (
                <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
                  <h2 className="font-mono text-sm text-slate-400 mb-4">Standings</h2>
                  <div className="space-y-2">
                    {finalStacks.map((standing, i) => {
                      const name = standing.agentName ?? `Seat ${standing.seatId}`
                      const isWinner = i === 0
                      const nameColor = isWinner ? "text-amber-400" : "text-slate-300"
                      const changeColor = standing.netChange > 0
                        ? "text-amber-400"
                        : standing.netChange < 0
                          ? "text-red-400"
                          : "text-slate-500"
                      const changeStr = standing.netChange > 0 ? `+${standing.netChange}` : String(standing.netChange)
                      return (
                        <div
                          key={standing.seatId}
                          className="flex items-baseline justify-between gap-2 font-mono text-xs min-w-0"
                        >
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
                            <span
                              className={`${changeColor} tabular-nums w-12 text-right`}
                            >
                              {changeStr}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Seats (for waiting tables) */}
            {table.status === "waiting" && (
              <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
                <h2 className="font-mono text-sm text-slate-400 mb-4">Seats</h2>
                <div className="font-mono text-xs space-y-2">
                  {table.seats.map((seat) => (
                    <div key={seat.seatId} className="flex justify-between">
                      <span className="text-slate-500">Seat {seat.seatId}</span>
                      <span className={seat.agentId ? "text-slate-300" : "text-slate-600"}>
                        {seat.agentName ?? (seat.agentId ? "Agent" : "Empty")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent hand results: sliding window (current hand −4 to current) for contextual navigation */}
            {hasReplay && replayData.totalHands > 0 && (
              <div className="border border-slate-800 rounded-lg p-4 sm:p-6 bg-slate-900/30">
                <h2 className="font-mono text-sm text-slate-400 mb-1">Recent Hands</h2>
                <p className="font-mono text-[10px] text-slate-600 mb-4">
                  Showing last 5 · click to jump
                </p>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {(() => {
                    const startHand = Math.max(1, currentHand - 4)
                    const endHand = currentHand
                    const handRange = Array.from(
                      { length: endHand - startHand + 1 },
                      (_, i) => startHand + i
                    )
                    return handRange.map((handNum) => {
                      const i = handNum - 1
                      const startIdx = replayData.handStartIndices[i]
                      const nextHandStart = replayData.handStartIndices[i + 1] ?? replayData.snapshots.length
                      const completeSnapshot = replayData.snapshots
                        .slice(startIdx, nextHandStart)
                        .find((s) => s.eventType === "HAND_COMPLETE")

                      const winners = completeSnapshot?.handComplete?.results.filter((r) => r.winnings > 0) ?? []
                      const pot = completeSnapshot?.handComplete?.finalPots?.reduce((sum, p) => sum + p.amount, 0) ?? 0
                      const communityCards = completeSnapshot?.handComplete?.communityCards ?? []

                      return (
                        <button
                          key={handNum}
                          onClick={() => goToHand(handNum)}
                          className={`w-full text-left border-b border-slate-800/50 pb-3 last:border-0 last:pb-0 hover:bg-slate-800/30 rounded -mx-1 px-1 transition-colors ${
                            currentHand === handNum ? "bg-slate-800/40" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-slate-500">
                              #{handNum}
                            </span>
                            {pot > 0 && (
                              <span className="font-mono text-xs text-slate-400" title="Pot size">
                                pot {pot}
                              </span>
                            )}
                          </div>
                          {winners.length > 0 && (
                            <div className="font-mono text-xs text-slate-300">
                              {winners.map((w) => {
                                const name = gameState?.players.find((p) => p.seatId === w.seatId)?.agentName ?? `Seat ${w.seatId}`
                                return name
                              }).join(", ")}{" "}
                              wins
                              {winners[0]?.handRank && (
                                <span className="text-slate-500"> — {winners[0].handRank}</span>
                              )}
                            </div>
                          )}
                          {communityCards.length > 0 && (
                            <div className="flex items-center gap-0.5 mt-1 font-mono text-[10px]">
                              {communityCards.map((card, ci) => (
                                <InlineCard key={ci} rank={card.rank} suit={card.suit} />
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        <AsciiDivider className="mt-10 mb-6" />

        <div className="text-center font-mono text-xs text-slate-600">
          {"// Use ← → arrow keys to navigate, Home/End to jump"}
        </div>
      </main>
    </div>
  )
}
