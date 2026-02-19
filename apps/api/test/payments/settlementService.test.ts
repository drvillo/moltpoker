/**
 * Unit tests for settlementService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockPaymentAdapter, mockDb, makeDeposit, makePayout, makeAgent } from './fixtures.js'

// Mock dependencies
vi.mock('../../src/payments/paymentService.js', () => ({
  getPaymentAdapter: vi.fn(),
}))

vi.mock('../../src/db.js', () => mockDb())

vi.mock('../../src/utils/crypto.js', () => ({
  generatePayoutId: vi.fn(() => 'pay_generated123'),
}))

describe('settlementService', () => {
  let settlementService: any
  let getPaymentAdapterMock: any
  let dbMock: any
  let adapter: ReturnType<typeof mockPaymentAdapter>

  beforeEach(async () => {
    vi.clearAllMocks()

    adapter = mockPaymentAdapter()

    const paymentServiceMod = await import('../../src/payments/paymentService.js')
    getPaymentAdapterMock = vi.mocked(paymentServiceMod.getPaymentAdapter)
    getPaymentAdapterMock.mockReturnValue(adapter)

    dbMock = await import('../../src/db.js')

    settlementService = await import('../../src/payments/settlementService.js')
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('executePayout', () => {
    it('happy path: creates payout, executes on-chain, updates to pending_confirmation', async () => {
      adapter.executePayout.mockResolvedValue({
        txHash: '0xabc123',
        eventName: 'TablePayoutSettled',
        eventIndex: 5,
        confirmationBlock: 100,
        batchId: undefined,
      })

      const result = await settlementService.executePayout({
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        finalStack: 1500,
        payoutAddress: '0x123',
      })

      expect(result).toEqual({ success: true, payoutId: 'pay_generated123' })

      expect(dbMock.createPayout).toHaveBeenCalledWith(
        'pay_generated123',
        'tbl_test',
        'agt_xyz',
        0,
        'payout',
        15.0, // 1500 chips / 100
        1500
      )

      expect(adapter.executePayout).toHaveBeenCalledWith({
        payoutId: 'pay_generated123',
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        amountUsdc: 15.0,
        payoutAddress: '0x123',
        finalStack: 1500,
      })

      expect(dbMock.updatePayoutStatus).toHaveBeenCalledWith(
        'pay_generated123',
        'pending_confirmation',
        '0xabc123',
        'TablePayoutSettled',
        5,
        100,
        undefined
      )
    })

    it('no adapter available: returns error', async () => {
      getPaymentAdapterMock.mockReturnValue(null)

      const result = await settlementService.executePayout({
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        finalStack: 1000,
        payoutAddress: '0x123',
      })

      expect(result).toEqual({ success: false, error: 'Payment adapter not available' })
      expect(dbMock.createPayout).not.toHaveBeenCalled()
    })

    it('adapter throws: marks payout as failed with error', async () => {
      adapter.executePayout.mockRejectedValue(new Error('Insufficient gas'))

      const result = await settlementService.executePayout({
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        finalStack: 1000,
        payoutAddress: '0x123',
      })

      expect(result).toEqual({
        success: false,
        payoutId: 'pay_generated123',
        error: 'Insufficient gas',
      })

      expect(dbMock.updatePayoutStatus).toHaveBeenCalledWith(
        'pay_generated123',
        'failed',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'Insufficient gas'
      )
    })

    it('chips-to-USDC conversion: 1000 chips = 10.0 USDC', async () => {
      adapter.executePayout.mockResolvedValue({
        txHash: '0x1',
        eventName: 'TablePayoutSettled',
        eventIndex: 0,
        confirmationBlock: 1,
      })

      await settlementService.executePayout({
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        finalStack: 1000,
        payoutAddress: '0x123',
      })

      expect(dbMock.createPayout).toHaveBeenCalledWith(
        'pay_generated123',
        'tbl_test',
        'agt_xyz',
        0,
        'payout',
        10.0,
        1000
      )
    })
  })

  describe('executeRefund', () => {
    it('happy path: creates refund record, executes, updates to pending_confirmation', async () => {
      adapter.executeRefund.mockResolvedValue({
        txHash: '0xrefund',
        eventName: 'TableRefundSettled',
        eventIndex: 2,
        confirmationBlock: 50,
      })

      const result = await settlementService.executeRefund({
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        depositAmount: 10.0,
        payoutAddress: '0x456',
        reason: 'table_cancelled',
      })

      expect(result).toEqual({ success: true, refundId: 'pay_generated123' })

      expect(dbMock.createPayout).toHaveBeenCalledWith(
        'pay_generated123',
        'tbl_test',
        'agt_xyz',
        0,
        'refund',
        10.0
      )

      expect(adapter.executeRefund).toHaveBeenCalledWith({
        refundId: 'pay_generated123',
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        amountUsdc: 10.0,
        payoutAddress: '0x456',
        reason: 'table_cancelled',
      })

      expect(dbMock.updatePayoutStatus).toHaveBeenCalledWith(
        'pay_generated123',
        'pending_confirmation',
        '0xrefund',
        'TableRefundSettled',
        2,
        50,
        undefined
      )
    })

    it('adapter throws: updates status to refund_pending_manual (not failed)', async () => {
      adapter.executeRefund.mockRejectedValue(new Error('Network timeout'))

      const result = await settlementService.executeRefund({
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        depositAmount: 10.0,
        payoutAddress: '0x456',
        reason: 'table_cancelled',
      })

      expect(result).toEqual({
        success: false,
        refundId: 'pay_generated123',
        error: 'Network timeout',
      })

      expect(dbMock.updatePayoutStatus).toHaveBeenCalledWith(
        'pay_generated123',
        'refund_pending_manual',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'Network timeout'
      )
    })

    it('no adapter: returns error', async () => {
      getPaymentAdapterMock.mockReturnValue(null)

      const result = await settlementService.executeRefund({
        tableId: 'tbl_test',
        agentId: 'agt_xyz',
        seatId: 0,
        depositAmount: 10.0,
        payoutAddress: '0x456',
        reason: 'table_cancelled',
      })

      expect(result).toEqual({ success: false, error: 'Payment adapter not available' })
    })
  })

  describe('executeTablePayouts', () => {
    it('batch of 3 payouts: 2 succeed, 1 fails', async () => {
      adapter.executePayout
        .mockResolvedValueOnce({ txHash: '0x1', eventName: 'TablePayoutSettled', eventIndex: 0, confirmationBlock: 1 })
        .mockRejectedValueOnce(new Error('Revert'))
        .mockResolvedValueOnce({ txHash: '0x3', eventName: 'TablePayoutSettled', eventIndex: 1, confirmationBlock: 1 })

      const payouts = [
        { tableId: 'tbl_test', agentId: 'agt1', seatId: 0, finalStack: 1000, payoutAddress: '0x1' },
        { tableId: 'tbl_test', agentId: 'agt2', seatId: 1, finalStack: 1500, payoutAddress: '0x2' },
        { tableId: 'tbl_test', agentId: 'agt3', seatId: 2, finalStack: 500, payoutAddress: '0x3' },
      ]

      const result = await settlementService.executeTablePayouts(payouts)

      expect(result.successful).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('agt2')
      expect(result.errors[0]).toContain('Revert')
    })

    it('empty array: returns zero counts', async () => {
      const result = await settlementService.executeTablePayouts([])

      expect(result).toEqual({ successful: 0, failed: 0, errors: [] })
    })
  })

  describe('refundAllAtTable', () => {
    it('two settled deposits: both refunded successfully', async () => {
      const deposits = [
        makeDeposit({ id: 'dep1', agent_id: 'agt1', seat_id: 0, status: 'settled', amount_usdc: 10.0 }),
        makeDeposit({ id: 'dep2', agent_id: 'agt2', seat_id: 1, status: 'settled', amount_usdc: 15.0 }),
      ]

      dbMock.getDepositsByTable.mockResolvedValue(deposits)
      dbMock.getAgentById
        .mockResolvedValueOnce(makeAgent({ id: 'agt1', payout_address: '0x1' }))
        .mockResolvedValueOnce(makeAgent({ id: 'agt2', payout_address: '0x2' }))

      adapter.executeRefund.mockResolvedValue({
        txHash: '0xrefund',
        eventName: 'TableRefundSettled',
        eventIndex: 0,
        confirmationBlock: 1,
      })

      const result = await settlementService.refundAllAtTable('tbl_test', 'admin_cancelled')

      expect(result.successful).toBe(2)
      expect(result.failed).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('deposit with status != settled is skipped', async () => {
      const deposits = [
        makeDeposit({ agent_id: 'agt1', status: 'pending' }),
        makeDeposit({ agent_id: 'agt2', status: 'settled' }),
      ]

      dbMock.getDepositsByTable.mockResolvedValue(deposits)
      dbMock.getAgentById.mockResolvedValue(makeAgent({ payout_address: '0x1' }))

      adapter.executeRefund.mockResolvedValue({
        txHash: '0x1',
        eventName: 'TableRefundSettled',
        eventIndex: 0,
        confirmationBlock: 1,
      })

      const result = await settlementService.refundAllAtTable('tbl_test', 'admin_cancelled')

      expect(result.successful).toBe(1)
      expect(adapter.executeRefund).toHaveBeenCalledTimes(1)
    })

    it('agent has no payout_address: skipped with error', async () => {
      const deposits = [makeDeposit({ agent_id: 'agt1', status: 'settled' })]

      dbMock.getDepositsByTable.mockResolvedValue(deposits)
      dbMock.getAgentById.mockResolvedValue(makeAgent({ payout_address: null }))

      const result = await settlementService.refundAllAtTable('tbl_test', 'admin_cancelled')

      expect(result.successful).toBe(0)
      expect(result.failed).toBe(1)
      expect(result.errors[0]).toContain('No payout address for agent')
    })

    it('one refund fails: partial success', async () => {
      const deposits = [
        makeDeposit({ agent_id: 'agt1', status: 'settled' }),
        makeDeposit({ agent_id: 'agt2', status: 'settled' }),
      ]

      dbMock.getDepositsByTable.mockResolvedValue(deposits)
      dbMock.getAgentById.mockResolvedValue(makeAgent({ payout_address: '0x1' }))

      adapter.executeRefund
        .mockResolvedValueOnce({ txHash: '0x1', eventName: 'TableRefundSettled', eventIndex: 0, confirmationBlock: 1 })
        .mockRejectedValueOnce(new Error('Fail'))

      const result = await settlementService.refundAllAtTable('tbl_test', 'admin_cancelled')

      expect(result.successful).toBe(1)
      expect(result.failed).toBe(1)
    })
  })

  describe('autoRefundInvalidDeposit', () => {
    it('deposit with status invalid_amount: executes refund, updates deposit to refunded', async () => {
      const deposit = makeDeposit({ id: 'dep_invalid', status: 'invalid_amount', amount_usdc: 5.0 })

      dbMock.getDeposit.mockResolvedValue(deposit)
      dbMock.getAgentById.mockResolvedValue(makeAgent({ payout_address: '0x1' }))

      adapter.executeRefund.mockResolvedValue({
        txHash: '0xrefund',
        eventName: 'TableRefundSettled',
        eventIndex: 0,
        confirmationBlock: 1,
      })

      const result = await settlementService.autoRefundInvalidDeposit('dep_invalid')

      expect(result).toBe(true)
      expect(adapter.executeRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          amountUsdc: 5.0,
          reason: 'invalid_amount',
        })
      )
      expect(dbMock.updateDepositStatus).toHaveBeenCalledWith('dep_invalid', 'refunded')
    })

    it('deposit not found: returns false', async () => {
      dbMock.getDeposit.mockResolvedValue(null)

      const result = await settlementService.autoRefundInvalidDeposit('dep_nonexistent')

      expect(result).toBe(false)
      expect(adapter.executeRefund).not.toHaveBeenCalled()
    })

    it('deposit with wrong status: returns false', async () => {
      const deposit = makeDeposit({ status: 'settled' })

      dbMock.getDeposit.mockResolvedValue(deposit)

      const result = await settlementService.autoRefundInvalidDeposit('dep_wrong_status')

      expect(result).toBe(false)
    })

    it('agent has no payout address: returns false', async () => {
      const deposit = makeDeposit({ status: 'invalid_amount' })

      dbMock.getDeposit.mockResolvedValue(deposit)
      dbMock.getAgentById.mockResolvedValue(makeAgent({ payout_address: null }))

      const result = await settlementService.autoRefundInvalidDeposit('dep_invalid')

      expect(result).toBe(false)
    })

    it('refund execution fails: returns false, deposit status unchanged', async () => {
      const deposit = makeDeposit({ status: 'invalid_amount' })

      dbMock.getDeposit.mockResolvedValue(deposit)
      dbMock.getAgentById.mockResolvedValue(makeAgent({ payout_address: '0x1' }))

      adapter.executeRefund.mockRejectedValue(new Error('Network error'))

      const result = await settlementService.autoRefundInvalidDeposit('dep_invalid')

      expect(result).toBe(false)
      expect(dbMock.updateDepositStatus).not.toHaveBeenCalled()
    })
  })

  describe('autoRefundExpiredDeposit', () => {
    it('deposit status expired_late with vault_tx_hash: refund + update to refunded', async () => {
      const deposit = makeDeposit({
        id: 'dep_expired',
        status: 'expired_late',
        vault_tx_hash: '0xoldtx',
        amount_usdc: 10.0,
      })

      dbMock.getDeposit.mockResolvedValue(deposit)
      dbMock.getAgentById.mockResolvedValue(makeAgent({ payout_address: '0x1' }))

      adapter.executeRefund.mockResolvedValue({
        txHash: '0xrefund',
        eventName: 'TableRefundSettled',
        eventIndex: 0,
        confirmationBlock: 1,
      })

      const result = await settlementService.autoRefundExpiredDeposit('dep_expired')

      expect(result).toBe(true)
      expect(adapter.executeRefund).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'expired_late' })
      )
      expect(dbMock.updateDepositStatus).toHaveBeenCalledWith('dep_expired', 'refunded')
    })

    it('no vault_tx_hash (never arrived on-chain): returns false, no refund', async () => {
      const deposit = makeDeposit({ status: 'expired_late', vault_tx_hash: null })

      dbMock.getDeposit.mockResolvedValue(deposit)

      const result = await settlementService.autoRefundExpiredDeposit('dep_expired')

      expect(result).toBe(false)
      expect(adapter.executeRefund).not.toHaveBeenCalled()
    })

    it('wrong status: returns false', async () => {
      const deposit = makeDeposit({ status: 'settled' })

      dbMock.getDeposit.mockResolvedValue(deposit)

      const result = await settlementService.autoRefundExpiredDeposit('dep_settled')

      expect(result).toBe(false)
    })

    it('agent has no payout address: returns false', async () => {
      const deposit = makeDeposit({ status: 'expired_late', vault_tx_hash: '0x1' })

      dbMock.getDeposit.mockResolvedValue(deposit)
      dbMock.getAgentById.mockResolvedValue(makeAgent({ payout_address: null }))

      const result = await settlementService.autoRefundExpiredDeposit('dep_expired')

      expect(result).toBe(false)
    })
  })
})
