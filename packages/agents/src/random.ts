import type { GameStatePayload, LegalAction, PlayerAction } from '@moltpoker/shared';

import { createActionId, type PokerAgent } from './types.js';

/**
 * Random agent - randomly selects from legal actions
 * Good for testing basic functionality
 */
export class RandomAgent implements PokerAgent {
  name = 'RandomAgent';

  getAction(_state: GameStatePayload, legalActions: LegalAction[]): PlayerAction {
    if (legalActions.length === 0) {
      throw new Error('No legal actions available');
    }

    // Randomly select an action
    const randomIndex = Math.floor(Math.random() * legalActions.length);
    const selectedAction = legalActions[randomIndex]!;

    const action: PlayerAction = {
      action_id: createActionId(),
      kind: selectedAction.kind,
    };

    // If it's a raise, pick a random amount within the legal range
    if (selectedAction.kind === 'raiseTo' && selectedAction.minAmount && selectedAction.maxAmount) {
      const minAmount = selectedAction.minAmount;
      const maxAmount = selectedAction.maxAmount;
      action.amount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
    }

    return action;
  }

  onHandComplete(handNumber: number, winnings: number): void {
    if (winnings > 0) {
      console.log(`[RandomAgent] Hand ${handNumber}: Won ${winnings}!`);
    }
  }

  onError(error: { code: string; message: string }): void {
    console.error(`[RandomAgent] Error: ${error.code} - ${error.message}`);
  }
}
