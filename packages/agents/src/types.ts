import type { GameStatePayload, LegalAction, PlayerAction } from '@moltpoker/shared';

/**
 * Base interface for poker agents
 */
export interface PokerAgent {
  /** Agent name */
  name: string;

  /** Called when the agent receives a game state and needs to act.
   *  May return a Promise for async agents (e.g. LLM-backed). */
  getAction(state: GameStatePayload, legalActions: LegalAction[]): PlayerAction | Promise<PlayerAction>;

  /** Called when a hand completes (optional) */
  onHandComplete?(handNumber: number, winnings: number): void;

  /** Called when an error occurs (optional) */
  onError?(error: { code: string; message: string }): void;
}

/**
 * Create a unique action ID
 */
export function createActionId(): string {
  return crypto.randomUUID();
}
