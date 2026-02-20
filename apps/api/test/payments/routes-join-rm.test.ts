/**
 * Unit tests for real-money table join routes
 * Tests only RM-specific branching; general join logic tested elsewhere
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { ErrorCodes } from '@moltpoker/shared'
import { makeTableRow, makeSeatRow } from './fixtures.js'

// Mock all dependencies
vi.mock('../../src/db.js', () => ({
  getTable: vi.fn(),
  getSeats: vi.fn(),
  getSeatByAgentId: vi.fn(),
  findAvailableSeat: vi.fn(),
  assignSeat: vi.fn(),
  createSession: vi.fn(),
  findWaitingTableInBucket: vi.fn(),
  createTableWithBucket: vi.fn(),
  createSeats: vi.fn(),
}))

vi.mock('../../src/payments/paymentService.js', () => ({
  checkPaymentSystemHealth: vi.fn(),
  createDepositForTable: vi.fn(),
  initializePaymentAdapter: vi.fn(),
  getPaymentAdapter: vi.fn(),
}))

vi.mock('../../src/config.js', () => ({
  config: {
    realMoneyEnabled: true,
    wsUrl: 'ws://localhost:3000',
    skillDocUrl: 'https://docs.example.com',
  },
}))

vi.mock('../../src/auth/apiKey.js', () => ({
  apiKeyAuth: vi.fn((request, reply, done) => {
    request.agentId = 'agt_test'
    request.agent = { name: 'TestAgent' }
    done()
  }),
}))

vi.mock('../../src/utils/crypto.js', () => ({
  generateSessionId: vi.fn(() => 'sess_123'),
  generateTableId: vi.fn(() => 'tbl_generated'),
}))

vi.mock('../../src/auth/sessionToken.js', () => ({
  generateSessionToken: vi.fn(() => 'token_abc'),
}))

vi.mock('../../src/table/manager.js', () => ({
  tableManager: {
    has: vi.fn(() => false),
    get: vi.fn(() => null),
  },
}))

vi.mock('../../src/table/startTable.js', () => ({
  startTableRuntime: vi.fn(),
}))

describe('Real Money Join Routes', () => {
  let app: any
  let dbMock: any
  let paymentServiceMock: any
  let configMock: any

  beforeEach(async () => {
    vi.clearAllMocks()

    app = Fastify()

    dbMock = await import('../../src/db.js')
    paymentServiceMock = await import('../../src/payments/paymentService.js')
    configMock = await import('../../src/config.js')

    // Register routes
    const { registerTableRoutes } = await import('../../src/routes/tables.js')
    const { registerAutoJoinRoutes } = await import('../../src/routes/autoJoin.js')

    registerTableRoutes(app)
    registerAutoJoinRoutes(app)
  })

  describe('POST /v1/tables/:tableId/join - real money', () => {
    it('RM table + realMoneyEnabled = true + healthy payment system: includes deposit instructions', async () => {
      const rmTable = makeTableRow({ id: 'tbl_rm', config: { realMoney: true, initialStack: 1000 } })

      dbMock.getTable.mockResolvedValue(rmTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow({ seat_id: 0 }))
      dbMock.getSeats.mockResolvedValue([makeSeatRow()])

      paymentServiceMock.checkPaymentSystemHealth.mockResolvedValue(true)
      paymentServiceMock.createDepositForTable.mockResolvedValue({
        depositId: 'dep_123',
        instructions: {
          depositId: 'dep_123',
          vaultCall: { to: '0xVAULT', data: '0xabcd', value: '0' },
          chainId: 31337,
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tables/tbl_rm/join',
        payload: {},
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.deposit).toBeDefined()
      expect(body.deposit.depositId).toBe('dep_123')
      expect(paymentServiceMock.createDepositForTable).toHaveBeenCalledWith('tbl_rm', 'agt_test', 0, 10.0) // 1000 chips / 100
    })

    it('RM table + realMoneyEnabled = true + payment system unhealthy: returns 503', async () => {
      const rmTable = makeTableRow({ id: 'tbl_rm', config: { realMoney: true } })

      dbMock.getTable.mockResolvedValue(rmTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow())

      paymentServiceMock.checkPaymentSystemHealth.mockResolvedValue(false)

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tables/tbl_rm/join',
        payload: {},
      })

      expect(response.statusCode).toBe(503)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe(ErrorCodes.PAYMENT_SYSTEM_UNAVAILABLE)
      expect(paymentServiceMock.createDepositForTable).not.toHaveBeenCalled()
    })

    it('RM table + realMoneyEnabled = true + createDepositForTable returns null: no deposit field (graceful)', async () => {
      const rmTable = makeTableRow({ id: 'tbl_rm', config: { realMoney: true } })

      dbMock.getTable.mockResolvedValue(rmTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow())
      dbMock.getSeats.mockResolvedValue([makeSeatRow()])

      paymentServiceMock.checkPaymentSystemHealth.mockResolvedValue(true)
      paymentServiceMock.createDepositForTable.mockResolvedValue(null)

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tables/tbl_rm/join',
        payload: {},
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.deposit).toBeUndefined()
    })

    it('RM table + realMoneyEnabled = false: no deposit field, no payment calls', async () => {
      configMock.config.realMoneyEnabled = false

      const rmTable = makeTableRow({ id: 'tbl_rm', config: { realMoney: true } })

      dbMock.getTable.mockResolvedValue(rmTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow())
      dbMock.getSeats.mockResolvedValue([makeSeatRow()])

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tables/tbl_rm/join',
        payload: {},
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.deposit).toBeUndefined()
      expect(paymentServiceMock.checkPaymentSystemHealth).not.toHaveBeenCalled()
      expect(paymentServiceMock.createDepositForTable).not.toHaveBeenCalled()

      // Reset for other tests
      configMock.config.realMoneyEnabled = true
    })

    it('FTP table (realMoney: false) + realMoneyEnabled = true: no deposit field, no payment calls', async () => {
      const ftpTable = makeTableRow({ id: 'tbl_ftp', config: { realMoney: false } })

      dbMock.getTable.mockResolvedValue(ftpTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow())
      dbMock.getSeats.mockResolvedValue([makeSeatRow()])

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tables/tbl_ftp/join',
        payload: {},
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.deposit).toBeUndefined()
      expect(paymentServiceMock.checkPaymentSystemHealth).not.toHaveBeenCalled()
    })
  })

  describe('POST /v1/tables/auto-join - real money', () => {
    it('RM bucket table + healthy payment: deposit instructions in response', async () => {
      const rmTable = makeTableRow({ id: 'tbl_rm_bucket', config: { realMoney: true, initialStack: 1000 } })

      dbMock.findWaitingTableInBucket.mockResolvedValue(rmTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow())
      dbMock.getSeats.mockResolvedValue([makeSeatRow()])

      paymentServiceMock.checkPaymentSystemHealth.mockResolvedValue(true)
      paymentServiceMock.createDepositForTable.mockResolvedValue({
        depositId: 'dep_autojoin',
        instructions: {
          depositId: 'dep_autojoin',
          vaultCall: { to: '0xVAULT', data: '0xdata', value: '0' },
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tables/auto-join',
        payload: {},
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.deposit).toBeDefined()
      expect(body.deposit.depositId).toBe('dep_autojoin')
      expect(paymentServiceMock.createDepositForTable).toHaveBeenCalledWith('tbl_rm_bucket', 'agt_test', 0, 10.0)
    })

    it('RM bucket table + unhealthy payment: 503', async () => {
      const rmTable = makeTableRow({ id: 'tbl_rm_bucket', config: { realMoney: true } })

      dbMock.findWaitingTableInBucket.mockResolvedValue(rmTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow())

      paymentServiceMock.checkPaymentSystemHealth.mockResolvedValue(false)

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tables/auto-join',
        payload: {},
      })

      expect(response.statusCode).toBe(503)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe(ErrorCodes.PAYMENT_SYSTEM_UNAVAILABLE)
    })

    it('FTP bucket table: no deposit, no payment calls', async () => {
      const ftpTable = makeTableRow({ id: 'tbl_ftp_bucket', config: { realMoney: false } })

      dbMock.findWaitingTableInBucket.mockResolvedValue(ftpTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow())
      dbMock.getSeats.mockResolvedValue([makeSeatRow()])

      const response = await app.inject({
        method: 'POST',
        url: '/v1/tables/auto-join',
        payload: {},
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.deposit).toBeUndefined()
      expect(paymentServiceMock.checkPaymentSystemHealth).not.toHaveBeenCalled()
    })

    it('chip-to-USDC conversion check: initialStack = 1000 -> buyInUsdc = 10.0', async () => {
      const rmTable = makeTableRow({ id: 'tbl_test', config: { realMoney: true, initialStack: 1000 } })

      dbMock.findWaitingTableInBucket.mockResolvedValue(rmTable)
      dbMock.getSeatByAgentId.mockResolvedValue(null)
      dbMock.findAvailableSeat.mockResolvedValue(makeSeatRow())
      dbMock.getSeats.mockResolvedValue([makeSeatRow()])

      paymentServiceMock.checkPaymentSystemHealth.mockResolvedValue(true)
      paymentServiceMock.createDepositForTable.mockResolvedValue({
        depositId: 'dep_test',
        instructions: {},
      })

      await app.inject({
        method: 'POST',
        url: '/v1/tables/auto-join',
        payload: {},
      })

      expect(paymentServiceMock.createDepositForTable).toHaveBeenCalledWith(
        'tbl_test',
        'agt_test',
        0,
        10.0
      )
    })
  })
})
