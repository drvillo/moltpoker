import type { GameStatePayload, LegalAction, PlayerAction } from '@moltpoker/shared';

import { createAction, type PokerAgent } from './types.js';
import { logAgentHandComplete, logAgentError } from '../lib/output.js';

/**
 * Call Station agent - always calls when facing a bet
 * - Never raises
 * - Never folds when call is an option
 * Good for testing bet/call dynamics
 */
export class CallStationAgent implements PokerAgent {
  name = 'CallStationAgent';

  getAction(state: GameStatePayload, legalActions: LegalAction[]): PlayerAction {
    if (legalActions.length === 0) {
      throw new Error('No legal actions available');
    }

    // Priority: check > call > fold
    // Never raise

    // Check if we can check
    const canCheck = legalActions.some((a) => a.kind === 'check');
    if (canCheck) {
      return createAction('check', state);
    }

    // Check if we can call
    const canCall = legalActions.some((a) => a.kind === 'call');
    if (canCall) {
      return createAction('call', state);
    }

    // If we can't check or call, we must fold (shouldn't happen normally)
    return createAction('fold', state);
  }

  onHandComplete(handNumber: number, winnings: number): void {
    logAgentHandComplete(this.name, handNumber, winnings);
  }

  onError(error: { code: string; message: string }): void {
    logAgentError(this.name, error);
  }
}
