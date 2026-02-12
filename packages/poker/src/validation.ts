import type { ActionResult, LegalAction, PlayerAction } from '@moltpoker/shared';

import type { TableRuntime } from './runtime.js';

/**
 * Validate an action against the current game state
 */
export function validateAction(
  runtime: TableRuntime,
  seatId: number,
  action: PlayerAction
): ActionResult {
  // Check if it's the player's turn
  if (runtime.getCurrentSeat() !== seatId) {
    return {
      success: false,
      error: 'It is not your turn to act',
      errorCode: 'NOT_YOUR_TURN',
    };
  }

  // Get the player
  const player = runtime.getPlayer(seatId);
  if (!player) {
    return {
      success: false,
      error: 'Player not found',
      errorCode: 'INVALID_ACTION',
    };
  }

  if (player.folded) {
    return {
      success: false,
      error: 'Player has already folded',
      errorCode: 'INVALID_ACTION',
    };
  }

  if (player.allIn) {
    return {
      success: false,
      error: 'Player is all-in and cannot act',
      errorCode: 'INVALID_ACTION',
    };
  }

  // Get legal actions
  const legalActions = runtime.getLegalActions(seatId);

  // Check if the action kind is legal
  const legalAction = legalActions.find((la) => la.kind === action.kind);
  if (!legalAction) {
    return {
      success: false,
      error: `Action '${action.kind}' is not legal in this situation`,
      errorCode: 'INVALID_ACTION',
    };
  }

  // Validate raise amount if applicable
  if (action.kind === 'raiseTo') {
    if (action.amount === undefined) {
      return {
        success: false,
        error: 'Raise amount is required',
        errorCode: 'INVALID_ACTION',
      };
    }

    const minAmount = legalAction.minAmount ?? 0;
    const maxAmount = legalAction.maxAmount ?? Infinity;

    if (action.amount < minAmount) {
      return {
        success: false,
        error: `Raise amount must be at least ${minAmount}`,
        errorCode: 'INVALID_ACTION',
      };
    }

    if (action.amount > maxAmount) {
      return {
        success: false,
        error: `Raise amount cannot exceed ${maxAmount}`,
        errorCode: 'INVALID_ACTION',
      };
    }
  }

  return { success: true };
}

/**
 * Get legal actions for a seat
 */
export function getLegalActions(runtime: TableRuntime, seatId: number): LegalAction[] {
  return runtime.getLegalActions(seatId);
}

/**
 * Get the default action for a timeout (check if legal, else fold)
 */
export function getDefaultTimeoutAction(runtime: TableRuntime, seatId: number): PlayerAction {
  const legalActions = runtime.getLegalActions(seatId);

  // Check if check is legal
  const canCheck = legalActions.some((la) => la.kind === 'check');

  return {
    turn_token: runtime.getTurnToken(),
    kind: canCheck ? 'check' : 'fold',
  };
}
