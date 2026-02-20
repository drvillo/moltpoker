/**
 * Payment domain types for MoltPoker
 */

export interface DepositRequest {
  depositId: string;
  tableId: string;
  agentId: string;
  seatId: number;
  amountUsdc: number;
  expiresAt: Date;
}

export interface DepositInstructions {
  depositId: string;
  status: string;
  amountUsdc: number;
  chainId: number;
  chainName: string;
  tokenAddress: string;
  vaultAddress: string;
  vaultCall: {
    to: string;
    data: string;
    value?: string;
  };
  expiresAt: string;
}

export interface DepositConfirmation {
  depositId: string;
  txHash: string;
  eventName: string;
  eventIndex: number;
  confirmationBlock: number;
  actualAmount: number;
}

export interface PayoutRequest {
  payoutId: string;
  tableId: string;
  agentId: string;
  seatId: number;
  amountUsdc: number;
  payoutAddress: string;
  finalStack?: number;
}

export interface RefundRequest {
  refundId: string;
  tableId: string;
  agentId: string;
  seatId: number;
  amountUsdc: number;
  payoutAddress: string;
  reason: string;
}

export interface SettlementResult {
  txHash: string;
  eventName: string;
  eventIndex: number;
  confirmationBlock: number;
  batchId?: string;
}

/**
 * EVM-specific adapter configuration
 */
export interface EvmVaultAdapterConfig {
  chainId: number;
  rpcUrl: string;
  vaultAddress: string;
  usdcAddress: string;
  settlerPrivateKey: string;
  startBlock?: number;
  confirmationsRequired: number;
  eventSyncIntervalMs: number;
}

/**
 * @deprecated Use EvmVaultAdapterConfig directly. Will be removed in future version.
 */
export type PaymentAdapterConfig = EvmVaultAdapterConfig;

/**
 * Discriminated union of all adapter configs
 */
export type AdapterConfig = {
  type: 'evm_vault';
  config: EvmVaultAdapterConfig;
};

/**
 * Partial config for adapter overrides
 */
export type AdapterConfigOverrides<T extends AdapterConfig = AdapterConfig> = 
  T extends { type: 'evm_vault' } 
    ? Partial<EvmVaultAdapterConfig> 
    : never;

export interface VaultEventFilter {
  fromBlock?: bigint;
  toBlock?: bigint;
  tableId?: string;
  agentId?: string;
}
