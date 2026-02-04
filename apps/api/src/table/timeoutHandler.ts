import { getDefaultTimeoutAction } from '@moltpoker/poker';

import { tableManager } from './manager.js';
import { broadcastManager } from '../ws/broadcastManager.js';

/**
 * Handle action timeout for a player
 */
export async function handleActionTimeout(tableId: string, seatId: number): Promise<void> {
  const table = tableManager.get(tableId);
  if (!table) return;

  const { runtime, eventLogger } = table;

  // Only act if it's still this player's turn
  if (runtime.getCurrentSeat() !== seatId) return;

  // Get default action (check if legal, else fold)
  const defaultAction = getDefaultTimeoutAction(runtime, seatId);

  // Apply the action
  const result = runtime.applyAction(seatId, defaultAction);

  if (result.success) {
    // Get player info
    const player = runtime.getPlayer(seatId);

    // Log the timeout event
    await eventLogger.log(
      'PLAYER_TIMEOUT',
      {
        handNumber: runtime.getHandNumber(),
        seatId,
        agentId: player?.agentId || 'unknown',
        defaultAction: defaultAction.kind,
      },
      runtime.getHandNumber()
    );

    // Log the action event
    await eventLogger.log(
      'PLAYER_ACTION',
      {
        handNumber: runtime.getHandNumber(),
        seatId,
        agentId: player?.agentId || 'unknown',
        actionId: defaultAction.action_id,
        kind: defaultAction.kind,
        amount: defaultAction.amount,
        isTimeout: true,
      },
      runtime.getHandNumber()
    );

    // Broadcast updated state
    broadcastManager.broadcastGameState(tableId, runtime);

    // Check if hand is complete
    if (runtime.isHandComplete()) {
      const handComplete = runtime.getHandCompletePayload();
      if (handComplete) {
        await eventLogger.log('HAND_COMPLETE', handComplete as Record<string, unknown>, runtime.getHandNumber());
        broadcastManager.broadcastHandComplete(tableId, handComplete);
      }
    } else {
      // Schedule next timeout if there's still someone to act
      scheduleActionTimeout(tableId);
    }
  }
}

/**
 * Schedule action timeout for the current player
 */
export function scheduleActionTimeout(tableId: string): void {
  const table = tableManager.get(tableId);
  if (!table) return;

  const { runtime } = table;
  const currentSeat = runtime.getCurrentSeat();

  if (currentSeat < 0) return;

  tableManager.setActionTimeout(
    tableId,
    currentSeat,
    () => handleActionTimeout(tableId, currentSeat),
    runtime.getActionTimeoutMs()
  );
}

/**
 * Clear timeout for a specific seat
 */
export function clearActionTimeout(tableId: string, seatId: number): void {
  tableManager.clearActionTimeout(tableId, seatId);
}
