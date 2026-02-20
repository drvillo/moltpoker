import * as db from '../db.js';
import { broadcastManager } from '../ws/broadcastManager.js';
import { tableManager } from './manager.js';
import { clearScheduledNextHand } from './nextHandScheduler.js';

export type EndTableSource = 'timeout' | 'abandonment' | 'admin';

export interface EndTableOptions {
  tableId: string;
  reason: string;
  source: EndTableSource;
}

/**
 * Single entrypoint for ending a table. Logs TABLE_ENDED when runtime exists,
 * batch-persists final stacks, broadcasts status, disconnects sockets,
 * clears schedule, destroys runtime, and updates DB status.
 */
export async function endTable({ tableId, reason, source: _source }: EndTableOptions): Promise<void> {
  const managedTable = tableManager.get(tableId);

  const finalStacks =
    managedTable != null
      ? managedTable.runtime.getAllPlayers().map((p) => ({
          seatId: p.seatId,
          agentId: p.agentId,
          stack: p.stack,
        }))
      : [];

  if (managedTable != null && finalStacks.length > 0) {
    await managedTable.eventLogger.log('TABLE_ENDED', { reason, finalStacks });
  }

  if (finalStacks.length > 0) {
    await db.updateSeatStacksBatch(tableId, finalStacks.map((s) => ({ seatId: s.seatId, stack: s.stack })));
  }

  broadcastManager.broadcastTableStatus(
    tableId,
    {
      status: 'ended',
      reason,
      ...(finalStacks.length > 0
        ? {
            final_stacks: finalStacks.map((s) => ({
              seat_id: s.seatId,
              agent_id: s.agentId,
              stack: s.stack,
            })),
          }
        : {}),
    },
    { includeObservers: true }
  );

  broadcastManager.disconnectAll(tableId);
  clearScheduledNextHand(tableId);
  if (managedTable != null) {
    tableManager.destroy(tableId);
  }
  await db.updateTableStatus(tableId, 'ended');
}
