import { config } from '../config.js'
import { broadcastManager } from '../ws/broadcastManager.js'

import { endTable } from './endTable.js'
import { tableManager } from './manager.js'

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
 * End an abandoned table via centralized endTable service.
 */
async function endAbandonedTable(tableId: string): Promise<void> {
  const managedTable = tableManager.get(tableId)
  if (!managedTable) return
  if (broadcastManager.getConnectionCount(tableId) > 0) return

  await endTable({ tableId, reason: 'abandoned', source: 'abandonment' })
}
