import type { GameStatePayload, LegalAction, PlayerAction } from '@moltpoker/shared';

import { createAction, type PokerAgent } from './types.js';
import { logAgentHandComplete, logAgentError } from './utils/output.js';

/**
 * Random agent - randomly selects from legal actions
 * Good for testing basic functionality
 */
export class RandomAgent implements PokerAgent {
  name = 'RandomAgent';

  getAction(state: GameStatePayload, legalActions: LegalAction[]): PlayerAction {
    if (legalActions.length === 0) {
      throw new Error('No legal actions available');
    }

    // Randomly select an action
    const randomIndex = Math.floor(Math.random() * legalActions.length);
    const selectedAction = legalActions[randomIndex]!;

    // If it's a raise, pick a random amount within the legal range
    let amount: number | undefined;
    if (selectedAction.kind === 'raiseTo' && selectedAction.minAmount && selectedAction.maxAmount) {
      const minAmount = selectedAction.minAmount;
      const maxAmount = selectedAction.maxAmount;
      amount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
    }

    return createAction(selectedAction.kind, state, amount);
  }

  onHandComplete(handNumber: number, winnings: number): void {
    logAgentHandComplete(this.name, handNumber, winnings);
  }

  onError(error: { code: string; message: string }): void {
    logAgentError(this.name, error);
  }
}
