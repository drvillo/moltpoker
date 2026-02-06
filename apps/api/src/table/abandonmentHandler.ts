import { config } from '../config.js'
import * as db from '../db.js'
import { broadcastManager } from '../ws/broadcastManager.js'

import { tableManager } from './manager.js'
import { clearScheduledNextHand } from './timeoutHandler.js'

/** In-memory grace-period timers keyed by tableId */
const graceTimers = new Map<string, NodeJS.Timeout>()

/**
 * Called on every WS disconnect for a running table.
 * If no active connections remain, starts the abandonment grace timer.
 */
export function checkAbandonment(tableId: string): void {
  const connectionCount = broadcastManager.getConnectionCount(tableId)
  if (connectionCount > 0) return

  // Already has a pending timer — nothing to do
  if (graceTimers.has(tableId)) return

  const timer = setTimeout(() => {
    graceTimers.delete(tableId)
    void endAbandonedTable(tableId)
  }, config.tableAbandonmentGraceMs)

  graceTimers.set(tableId, timer)
}

/**
 * Called when a WS connects to a running table (agent reconnects).
 * Clears the pending grace timer so the table stays alive.
 */
export function cancelAbandonment(tableId: string): void {
  const timer = graceTimers.get(tableId)
  if (timer) {
    clearTimeout(timer)
    graceTimers.delete(tableId)
  }
}

/**
 * Check whether a table currently has an active abandonment timer.
 */
export function hasAbandonmentTimer(tableId: string): boolean {
  return graceTimers.has(tableId)
}

/**
 * End an abandoned table: log, broadcast, disconnect, destroy runtime, update DB.
 */
async function endAbandonedTable(tableId: string): Promise<void> {
  const managedTable = tableManager.get(tableId)

  // Table may have been ended by admin in the meantime — nothing to do
  if (!managedTable) return

  // Re-check connection count — an agent may have reconnected between
  // timer scheduling and execution (race guard)
  if (broadcastManager.getConnectionCount(tableId) > 0) return

  const players = managedTable.runtime.getAllPlayers()
  const finalStacks = players.map((p) => ({
    seatId: p.seatId,
    agentId: p.agentId,
    stack: p.stack,
  }))

  // Log TABLE_ENDED event
  await managedTable.eventLogger.log('TABLE_ENDED', {
    reason: 'abandoned',
    finalStacks,
  })

  // Broadcast ended status to any lingering connections / observers
  broadcastManager.broadcastTableStatus(
    tableId,
    {
      status: 'ended',
      reason: 'abandoned',
      final_stacks: finalStacks.map((s) => ({
        seat_id: s.seatId,
        agent_id: s.agentId,
        stack: s.stack,
      })),
    },
    { includeObservers: true },
  )

  // Disconnect all remaining sockets (observers, etc.)
  broadcastManager.disconnectAll(tableId)

  // Clear scheduled next-hand timer
  clearScheduledNextHand(tableId)

  // Destroy the in-memory runtime
  tableManager.destroy(tableId)

  // Persist the ended status to DB
  await db.updateTableStatus(tableId, 'ended')
}
