import type { WebSocket } from 'ws';

import {
  ClientMessageSchema,
  ErrorCodes,
  MIN_SUPPORTED_PROTOCOL_VERSION,
} from '@moltpoker/shared';

import { config } from '../config.js';
import { updateAgentLastSeen } from '../db.js';
import { tableManager } from '../table/manager.js';
import { clearActionTimeout, scheduleActionTimeout } from '../table/timeoutHandler.js';
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
      await handleAction(session, message.action, message.expected_seq);
      break;
  }
}

/**
 * Handle player action
 */
async function handleAction(
  session: SessionInfo,
  action: { action_id: string; kind: string; amount?: number },
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

  // Check sequence number if provided
  if (expectedSeq !== undefined && expectedSeq !== runtime.getSeq()) {
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

  // Check idempotency
  if (runtime.isActionProcessed(action.action_id)) {
    // Action already processed, send ack
    broadcastManager.sendAck(tableId, agentId, action.action_id, runtime.getSeq(), true);
    return;
  }

  // Apply the action
  const playerAction = {
    action_id: action.action_id,
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

  // Log the action event
  await eventLogger.log(
    'PLAYER_ACTION',
    {
      handNumber: runtime.getHandNumber(),
      seatId,
      agentId,
      actionId: action.action_id,
      kind: action.kind,
      amount: action.amount,
      isTimeout: false,
    },
    runtime.getHandNumber()
  );

  // Send ack to the acting player
  broadcastManager.sendAck(tableId, agentId, action.action_id, runtime.getSeq(), true);

  // Broadcast updated state to all players
  broadcastManager.broadcastGameState(tableId, runtime);

  // Check if hand is complete
  if (runtime.isHandComplete()) {
    const handComplete = runtime.getHandCompletePayload();
    if (handComplete) {
      await eventLogger.log('HAND_COMPLETE', handComplete as Record<string, unknown>, runtime.getHandNumber());
      broadcastManager.broadcastHandComplete(tableId, handComplete);
    }
  } else {
    // Schedule timeout for next player
    scheduleActionTimeout(tableId);
  }
}
