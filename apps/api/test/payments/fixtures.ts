/**
 * Test fixtures for API payment tests
 */

import { vi } from 'vitest'
import { TableConfigSchema } from '@moltpoker/shared'
import type { PaymentAdapter } from '@moltpoker/payments'

/**
 * Mock PaymentAdapter with all interface methods
 */
export function mockPaymentAdapter(): PaymentAdapter {
  return {
    createDepositInstructions: vi.fn(),
    getDepositConfirmation: vi.fn(),
    executePayout: vi.fn(),
    executeRefund: vi.fn(),
    subscribeToDepositEvents: vi.fn(),
    subscribeToSettlementEvents: vi.fn(),
    getTableIdBytes32: vi.fn(),
    getAgentIdBytes32: vi.fn(),
    healthCheck: vi.fn(),
  }
}

/**
 * Mock db module with all methods used by payment services
 */
export function mockDb() {
  return {
    createDeposit: vi.fn(),
    getDeposit: vi.fn(),
    getDepositByTableAndAgent: vi.fn(),
    updateDepositStatus: vi.fn(),
    listExpiredDeposits: vi.fn(),
    listPendingConfirmationDeposits: vi.fn(),
    getDepositsByTable: vi.fn(),
    createPayout: vi.fn(),
    getPayout: vi.fn(),
    getPayoutsByTable: vi.fn(),
    updatePayoutStatus: vi.fn(),
    listPendingPayouts: vi.fn(),
    listPendingConfirmationPayouts: vi.fn(),
    getAgentById: vi.fn(),
    updateAgentPayoutAddress: vi.fn(),
    getTable: vi.fn(),
    createTable: vi.fn(),
    findWaitingTableInBucket: vi.fn(),
    createTableWithBucket: vi.fn(),
    createSeats: vi.fn(),
    getSeats: vi.fn(),
    getSeatByAgentId: vi.fn(),
    findAvailableSeat: vi.fn(),
    assignSeat: vi.fn(),
    clearSeat: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    deleteSessionsByAgent: vi.fn(),
  }
}

/**
 * Create a DB deposit row
 */
export function makeDeposit(overrides: Record<string, any> = {}) {
  return {
    id: 'dep_test123',
    table_id: 'tbl_abc',
    agent_id: 'agt_xyz',
    seat_id: 0,
    status: 'pending',
    amount_usdc: 10.0,
    expected_amount_usdc: 10.0,
    chain_id: 31337,
    token_address: '0xUSDC',
    vault_address: '0xVAULT',
    vault_tx_hash: null,
    vault_event_name: null,
    vault_event_index: null,
    confirmation_block: null,
    expires_at: new Date(Date.now() + 300000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create a DB payout row
 */
export function makePayout(overrides: Record<string, any> = {}) {
  return {
    id: 'pay_test456',
    table_id: 'tbl_abc',
    agent_id: 'agt_xyz',
    seat_id: 0,
    settlement_type: 'payout',
    status: 'pending',
    amount_usdc: 15.0,
    final_stack: 1500,
    vault_tx_hash: null,
    vault_event_name: null,
    vault_event_index: null,
    confirmation_block: null,
    settlement_batch_id: null,
    error_message: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create a DB agent row
 */
export function makeAgent(overrides: Record<string, any> = {}) {
  return {
    id: 'agt_xyz',
    name: 'TestAgent',
    api_key_hash: 'hash123',
    payout_address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    metadata: {},
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create a DB table row with config
 */
export function makeTableRow(overrides: Record<string, any> = {}) {
  const defaultConfig = TableConfigSchema.parse({
    realMoney: false,
    ...overrides.config,
  })

  return {
    id: 'tbl_test',
    status: 'waiting',
    config: defaultConfig,
    seed: null,
    bucket_key: 'default',
    created_at: new Date().toISOString(),
    ...overrides,
    config: {
      ...defaultConfig,
      ...overrides.config,
    },
  }
}

/**
 * Create a DB seat row
 */
export function makeSeatRow(overrides: Record<string, any> = {}) {
  return {
    table_id: 'tbl_test',
    seat_id: 0,
    agent_id: null,
    stack: 0,
    is_active: true,
    agents: null,
    ...overrides,
  }
}

/**
 * Create API config overrides for testing
 */
export function makeConfigOverrides(overrides: Record<string, any> = {}) {
  return {
    realMoneyEnabled: false,
    paymentAdapter: 'evm_vault',
    evmChainId: 31337,
    evmRpcUrl: 'http://127.0.0.1:8545',
    evmUsdcContract: '0xUSDC',
    evmVaultAddress: '0xVAULT',
    evmSettlerPrivateKey: '0xKEY',
    evmConfirmationsRequired: 1,
    evmEventSyncIntervalMs: 5000,
    depositTimeoutMs: 300000,
    ...overrides,
  }
}
