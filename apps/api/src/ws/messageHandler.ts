import {
  ClientMessageSchema,
  ErrorCodes,
  MIN_SUPPORTED_PROTOCOL_VERSION,
} from '@moltpoker/shared';
import type { WebSocket } from 'ws';


import { config } from '../config.js';
import { updateAgentLastSeen } from '../db.js';
import { tableManager } from '../table/manager.js';
import { tableActionLock } from '../table/actionLock.js';
import { clearActionTimeout, scheduleActionTimeout, scheduleNextHand } from '../table/timeoutHandler.js';

import { broadcastManager } from './broadcastManager.js';

interface SessionInfo {
  agentId: string;
  tableId: string;
  seatId: number;
}

/**
 * Handle incoming WebSocket messages
 */
export async function handleMessage(
  ws: WebSocket,
  data: string,
  session: SessionInfo
): Promise<void> {
  const { agentId, tableId } = session;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    broadcastManager.sendError(tableId, agentId, {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Invalid JSON',
    });
    return;
  }

  // Validate message schema
  const result = ClientMessageSchema.safeParse(parsed);
  if (!result.success) {
    broadcastManager.sendError(tableId, agentId, {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Invalid message format',
      details: { errors: result.error.errors },
    });
    return;
  }

  const message = result.data;

  // Update last seen
  updateAgentLastSeen(agentId).catch(() => {});

  // Handle message types
  switch (message.type) {
    case 'ping':
      broadcastManager.sendPong(ws, message.payload.timestamp);
      break;

    case 'action':
      const unlock = await tableActionLock.acquire(tableId);
      try {
        await handleAction(session, message.action, message.expected_seq);
      } finally {
        unlock();
      }
      break;
  }
}

/**
 * Handle player action
 */
async function handleAction(
  session: SessionInfo,
  action: { turn_token: string; kind: string; amount?: number },
  expectedSeq?: number
): Promise<void> {
  const { agentId, tableId, seatId } = session;

  const table = tableManager.get(tableId);
  if (!table) {
    broadcastManager.sendError(tableId, agentId, {
      code: ErrorCodes.TABLE_NOT_FOUND,
      message: 'Table not found',
    });
    return;
  }

  const { runtime, eventLogger } = table;
  const currentSeq = runtime.getSeq();

  // Check sequence number if provided
  if (expectedSeq !== undefined && expectedSeq !== currentSeq) {
    broadcastManager.sendError(tableId, agentId, {
      code: ErrorCodes.STALE_SEQ,
      message: 'Game state has changed. Please refresh.',
      min_supported_protocol_version: MIN_SUPPORTED_PROTOCOL_VERSION,
      skill_doc_url: config.skillDocUrl,
    });
    return;
  }

  // Check if it's this player's turn
  if (runtime.getCurrentSeat() !== seatId) {
    broadcastManager.sendError(tableId, agentId, {
      code: ErrorCodes.NOT_YOUR_TURN,
      message: 'It is not your turn to act',
    });
    return;
  }

  // Check idempotency via turn_token
  const processed = runtime.isTurnTokenProcessed(action.turn_token);
  if (processed) {
    broadcastManager.sendAck(tableId, agentId, action.turn_token, processed.seq, true);
    return;
  }

  // Apply the action
  const playerAction = {
    turn_token: action.turn_token,
    kind: action.kind as 'fold' | 'check' | 'call' | 'raiseTo',
    amount: action.amount,
  };

  const result = runtime.applyAction(seatId, playerAction);

  if (!result.success) {
    broadcastManager.sendError(tableId, agentId, {
      code: result.errorCode || ErrorCodes.INVALID_ACTION,
      message: result.error || 'Invalid action',
    });
    return;
  }

  // Clear timeout for this seat
  clearActionTimeout(tableId, seatId);

  // Send ack echoing the turn_token
  broadcastManager.sendAck(tableId, agentId, action.turn_token, runtime.getSeq(), true);

  // Broadcast updated state to all players (sync)
  broadcastManager.broadcastGameState(tableId, runtime);

  // Check hand completion and schedule (sync)
  const handComplete = runtime.isHandComplete() ? runtime.getHandCompletePayload() : null;
  if (handComplete) {
    broadcastManager.broadcastHandComplete(tableId, handComplete);
    scheduleNextHand(tableId);
  } else {
    // Schedule timeout for next player
    scheduleActionTimeout(tableId);
  }

  // Log asynchronously (fire-and-forget)
  eventLogger
    .log(
      'PLAYER_ACTION',
      {
        handNumber: runtime.getHandNumber(),
        seatId,
        agentId,
        turnToken: action.turn_token,
        kind: action.kind,
        amount: action.amount,
        isTimeout: false,
      },
      runtime.getHandNumber()
    )
    .catch((err) => console.error('Failed to log action:', err));

  if (result.streetsDealt) {
    for (const sd of result.streetsDealt) {
      eventLogger
        .log(
          'STREET_DEALT',
          {
            handNumber: runtime.getHandNumber(),
            street: sd.street,
            cards: sd.cards,
          },
          runtime.getHandNumber()
        )
        .catch((err) => console.error('Failed to log street dealt:', err));
      broadcastManager.broadcastStreetDealt(tableId, {
        handNumber: runtime.getHandNumber(),
        street: sd.street,
        cards: sd.cards,
      });
    }
  }

  if (handComplete) {
    eventLogger
      .log('HAND_COMPLETE', handComplete as Record<string, unknown>, runtime.getHandNumber())
      .catch((err) => console.error('Failed to log hand complete:', err));
  }
}
