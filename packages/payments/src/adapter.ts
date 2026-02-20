/**
 * PaymentAdapter interface - abstraction for different payment backends
 */

import type {
  DepositConfirmation,
  DepositInstructions,
  DepositRequest,
  PayoutRequest,
  RefundRequest,
  SettlementResult,
  VaultEventFilter,
} from './types.js';

export interface PaymentAdapter {
  /**
   * Create deposit instructions for a player to deposit funds
   */
  createDepositInstructions(request: DepositRequest): Promise<DepositInstructions>;

  /**
   * Check if a deposit has been confirmed on-chain
   */
  getDepositConfirmation(depositId: string): Promise<DepositConfirmation | null>;

  /**
   * Execute a payout settlement on-chain
   */
  executePayout(request: PayoutRequest): Promise<SettlementResult>;

  /**
   * Execute a refund settlement on-chain
   */
  executeRefund(request: RefundRequest): Promise<SettlementResult>;

  /**
   * Subscribe to deposit events
   */
  subscribeToDepositEvents(
    filter: VaultEventFilter,
    callback: (confirmation: DepositConfirmation) => void
  ): () => void;

  /**
   * Subscribe to settlement events (payouts and refunds)
   */
  subscribeToSettlementEvents(
    filter: VaultEventFilter,
    callback: (result: SettlementResult) => void
  ): () => void;

  /**
   * Get the canonical bytes32 identifier for a table
   */
  getTableIdBytes32(tableId: string): `0x${string}`;

  /**
   * Get the canonical bytes32 identifier for an agent
   */
  getAgentIdBytes32(agentId: string): `0x${string}`;

  /**
   * Health check - returns true if the adapter can communicate with the blockchain
   */
  healthCheck(): Promise<boolean>;
}
