import { TableConfigSchema } from '@moltpoker/shared';
import {
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from '@moltpoker/shared';

import { config } from '../config.js';
import * as db from '../db.js';
import { broadcastManager } from '../ws/broadcastManager.js';

import { tableManager } from './manager.js';
import { scheduleActionTimeout } from './timeoutHandler.js';

export interface StartTableResult {
  success: boolean;
  handNumber: number;
}

/**
 * Shared helper that creates a table runtime, transitions the table
 * from `waiting` to `running`, starts the first hand, and promotes
 * any pending WebSocket connections.
 *
 * Used by both the admin start endpoint and the auto-start logic
 * triggered on join.
 */
export async function startTableRuntime(tableId: string): Promise<StartTableResult> {
  const table = await db.getTable(tableId);
  if (!table) throw new Error(`Table ${tableId} not found`);
  if (table.status !== 'waiting') throw new Error(`Table ${tableId} is already ${table.status}`);

  const seats = await db.getSeats(tableId);
  const seatedPlayers = seats.filter((s) => s.agent_id);

  const tableConfig = TableConfigSchema.parse(table.config);

  if (seatedPlayers.length < tableConfig.minPlayersToStart) {
    throw new Error(
      `Not enough players (${seatedPlayers.length}/${tableConfig.minPlayersToStart})`
    );
  }

  // Create table runtime
  const managedTable = await tableManager.create(tableId, tableConfig, table.seed ?? undefined);

  // Add players to runtime
  for (const seat of seatedPlayers) {
    const agentName = seat.agents?.name ?? null;
    managedTable.runtime.addPlayer(seat.seat_id, seat.agent_id, agentName, seat.stack);
  }

  // Update status
  await db.updateTableStatus(tableId, 'running');

  // Log player joined events
  for (const seat of seatedPlayers) {
    const agentName = seat.agents?.name ?? null;
    await managedTable.eventLogger.log('PLAYER_JOINED', {
      seatId: seat.seat_id,
      agentId: seat.agent_id,
      agentName,
      stack: seat.stack,
    });
  }

  // Log table started event
  await managedTable.eventLogger.log('TABLE_STARTED', {
    config: {
      blinds: tableConfig.blinds,
      maxSeats: tableConfig.maxSeats,
      initialStack: tableConfig.initialStack,
      actionTimeoutMs: tableConfig.actionTimeoutMs,
      seed: table.seed,
    },
  });

  // Start first hand
  const handStarted = managedTable.runtime.startHand();

  if (handStarted) {
    const runtime = managedTable.runtime;
    const players = runtime.getAllPlayers();

    await managedTable.eventLogger.log(
      'HAND_START',
      {
        handNumber: runtime.getHandNumber(),
        dealerSeat: runtime.getDealerSeat(),
        smallBlindSeat: players.find((p) => p.bet === tableConfig.blinds.small)?.seatId ?? -1,
        bigBlindSeat: players.find((p) => p.bet === tableConfig.blinds.big)?.seatId ?? -1,
        smallBlind: tableConfig.blinds.small,
        bigBlind: tableConfig.blinds.big,
        players: players.map((p) => ({
          seatId: p.seatId,
          agentId: p.agentId,
          stack: p.stack + p.bet, // Original stack before blinds
          holeCards: p.holeCards,
        })),
      },
      runtime.getHandNumber()
    );

    // Schedule timeout for first player
    scheduleActionTimeout(tableId);
  }

  // Promote pending WS connections — send welcome + game state
  const promoted = broadcastManager.promotePendingConnections(tableId);
  for (const conn of promoted) {
    broadcastManager.sendWelcome(tableId, conn.agentId, {
      protocol_version: PROTOCOL_VERSION,
      min_supported_protocol_version: MIN_SUPPORTED_PROTOCOL_VERSION,
      skill_doc_url: config.skillDocUrl,
      seat_id: conn.seatId,
      agent_id: conn.agentId,
      action_timeout_ms: managedTable.runtime.getActionTimeoutMs(),
    });

    const state = managedTable.runtime.getStateForSeat(conn.seatId);
    broadcastManager.sendGameState(tableId, conn.agentId, state);
  }

  return {
    success: true,
    handNumber: managedTable.runtime.getHandNumber(),
  };
}
