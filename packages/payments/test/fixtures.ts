/**
 * Test fixtures for payments package
 */

import { vi } from 'vitest'
import type { PaymentAdapterConfig, DepositRequest, PayoutRequest, RefundRequest } from '../src/types.js'

/**
 * Create a valid PaymentAdapterConfig with Foundry chain defaults
 */
export function makeConfig(overrides: Partial<PaymentAdapterConfig> = {}): PaymentAdapterConfig {
  return {
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
    vaultAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    usdcAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    settlerPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    startBlock: 0,
    confirmationsRequired: 1,
    eventSyncIntervalMs: 5000,
    ...overrides,
  }
}

/**
 * Create a valid DepositRequest
 */
export function makeDepositRequest(overrides: Partial<DepositRequest> = {}): DepositRequest {
  return {
    depositId: 'dep_test123',
    tableId: 'tbl_abc',
    agentId: 'agt_xyz',
    seatId: 0,
    amountUsdc: 10.0,
    expiresAt: new Date(Date.now() + 300000),
    ...overrides,
  }
}

/**
 * Create a valid PayoutRequest
 */
export function makePayoutRequest(overrides: Partial<PayoutRequest> = {}): PayoutRequest {
  return {
    payoutId: 'pay_test456',
    tableId: 'tbl_abc',
    agentId: 'agt_xyz',
    seatId: 0,
    amountUsdc: 15.0,
    payoutAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    finalStack: 1500,
    ...overrides,
  }
}

/**
 * Create a valid RefundRequest
 */
export function makeRefundRequest(overrides: Partial<RefundRequest> = {}): RefundRequest {
  return {
    refundId: 'pay_refund789',
    tableId: 'tbl_abc',
    agentId: 'agt_xyz',
    seatId: 0,
    amountUsdc: 10.0,
    payoutAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    reason: 'table_cancelled',
    ...overrides,
  }
}

/**
 * Mock PublicClient with only the methods EvmVaultAdapter uses
 */
export function mockPublicClient() {
  return {
    simulateContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    watchContractEvent: vi.fn(),
    getBlockNumber: vi.fn(),
  }
}

/**
 * Mock WalletClient with only the methods EvmVaultAdapter uses
 */
export function mockWalletClient() {
  return {
    account: {
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    },
    writeContract: vi.fn(),
  }
}
