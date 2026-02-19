/**
 * Unit tests for eventListener service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockPaymentAdapter, makeDeposit, makePayout } from './fixtures.js'

// Create stable mock instances in hoisted scope
const { getPaymentAdapterMock, dbMocks, configObj } = vi.hoisted(() => ({
  getPaymentAdapterMock: vi.fn(),
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
    paymentEventSyncIntervalMs: 5000,
  },
}))

// Mock dependencies using hoisted instances
vi.mock('../../src/payments/paymentService.js', () => ({
  getPaymentAdapter: getPaymentAdapterMock,
}))

vi.mock('../../src/db.js', () => dbMocks)

vi.mock('../../src/config.js', () => ({
  config: configObj,
}))

describe('eventListener', () => {
  let eventListener: any
  let adapter: ReturnType<typeof mockPaymentAdapter>
  let mockLog: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Create fresh adapter instance
    adapter = mockPaymentAdapter()
    getPaymentAdapterMock.mockReturnValue(adapter)

    // Reset config to defaults
    configObj.realMoneyEnabled = true
    configObj.paymentEventSyncIntervalMs = 5000

    mockLog = {
      info: vi.fn(),
      error: vi.fn(),
    }

    // Reset module cache and re-import SUT
    vi.resetModules()
    eventListener = await import('../../src/payments/eventListener.js')
  })

  afterEach(() => {
    eventListener.stopEventListener()
    vi.useRealTimers()
  })

  describe('startEventListener', () => {
    it('realMoneyEnabled = false: returns immediately, no subscriptions', () => {
      configObj.realMoneyEnabled = false

      eventListener.startEventListener(mockLog)

      expect(adapter.subscribeToDepositEvents).not.toHaveBeenCalled()
      expect(adapter.subscribeToSettlementEvents).not.toHaveBeenCalled()
    })

    it('no adapter: logs error and returns', () => {
      getPaymentAdapterMock.mockReturnValue(null)

      eventListener.startEventListener(mockLog)

      expect(mockLog.error).toHaveBeenCalledWith('Cannot start event listener: payment adapter not initialized')
      expect(adapter.subscribeToDepositEvents).not.toHaveBeenCalled()
    })

    it('happy path: subscribes to deposit events and settlement events, starts interval', () => {
      const unsubDeposits = vi.fn()
      const unsubSettlements = vi.fn()

      adapter.subscribeToDepositEvents.mockReturnValue(unsubDeposits)
      adapter.subscribeToSettlementEvents.mockReturnValue(unsubSettlements)

      const teardown = eventListener.startEventListener(mockLog)

      expect(adapter.subscribeToDepositEvents).toHaveBeenCalled()
      expect(adapter.subscribeToSettlementEvents).toHaveBeenCalled()
      expect(mockLog.info).toHaveBeenCalledWith('Event listener started (polling every 5000ms)')

      // Teardown should call both unsubscribe functions
      teardown()
      expect(unsubDeposits).toHaveBeenCalled()
      expect(unsubSettlements).toHaveBeenCalled()
    })
  })

  describe('deposit event processing', () => {
    it('known deposit, correct amount: updates status to settled', async () => {
      const deposit = makeDeposit({ id: 'dep1', expected_amount_usdc: 10.0 })

      dbMocks.getDeposit.mockResolvedValue(deposit)

      adapter.subscribeToDepositEvents.mockImplementation((opts, callback) => {
        // Simulate event
        callback({
          depositId: 'dep1',
          actualAmount: 10.0,
          txHash: '0x123',
          eventName: 'DepositReceived',
          eventIndex: 5,
          confirmationBlock: 100,
        })
        return vi.fn()
      })

      eventListener.startEventListener(mockLog)

      await vi.waitFor(() => {
        expect(dbMocks.updateDepositStatus).toHaveBeenCalledWith(
          'dep1',
          'settled',
          '0x123',
          'DepositReceived',
          5,
          100,
          10.0
        )
      })

      expect(mockLog.info).toHaveBeenCalledWith('Deposit dep1 confirmed: 10 USDC')
    })

    it('known deposit, wrong amount: updates status to invalid_amount', async () => {
      const deposit = makeDeposit({ id: 'dep2', expected_amount_usdc: 10.0 })

      dbMocks.getDeposit.mockResolvedValue(deposit)

      adapter.subscribeToDepositEvents.mockImplementation((opts, callback) => {
        callback({
          depositId: 'dep2',
          actualAmount: 8.0, // Wrong amount
          txHash: '0x456',
          eventName: 'DepositReceived',
          eventIndex: 2,
          confirmationBlock: 50,
        })
        return vi.fn()
      })

      eventListener.startEventListener(mockLog)

      await vi.waitFor(() => {
        expect(dbMocks.updateDepositStatus).toHaveBeenCalledWith(
          'dep2',
          'invalid_amount',
          '0x456',
          'DepositReceived',
          2,
          50,
          8.0
        )
      })

      expect(mockLog.info).toHaveBeenCalledWith('Deposit dep2 marked as invalid_amount: expected 10, got 8')
    })

    it('unknown depositId: logs info, no DB update', async () => {
      dbMocks.getDeposit.mockResolvedValue(null)

      adapter.subscribeToDepositEvents.mockImplementation((opts, callback) => {
        callback({
          depositId: 'dep_unknown',
          actualAmount: 10.0,
          txHash: '0x789',
          eventName: 'DepositReceived',
          eventIndex: 0,
          confirmationBlock: 1,
        })
        return vi.fn()
      })

      eventListener.startEventListener(mockLog)

      await vi.waitFor(() => {
        expect(mockLog.info).toHaveBeenCalledWith('Received deposit event for unknown deposit: dep_unknown')
      })

      expect(dbMocks.updateDepositStatus).not.toHaveBeenCalled()
    })

    it('DB error in handler: logs error, does not crash listener', async () => {
      dbMocks.getDeposit.mockRejectedValue(new Error('DB connection lost'))

      adapter.subscribeToDepositEvents.mockImplementation((opts, callback) => {
        callback({
          depositId: 'dep_error',
          actualAmount: 10.0,
          txHash: '0xabc',
          eventName: 'DepositReceived',
          eventIndex: 0,
          confirmationBlock: 1,
        })
        return vi.fn()
      })

      eventListener.startEventListener(mockLog)

      await vi.waitFor(() => {
        expect(mockLog.error).toHaveBeenCalledWith('Error processing deposit event:', expect.any(Error))
      })
    })
  })

  describe('settlement event processing', () => {
    it('pending payouts exist: updates each to completed', async () => {
      const payouts = [
        makePayout({ id: 'pay1', status: 'pending_confirmation', amount_usdc: 10.0, agent_id: 'agt1' }),
        makePayout({ id: 'pay2', status: 'pending_confirmation', amount_usdc: 15.0, agent_id: 'agt2' }),
      ]

      dbMocks.listPendingPayouts.mockResolvedValue(payouts)

      adapter.subscribeToSettlementEvents.mockImplementation((opts, callback) => {
        callback({
          txHash: '0xsettlement',
          eventName: 'TablePayoutSettled',
          eventIndex: 3,
          confirmationBlock: 200,
        })
        return vi.fn()
      })

      eventListener.startEventListener(mockLog)

      await vi.waitFor(() => {
        expect(dbMocks.updatePayoutStatus).toHaveBeenCalledTimes(2)
      })

      expect(dbMocks.updatePayoutStatus).toHaveBeenCalledWith(
        'pay1',
        'completed',
        '0xsettlement',
        'TablePayoutSettled',
        3,
        200,
        undefined
      )
    })

    it('no pending payouts: no DB updates', async () => {
      dbMocks.listPendingPayouts.mockResolvedValue([])

      adapter.subscribeToSettlementEvents.mockImplementation((opts, callback) => {
        callback({
          txHash: '0x1',
          eventName: 'TableRefundSettled',
          eventIndex: 0,
          confirmationBlock: 1,
        })
        return vi.fn()
      })

      eventListener.startEventListener(mockLog)

      await vi.waitFor(() => {
        expect(dbMocks.listPendingPayouts).toHaveBeenCalled()
      })

      expect(dbMocks.updatePayoutStatus).not.toHaveBeenCalled()
    })

    it('DB error: logs error, does not crash', async () => {
      dbMocks.listPendingPayouts.mockRejectedValue(new Error('DB error'))

      adapter.subscribeToSettlementEvents.mockImplementation((opts, callback) => {
        callback({
          txHash: '0x1',
          eventName: 'TablePayoutSettled',
          eventIndex: 0,
          confirmationBlock: 1,
        })
        return vi.fn()
      })

      eventListener.startEventListener(mockLog)

      await vi.waitFor(() => {
        expect(mockLog.error).toHaveBeenCalledWith('Error processing settlement event:', expect.any(Error))
      })
    })
  })

  describe('reconcilePendingConfirmations', () => {
    it('pending_confirmation deposit with confirmation available: updated to settled', async () => {
      const deposit = makeDeposit({ id: 'dep_pending', status: 'pending_confirmation', expected_amount_usdc: 10.0 })

      dbMocks.listPendingConfirmationDeposits.mockResolvedValue([deposit])
      adapter.getDepositConfirmation.mockResolvedValue({
        depositId: 'dep_pending',
        actualAmount: 10.0,
        txHash: '0xconfirmed',
        eventName: 'DepositReceived',
        eventIndex: 1,
        confirmationBlock: 50,
      })

      adapter.subscribeToDepositEvents.mockReturnValue(vi.fn())
      adapter.subscribeToSettlementEvents.mockReturnValue(vi.fn())

      eventListener.startEventListener(mockLog)

      // Advance timer to trigger reconciliation
      await vi.advanceTimersByTimeAsync(5000)

      expect(dbMocks.updateDepositStatus).toHaveBeenCalledWith(
        'dep_pending',
        'settled',
        '0xconfirmed',
        'DepositReceived',
        1,
        50,
        10.0
      )
      expect(mockLog.info).toHaveBeenCalledWith('Deposit dep_pending reconciled as settled')
    })

    it('pending_confirmation deposit with wrong amount: updated to invalid_amount', async () => {
      const deposit = makeDeposit({ id: 'dep_wrong', status: 'pending_confirmation', expected_amount_usdc: 10.0 })

      dbMocks.listPendingConfirmationDeposits.mockResolvedValue([deposit])
      adapter.getDepositConfirmation.mockResolvedValue({
        depositId: 'dep_wrong',
        actualAmount: 9.0, // Wrong amount
        txHash: '0xwrong',
        eventName: 'DepositReceived',
        eventIndex: 2,
        confirmationBlock: 60,
      })

      adapter.subscribeToDepositEvents.mockReturnValue(vi.fn())
      adapter.subscribeToSettlementEvents.mockReturnValue(vi.fn())

      eventListener.startEventListener(mockLog)

      await vi.advanceTimersByTimeAsync(5000)

      expect(dbMocks.updateDepositStatus).toHaveBeenCalledWith(
        'dep_wrong',
        'invalid_amount',
        '0xwrong',
        'DepositReceived',
        2,
        60,
        9.0
      )
      expect(mockLog.info).toHaveBeenCalledWith('Deposit dep_wrong reconciled as invalid_amount')
    })

    it('no confirmation yet: left as pending_confirmation', async () => {
      const deposit = makeDeposit({ id: 'dep_noconf', status: 'pending_confirmation' })

      dbMocks.listPendingConfirmationDeposits.mockResolvedValue([deposit])
      adapter.getDepositConfirmation.mockResolvedValue(null)

      adapter.subscribeToDepositEvents.mockReturnValue(vi.fn())
      adapter.subscribeToSettlementEvents.mockReturnValue(vi.fn())

      eventListener.startEventListener(mockLog)

      await vi.advanceTimersByTimeAsync(5000)

      expect(dbMocks.updateDepositStatus).not.toHaveBeenCalled()
    })
  })

  describe('handleExpiredDeposits', () => {
    it('expired pending deposit: marked expired_late', async () => {
      const expiredDeposit = makeDeposit({ id: 'dep_expired', status: 'pending' })

      dbMocks.listExpiredDeposits.mockResolvedValue([expiredDeposit])
      dbMocks.listPendingConfirmationDeposits.mockResolvedValue([])
      dbMocks.listPendingConfirmationPayouts.mockResolvedValue([])

      adapter.subscribeToDepositEvents.mockReturnValue(vi.fn())
      adapter.subscribeToSettlementEvents.mockReturnValue(vi.fn())

      eventListener.startEventListener(mockLog)

      await vi.advanceTimersByTimeAsync(5000)

      expect(dbMocks.updateDepositStatus).toHaveBeenCalledWith('dep_expired', 'expired_late')
      expect(mockLog.info).toHaveBeenCalledWith('Deposit dep_expired marked as expired_late')
    })

    it('error handling: logs error, continues processing', async () => {
      const expiredDeposit = makeDeposit({ id: 'dep_error' })

      dbMocks.listExpiredDeposits.mockResolvedValue([expiredDeposit])
      dbMocks.listPendingConfirmationDeposits.mockResolvedValue([])
      dbMocks.listPendingConfirmationPayouts.mockResolvedValue([])
      dbMocks.updateDepositStatus.mockRejectedValue(new Error('DB error'))

      adapter.subscribeToDepositEvents.mockReturnValue(vi.fn())
      adapter.subscribeToSettlementEvents.mockReturnValue(vi.fn())

      eventListener.startEventListener(mockLog)

      await vi.advanceTimersByTimeAsync(5000)

      expect(mockLog.error).toHaveBeenCalledWith('Error handling expired deposit dep_error:', expect.any(Error))
    })
  })

  describe('stopEventListener', () => {
    it('clears interval, subsequent ticks do not trigger reconciliation', async () => {
      dbMocks.listPendingConfirmationDeposits.mockResolvedValue([])
      dbMocks.listExpiredDeposits.mockResolvedValue([])

      adapter.subscribeToDepositEvents.mockReturnValue(vi.fn())
      adapter.subscribeToSettlementEvents.mockReturnValue(vi.fn())

      eventListener.startEventListener(mockLog)

      // Advance once to trigger first interval
      await vi.advanceTimersByTimeAsync(5000)
      expect(dbMocks.listPendingConfirmationDeposits).toHaveBeenCalledTimes(1)

      // Stop listener
      eventListener.stopEventListener()

      // Advance timer again
      await vi.advanceTimersByTimeAsync(5000)

      // Should not call reconciliation again
      expect(dbMocks.listPendingConfirmationDeposits).toHaveBeenCalledTimes(1)
    })
  })
})
