import { getDefaultTimeoutAction } from '@moltpoker/poker';

import { broadcastManager } from '../ws/broadcastManager.js';

import { endTable } from './endTable.js';
import { tableManager } from './manager.js';
import { scheduledNextHandForHand } from './nextHandScheduler.js';

/** Delay before auto-starting next hand (ms) */
const NEXT_HAND_DELAY_MS = 1500;

export { clearScheduledNextHand } from './nextHandScheduler.js';

/**
 * Auto-start the next hand after a delay
 * Called after hand_complete is broadcast
 */
export function scheduleNextHand(tableId: string): void {
  const table = tableManager.get(tableId);
  if (!table) return;

  const currentHand = table.runtime.getHandNumber();

  // Idempotency check - already scheduled for this hand?
  if (scheduledNextHandForHand.get(tableId) === currentHand) {
    return;
  }
  scheduledNextHandForHand.set(tableId, currentHand);

  setTimeout(async () => {
    // Clear tracking on execution
    if (scheduledNextHandForHand.get(tableId) === currentHand) {
      scheduledNextHandForHand.delete(tableId);
    }

    const tableAfterDelay = tableManager.get(tableId);
    if (!tableAfterDelay) return;

    const { runtime, eventLogger } = tableAfterDelay;

    // Only start if hand is complete and we have enough players
    if (!runtime.isHandComplete()) return;

    // Start the next hand
    const handStarted = runtime.startHand();

    if (!handStarted) {
      await endTable({ tableId, reason: 'insufficient_players', source: 'timeout' });
      return;
    }

    // Log hand start
    const players = runtime.getAllPlayers();
    const config = runtime.getConfig();

    await eventLogger.log(
      'HAND_START',
      {
        handNumber: runtime.getHandNumber(),
        dealerSeat: runtime.getDealerSeat(),
        smallBlindSeat: players.find((p) => p.bet === config.blinds.small)?.seatId ?? -1,
        bigBlindSeat: players.find((p) => p.bet === config.blinds.big)?.seatId ?? -1,
        smallBlind: config.blinds.small,
        bigBlind: config.blinds.big,
        players: players.map((p) => ({
          seatId: p.seatId,
          agentId: p.agentId,
          stack: p.stack + p.bet,
          holeCards: p.holeCards,
        })),
      },
      runtime.getHandNumber()
    );

    // Broadcast game state to all
    broadcastManager.broadcastGameState(tableId, runtime);

    // Schedule timeout for first player
    scheduleActionTimeout(tableId);
  }, NEXT_HAND_DELAY_MS);
}

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

    // Broadcast updated state (sync)
    broadcastManager.broadcastGameState(tableId, runtime);

    // Check hand completion and schedule (sync)
    const handComplete = runtime.isHandComplete() ? runtime.getHandCompletePayload() : null;
    if (handComplete) {
      broadcastManager.broadcastHandComplete(tableId, handComplete);
      scheduleNextHand(tableId);
    } else {
      // Schedule next timeout if there's still someone to act
      scheduleActionTimeout(tableId);
    }

    // Log asynchronously (fire-and-forget)
    eventLogger
      .log(
        'PLAYER_TIMEOUT',
        {
          handNumber: runtime.getHandNumber(),
          seatId,
          agentId: player?.agentId || 'unknown',
          defaultAction: defaultAction.kind,
        },
        runtime.getHandNumber()
      )
      .catch((err) => console.error('Failed to log timeout:', err));

    eventLogger
      .log(
        'PLAYER_ACTION',
        {
          handNumber: runtime.getHandNumber(),
          seatId,
          agentId: player?.agentId || 'unknown',
          turnToken: defaultAction.turn_token,
          kind: defaultAction.kind,
          amount: defaultAction.amount,
          isTimeout: true,
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
