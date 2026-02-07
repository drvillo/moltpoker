import type { GameStatePayload, LegalAction, PlayerAction } from '@moltpoker/shared';

/**
 * Base interface for poker agents
 */
export interface PokerAgent {
  /** Agent name */
  name: string;

  /** Called when the agent receives a game state and needs to act.
   *  May return a Promise for async agents (e.g. LLM-backed).
   *  @param previousError - If provided, the reason the previous action was rejected (for retry). */
  getAction(state: GameStatePayload, legalActions: LegalAction[], previousError?: string): PlayerAction | Promise<PlayerAction>;

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
