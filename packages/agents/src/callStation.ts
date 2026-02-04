import type { GameStatePayload, LegalAction, PlayerAction } from '@moltpoker/shared';

import { createActionId, type PokerAgent } from './types.js';

/**
 * Call Station agent - always calls when facing a bet
 * - Never raises
 * - Never folds when call is an option
 * Good for testing bet/call dynamics
 */
export class CallStationAgent implements PokerAgent {
  name = 'CallStationAgent';

  getAction(_state: GameStatePayload, legalActions: LegalAction[]): PlayerAction {
    if (legalActions.length === 0) {
      throw new Error('No legal actions available');
    }

    // Priority: check > call > fold
    // Never raise

    // Check if we can check
    const canCheck = legalActions.some((a) => a.kind === 'check');
    if (canCheck) {
      return { action_id: createActionId(), kind: 'check' };
    }

    // Check if we can call
    const canCall = legalActions.some((a) => a.kind === 'call');
    if (canCall) {
      return { action_id: createActionId(), kind: 'call' };
    }

    // If we can't check or call, we must fold (shouldn't happen normally)
    return { action_id: createActionId(), kind: 'fold' };
  }

  onHandComplete(handNumber: number, winnings: number): void {
    if (winnings > 0) {
      console.log(`[CallStation] Hand ${handNumber}: Won ${winnings}!`);
    }
  }

  onError(error: { code: string; message: string }): void {
    console.error(`[CallStation] Error: ${error.code} - ${error.message}`);
  }
}
