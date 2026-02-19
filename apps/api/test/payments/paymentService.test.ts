/**
 * Unit tests for paymentService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockPaymentAdapter } from './fixtures.js'

// Create stable mock instances in hoisted scope
const { createPaymentAdapterMock, dbMocks, configObj, generateDepositIdMock } = vi.hoisted(() => ({
  createPaymentAdapterMock: vi.fn(),
  dbMocks: {
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
  },
  configObj: {
    realMoneyEnabled: true,
    paymentAdapter: 'evm_vault',
    depositTimeoutMs: 300000,
  },
  generateDepositIdMock: vi.fn(() => 'dep_generated123'),
}))

// Mock dependencies using hoisted instances
vi.mock('@moltpoker/payments', () => ({
  createPaymentAdapter: createPaymentAdapterMock,
}))

vi.mock('../../src/db.js', () => dbMocks)

vi.mock('../../src/config.js', () => ({
  config: configObj,
}))

vi.mock('../../src/utils/crypto.js', () => ({
  generateDepositId: generateDepositIdMock,
}))

describe('paymentService', () => {
  let paymentService: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Reset config to defaults
    configObj.realMoneyEnabled = true
    configObj.paymentAdapter = 'evm_vault'
    configObj.depositTimeoutMs = 300000
    
    // Reset module cache and re-import SUT to get fresh singleton
    vi.resetModules()
    paymentService = await import('../../src/payments/paymentService.js')
  })

  describe('initializePaymentAdapter', () => {
    it('returns null when realMoneyEnabled is false', () => {
      configObj.realMoneyEnabled = false

      const result = paymentService.initializePaymentAdapter()

      expect(result).toBeNull()
      expect(createPaymentAdapterMock).not.toHaveBeenCalled()
    })

    it('creates and returns adapter when realMoneyEnabled is true', () => {
      const adapter = mockPaymentAdapter()
      createPaymentAdapterMock.mockReturnValue(adapter)

      const result = paymentService.initializePaymentAdapter()

      expect(result).toBe(adapter)
      expect(createPaymentAdapterMock).toHaveBeenCalledWith('evm_vault')
    })

    it('returns cached adapter on second call (singleton)', () => {
      const adapter = mockPaymentAdapter()
      createPaymentAdapterMock.mockReturnValue(adapter)

      const result1 = paymentService.initializePaymentAdapter()
      const result2 = paymentService.initializePaymentAdapter()

      expect(result1).toBe(adapter)
      expect(result2).toBe(adapter)
      expect(createPaymentAdapterMock).toHaveBeenCalledTimes(1)
    })

    it('returns null and logs error when factory throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      createPaymentAdapterMock.mockImplementation(() => {
        throw new Error('Invalid config')
      })

      const result = paymentService.initializePaymentAdapter()

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to initialize payment adapter:',
        expect.any(Error)
      )
    })
  })

  describe('createDepositForTable', () => {
    it('happy path: creates DB deposit and returns instructions', async () => {
      const adapter = mockPaymentAdapter()
      adapter.createDepositInstructions.mockResolvedValue({
        depositId: 'dep_generated123',
        status: 'pending',
        amountUsdc: 10.0,
        chainId: 31337,
        chainName: 'Foundry',
        tokenAddress: '0xUSDC',
        vaultAddress: '0xVAULT',
        vaultCall: { to: '0xVAULT', data: '0xabcd', value: '0' },
        expiresAt: new Date().toISOString(),
      })

      createPaymentAdapterMock.mockReturnValue(adapter)
      paymentService.initializePaymentAdapter()

      const result = await paymentService.createDepositForTable(
        'tbl_test',
        'agt_xyz',
        0,
        10.0
      )

      expect(result).toEqual({
        depositId: 'dep_generated123',
        instructions: expect.objectContaining({
          depositId: 'dep_generated123',
          chainId: 31337,
        }),
      })

      expect(dbMocks.createDeposit).toHaveBeenCalledWith(
        'dep_generated123',
        'tbl_test',
        'agt_xyz',
        0,
        0, // actual amount (not yet confirmed)
        10.0, // expected amount
        31337,
        '0xUSDC',
        '0xVAULT',
        expect.any(Date)
      )
    })

    it('returns null when no adapter is available', async () => {
      configObj.realMoneyEnabled = false

      const result = await paymentService.createDepositForTable(
        'tbl_test',
        'agt_xyz',
        0,
        10.0
      )

      expect(result).toBeNull()
      expect(dbMocks.createDeposit).not.toHaveBeenCalled()
    })

    it('propagates adapter errors after DB record is created', async () => {
      const adapter = mockPaymentAdapter()
      adapter.createDepositInstructions.mockRejectedValue(new Error('Network error'))

      createPaymentAdapterMock.mockReturnValue(adapter)
      paymentService.initializePaymentAdapter()

      await expect(
        paymentService.createDepositForTable('tbl_test', 'agt_xyz', 0, 10.0)
      ).rejects.toThrow('Network error')
    })
  })

  describe('checkPaymentSystemHealth', () => {
    it('returns true when adapter healthCheck succeeds', async () => {
      const adapter = mockPaymentAdapter()
      adapter.healthCheck.mockResolvedValue(true)

      createPaymentAdapterMock.mockReturnValue(adapter)
      paymentService.initializePaymentAdapter()

      const result = await paymentService.checkPaymentSystemHealth()

      expect(result).toBe(true)
      expect(adapter.healthCheck).toHaveBeenCalled()
    })

    it('returns false when adapter healthCheck returns false', async () => {
      const adapter = mockPaymentAdapter()
      adapter.healthCheck.mockResolvedValue(false)

      createPaymentAdapterMock.mockReturnValue(adapter)
      paymentService.initializePaymentAdapter()

      const result = await paymentService.checkPaymentSystemHealth()

      expect(result).toBe(false)
    })

    it('returns false when adapter throws', async () => {
      const adapter = mockPaymentAdapter()
      adapter.healthCheck.mockRejectedValue(new Error('RPC timeout'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      createPaymentAdapterMock.mockReturnValue(adapter)
      paymentService.initializePaymentAdapter()

      const result = await paymentService.checkPaymentSystemHealth()

      expect(result).toBe(false)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Payment system health check failed:',
        expect.any(Error)
      )
    })

    it('returns false when no adapter is available', async () => {
      configObj.realMoneyEnabled = false

      const result = await paymentService.checkPaymentSystemHealth()

      expect(result).toBe(false)
    })
  })
})
