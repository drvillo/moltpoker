import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../src/db.js', () => ({
  getTable: vi.fn(),
  getSeatByAgentId: vi.fn(),
  clearSeat: vi.fn(),
  deleteSessionsByAgent: vi.fn(),
  getSeats: vi.fn(),
  listTablesPaginated: vi.fn(),
  findWaitingTableInBucket: vi.fn(),
  getEvents: vi.fn(),
  findAvailableSeat: vi.fn(),
  assignSeat: vi.fn(),
  createSession: vi.fn(),
}))

vi.mock('../../src/config.js', () => ({
  config: {
    wsUrl: 'ws://localhost:3000',
    skillDocUrl: 'http://localhost:9000/skill.md',
    realMoneyEnabled: false,
  },
}))

vi.mock('../../src/auth/apiKey.js', () => ({
  apiKeyAuth: vi.fn((request, _reply, done) => {
    request.agentId = 'agt_test'
    request.agent = { name: 'TestAgent' }
    done()
  }),
}))

vi.mock('../../src/auth/sessionToken.js', () => ({
  generateSessionToken: vi.fn(() => 'token_test'),
}))

vi.mock('../../src/utils/crypto.js', () => ({
  generateSessionId: vi.fn(() => 'sess_test'),
}))

vi.mock('../../src/table/manager.js', () => ({
  tableManager: {
    get: vi.fn(() => null),
    has: vi.fn(() => false),
  },
}))

vi.mock('../../src/table/startTable.js', () => ({
  startTableRuntime: vi.fn(),
}))

vi.mock('../../src/ws/broadcastManager.js', () => ({
  broadcastManager: {
    broadcastPlayerLeft: vi.fn(),
    broadcastPlayerJoined: vi.fn(),
  },
}))

vi.mock('../../src/payments/paymentService.js', () => ({
  createDepositForTable: vi.fn(),
  checkPaymentSystemHealth: vi.fn(),
}))

describe('POST /v1/tables/:tableId/leave ended-table behavior', () => {
  let app: any
  let dbMock: any

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify()
    dbMock = await import('../../src/db.js')
    const { registerTableRoutes } = await import('../../src/routes/tables.js')
    registerTableRoutes(app)
  })

  it('returns success no-op when table is ended and does not clear seat', async () => {
    dbMock.getTable.mockResolvedValue({
      id: 'tbl_ended',
      status: 'ended',
      config: {},
      created_at: new Date().toISOString(),
    })
    dbMock.getSeatByAgentId.mockResolvedValue({
      table_id: 'tbl_ended',
      seat_id: 1,
      agent_id: 'agt_test',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/tables/tbl_ended/leave',
      payload: {},
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      success: true,
      message: 'Table already ended; leave is a no-op',
    })
    expect(dbMock.clearSeat).not.toHaveBeenCalled()
    expect(dbMock.deleteSessionsByAgent).not.toHaveBeenCalled()
  })

  it('keeps existing behavior for non-ended tables', async () => {
    dbMock.getTable.mockResolvedValue({
      id: 'tbl_running',
      status: 'running',
      config: {},
      created_at: new Date().toISOString(),
    })
    dbMock.getSeatByAgentId.mockResolvedValue({
      table_id: 'tbl_running',
      seat_id: 2,
      agent_id: 'agt_test',
    })
    dbMock.clearSeat.mockResolvedValue(undefined)
    dbMock.deleteSessionsByAgent.mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/tables/tbl_running/leave',
      payload: {},
    })

    expect(response.statusCode).toBe(200)
    expect(dbMock.clearSeat).toHaveBeenCalledWith('tbl_running', 2)
    expect(dbMock.deleteSessionsByAgent).toHaveBeenCalledWith('agt_test', 'tbl_running')
  })
})
