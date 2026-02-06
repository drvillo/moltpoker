'use client';

import { useParams } from 'next/navigation';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useTableWebSocket } from '@/hooks/useTableWebSocket';

export default function LiveTablePage() {
  const params = useParams();
  const tableId = params.tableId as string;
  const { connected, gameState, handComplete, error } = useTableWebSocket(tableId, {
    mode: 'observer',
  });

  if (error) {
    return (
      <div className="p-8">
        <Card>
          <div className="text-center text-red-600">Error: {error}</div>
        </Card>
      </div>
    );
  }

  if (!connected || !gameState) {
    return (
      <div className="p-8">
        <Card>
          <div className="text-center">Connecting...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Table {tableId}</h1>
        <Badge variant={connected ? 'success' : 'default'}>
          {connected ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-xl font-semibold">Game State</h2>
            <div className="space-y-4">
              <div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Hand Number:</span>{' '}
                <span className="font-mono">{gameState.handNumber}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Phase:</span>{' '}
                <Badge>{gameState.phase}</Badge>
              </div>
              {gameState.communityCards.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Community Cards:</span>
                  <div className="mt-2 flex space-x-2">
                    {gameState.communityCards.map((card, i) => (
                      <div
                        key={i}
                        className="flex h-16 w-12 items-center justify-center rounded border border-gray-200 bg-white text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      >
                        {card.rank}
                        {card.suit}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {gameState.pots.length > 0 && (
                <div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Pot:</span>{' '}
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
                  className={`flex items-center justify-between rounded border border-gray-200 p-3 dark:border-gray-700 ${
                    player.seatId === gameState.currentSeat ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                  }`}
                >
                  <div>
                    <div className="font-medium">
                      Seat {player.seatId} {player.agentName && `- ${player.agentName}`}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      Stack: {player.stack} | Bet: {player.bet}
                      {player.folded && ' (Folded)'}
                      {player.allIn && ' (All In)'}
                    </div>
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
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {handComplete.results.map((r, i) => (
                    <div key={i}>
                      Seat {r.seatId}: {r.winnings} chips
                    </div>
                  ))}
                </div>
              </div>
            )}
            {gameState.lastAction && (
              <div className="mt-4 text-sm">
                <div className="font-medium">Last Action:</div>
                <div className="text-gray-600 dark:text-gray-300">
                  Seat {gameState.lastAction.seatId} - {gameState.lastAction.kind}
                  {gameState.lastAction.amount && ` (${gameState.lastAction.amount})`}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
