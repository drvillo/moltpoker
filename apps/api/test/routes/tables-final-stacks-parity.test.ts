import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../src/db.js', () => ({
  listTablesPaginated: vi.fn(),
  findWaitingTableInBucket: vi.fn(),
  getSeats: vi.fn(),
  getTable: vi.fn(),
  getEvents: vi.fn(),
}))

vi.mock('../../src/config.js', () => ({
  config: {
    wsUrl: 'ws://localhost:3000',
    skillDocUrl: 'http://localhost:9000/skill.md',
    realMoneyEnabled: false,
  },
}))

vi.mock('../../src/auth/apiKey.js', () => ({
  apiKeyAuth: vi.fn((_request, _reply, done) => done()),
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
    broadcastPlayerJoined: vi.fn(),
    broadcastPlayerLeft: vi.fn(),
  },
}))

vi.mock('../../src/payments/paymentService.js', () => ({
  createDepositForTable: vi.fn(),
  checkPaymentSystemHealth: vi.fn(),
}))

describe('ended-table parity: /v1/tables + /v1/tables/:id vs TABLE_ENDED finalStacks', () => {
  let app: any
  let dbMock: any

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify()
    dbMock = await import('../../src/db.js')
    const { registerTableRoutes } = await import('../../src/routes/tables.js')
    registerTableRoutes(app)
  })

  it.each([
    ['admin_stopped'],
    ['insufficient_players'],
  ])('keeps stack/player equivalence for reason=%s', async (reason) => {
    const tableId = `tbl_${reason}`
    const createdAt = new Date().toISOString()
    const tableRow = {
      id: tableId,
      status: 'ended',
      config: {
        blinds: { small: 10, big: 20 },
        maxSeats: 4,
        initialStack: 100,
        actionTimeoutMs: 10000,
        minPlayersToStart: 4,
      },
      created_at: createdAt,
      bucket_key: 'default',
    }

    const seatRows = [
      { seat_id: 0, agent_id: 'agt_0', stack: 80, is_active: true, agents: { name: 'A0' } },
      { seat_id: 1, agent_id: 'agt_1', stack: 120, is_active: true, agents: { name: 'A1' } },
      { seat_id: 2, agent_id: 'agt_2', stack: 60, is_active: true, agents: { name: 'A2' } },
      { seat_id: 3, agent_id: 'agt_3', stack: 140, is_active: true, agents: { name: 'A3' } },
    ]

    dbMock.listTablesPaginated.mockResolvedValue({ data: [tableRow], hasMore: false })
    dbMock.getTable.mockResolvedValue(tableRow)
    dbMock.getSeats.mockResolvedValue(seatRows)
    dbMock.getEvents.mockResolvedValue([
      {
        seq: 99,
        type: 'TABLE_ENDED',
        payload: {
          reason,
          finalStacks: seatRows.map((s) => ({
            seatId: s.seat_id,
            agentId: s.agent_id,
            stack: s.stack,
          })),
        },
        created_at: createdAt,
      },
    ])

    const [listResponse, detailResponse, eventsResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/tables?status=ended&limit=10&offset=0' }),
      app.inject({ method: 'GET', url: `/v1/tables/${tableId}` }),
      app.inject({ method: 'GET', url: `/v1/tables/${tableId}/events?limit=100` }),
    ])

    expect(listResponse.statusCode).toBe(200)
    expect(detailResponse.statusCode).toBe(200)
    expect(eventsResponse.statusCode).toBe(200)

    const listBody = JSON.parse(listResponse.body)
    const detailBody = JSON.parse(detailResponse.body)
    const eventsBody = JSON.parse(eventsResponse.body)

    const listSeats = listBody.tables[0].seats.map((s: any) => ({
      seatId: s.seatId,
      agentId: s.agentId,
      stack: s.stack,
    }))
    const detailSeats = detailBody.seats.map((s: any) => ({
      seatId: s.seatId,
      agentId: s.agentId,
      stack: s.stack,
    }))
    const endedStacks = eventsBody.events
      .find((e: any) => e.type === 'TABLE_ENDED')
      .payload.finalStacks
      .map((s: any) => ({
        seatId: s.seatId,
        agentId: s.agentId,
        stack: s.stack,
      }))

    expect(listSeats).toEqual(endedStacks)
    expect(detailSeats).toEqual(endedStacks)
  })
})
