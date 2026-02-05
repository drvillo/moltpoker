'use client'

import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { adminApi } from '@/lib/api'
import {
  buildReplayData,
  getHandNumberForIndex,
  getIndexForHand,
  type ReplayData,
} from '@/lib/replayState'

interface ReplayViewerProps {
  tableId: string
}

export function ReplayViewer({ tableId }: ReplayViewerProps) {
  const [replayData, setReplayData] = useState<ReplayData | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadEvents() {
      try {
        setLoading(true)
        const { events } = await adminApi.getTableEvents(tableId, { limit: 10000 })
        const data = buildReplayData(tableId, events)
        setReplayData(data)
        // Start at the end to show final state
        if (data.snapshots.length > 0) {
          setCurrentIndex(data.snapshots.length - 1)
        }
      } catch (err) {
        console.error('Failed to load events:', err)
        setError('Failed to load game history')
      } finally {
        setLoading(false)
      }
    }
    loadEvents()
  }, [tableId])

  const goToStart = useCallback(() => setCurrentIndex(0), [])
  const goToPrev = useCallback(
    () => setCurrentIndex((i) => Math.max(0, i - 1)),
    []
  )
  const goToNext = useCallback(
    () =>
      setCurrentIndex((i) =>
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
      if (replayData) {
        setCurrentIndex(getIndexForHand(replayData, handNumber))
      }
    },
    [replayData]
  )

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goToPrev()
      else if (e.key === 'ArrowRight') goToNext()
      else if (e.key === 'Home') goToStart()
      else if (e.key === 'End') goToEnd()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrev, goToNext, goToStart, goToEnd])

  if (loading) {
    return (
      <Card>
        <div className="text-center py-8">Loading game history...</div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-8 text-red-600">{error}</div>
      </Card>
    )
  }

  if (!replayData || replayData.snapshots.length === 0) {
    return (
      <Card>
        <div className="text-center py-8 text-gray-500">No game events found</div>
      </Card>
    )
  }

  const snapshot = replayData.snapshots[currentIndex]
  const gameState = snapshot.gameState
  const handComplete = snapshot.handComplete
  const currentHand = getHandNumberForIndex(replayData, currentIndex)
  const isAtEnd = currentIndex === replayData.snapshots.length - 1

  return (
    <div>
      {/* Navigation Controls */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Button type="button" variant="secondary" size="sm" onClick={goToStart} disabled={currentIndex === 0}>
              ⏮
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={goToPrev} disabled={currentIndex === 0}>
              ◀ Prev
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={goToNext} disabled={isAtEnd}>
              Next ▶
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={goToEnd} disabled={isAtEnd}>
              ⏭
            </Button>
          </div>

          <div className="text-sm text-gray-600">
            Step {currentIndex + 1} / {replayData.snapshots.length}
          </div>

          {replayData.totalHands > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Jump to:</span>
              <Select
                value={String(currentHand)}
                onChange={(e) => goToHand(Number(e.target.value))}
              >
                {Array.from({ length: replayData.totalHands }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Hand {i + 1}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </Card>

      {/* Event Description */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="text-sm text-blue-600 font-medium">{snapshot.eventType}</div>
        <div className="text-blue-900">{snapshot.eventDescription}</div>
      </div>

      {/* Game State Display - Reused from watch page */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-xl font-semibold">Game State</h2>
            <div className="space-y-4">
              <div>
                <span className="text-sm font-medium text-gray-500">Hand Number:</span>{' '}
                <span className="font-mono">{gameState.handNumber}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Phase:</span>{' '}
                <Badge>{gameState.phase}</Badge>
              </div>
              {gameState.communityCards.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Community Cards:</span>
                  <div className="mt-2 flex space-x-2">
                    {gameState.communityCards.map((card, i) => (
                      <div
                        key={i}
                        className={`flex h-16 w-12 items-center justify-center rounded border bg-white text-sm font-bold ${
                          card.suit === 'h' || card.suit === 'd' ? 'text-red-600' : 'text-gray-900'
                        }`}
                      >
                        {card.rank}
                        {card.suit === 's' ? '♠' : card.suit === 'h' ? '♥' : card.suit === 'd' ? '♦' : '♣'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {gameState.pots.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Pot:</span>{' '}
                  <span className="font-mono">{gameState.pots[0].amount}</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-6">
            <h2 className="mb-4 text-xl font-semibold">Players</h2>
            <div className="space-y-2">
              {gameState.players.map((player) => (
                <div
                  key={player.seatId}
                  className={`flex items-center justify-between rounded border p-3 ${
                    player.seatId === gameState.currentSeat ? 'bg-yellow-50 border-yellow-300' : ''
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      Seat {player.seatId} {player.agentName && `- ${player.agentName}`}
                      {player.seatId === gameState.dealerSeat && (
                        <span className="ml-2 text-xs bg-gray-200 px-1.5 py-0.5 rounded">D</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      Stack: {player.stack} | Bet: {player.bet}
                      {player.folded && ' (Folded)'}
                      {player.allIn && ' (All In)'}
                    </div>
                    {/* Show hole cards in replay mode */}
                    {player.holeCards && player.holeCards.length > 0 && (
                      <div className="mt-2 flex space-x-1">
                        {player.holeCards.map((card, i) => (
                          <div
                            key={i}
                            className={`flex h-10 w-8 items-center justify-center rounded border bg-white text-xs font-bold ${
                              card.suit === 'h' || card.suit === 'd' ? 'text-red-600' : 'text-gray-900'
                            } ${player.folded ? 'opacity-50' : ''}`}
                          >
                            {card.rank}
                            {card.suit === 's' ? '♠' : card.suit === 'h' ? '♥' : card.suit === 'd' ? '♦' : '♣'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {player.seatId === gameState.currentSeat && (
                    <Badge variant="warning">Turn</Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <h2 className="mb-4 text-xl font-semibold">Hand History</h2>
            {handComplete && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Hand Complete</div>
                <div className="text-xs text-gray-600">
                  {handComplete.results.map((r, i) => (
                    <div key={i} className={r.winnings > 0 ? 'text-green-600 font-medium' : ''}>
                      Seat {r.seatId}: {r.winnings > 0 ? `+${r.winnings}` : r.winnings} chips
                      {r.handRank && ` (${r.handRank})`}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {gameState.lastAction && (
              <div className="mt-4 text-sm">
                <div className="font-medium">Last Action:</div>
                <div className="text-gray-600">
                  Seat {gameState.lastAction.seatId} - {gameState.lastAction.kind}
                  {gameState.lastAction.amount !== undefined && ` (${gameState.lastAction.amount})`}
                </div>
              </div>
            )}
          </Card>

          {/* Final Standings - shown at end */}
          {isAtEnd && replayData.finalStacks.length > 0 && (
            <Card className="mt-6">
              <h2 className="mb-4 text-xl font-semibold">Final Standings</h2>
              <div className="space-y-2">
                {replayData.finalStacks.map((standing, i) => (
                  <div
                    key={standing.seatId}
                    className={`flex items-center justify-between p-2 rounded ${
                      i === 0 ? 'bg-yellow-50 border border-yellow-200' : ''
                    }`}
                  >
                    <div>
                      <span className="font-medium">
                        {i + 1}. {standing.agentName || `Seat ${standing.seatId}`}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">{standing.stack}</div>
                      <div
                        className={`text-xs ${
                          standing.netChange > 0
                            ? 'text-green-600'
                            : standing.netChange < 0
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {standing.netChange > 0 ? '+' : ''}
                        {standing.netChange}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="mt-4 text-xs text-gray-400 text-center">
        Use ← → arrow keys to navigate, Home/End to jump to start/end
      </div>
    </div>
  )
}
