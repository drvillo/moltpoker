import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../src/db.js', () => ({
  listTables: vi.fn(),
  getSeats: vi.fn(),
  clearSeat: vi.fn(),
  getTable: vi.fn(),
  updateTableStatus: vi.fn(),
  getEvents: vi.fn(),
  getAgentById: vi.fn(),
}))

vi.mock('../../src/auth/adminAuth.js', () => ({
  adminAuthMiddleware: vi.fn((_request, _reply, done) => done()),
}))

vi.mock('../../src/table/endTable.js', () => ({
  endTable: vi.fn(),
}))

vi.mock('../../src/table/manager.js', () => ({
  tableManager: {
    get: vi.fn(() => null),
  },
}))

vi.mock('../../src/ws/broadcastManager.js', () => ({
  broadcastManager: {
    getConnection: vi.fn(() => null),
    unregister: vi.fn(),
  },
}))

describe('POST /v1/admin/agents/:agentId/kick ended-table behavior', () => {
  let app: any
  let dbMock: any

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify()
    dbMock = await import('../../src/db.js')
    const { registerAdminRoutes } = await import('../../src/routes/admin.js')
    registerAdminRoutes(app)
  })

  it('returns success no-op when target table is ended', async () => {
    dbMock.listTables.mockResolvedValue([
      { id: 'tbl_ended', status: 'ended', config: {}, created_at: new Date().toISOString() },
    ])
    dbMock.getSeats.mockResolvedValue([
      { seat_id: 0, agent_id: 'agt_1', agents: { name: 'Agent One' } },
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents/agt_1/kick',
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      success: true,
      message: 'Table already ended; kick is a no-op',
      table_id: 'tbl_ended',
      seat_id: 0,
    })
    expect(dbMock.clearSeat).not.toHaveBeenCalled()
  })

  it('keeps existing behavior for non-ended tables', async () => {
    dbMock.listTables.mockResolvedValue([
      { id: 'tbl_running', status: 'running', config: {}, created_at: new Date().toISOString() },
    ])
    dbMock.getSeats.mockResolvedValue([
      { seat_id: 3, agent_id: 'agt_2', agents: { name: 'Agent Two' } },
    ])
    dbMock.clearSeat.mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents/agt_2/kick',
    })

    expect(response.statusCode).toBe(200)
    expect(dbMock.clearSeat).toHaveBeenCalledWith('tbl_running', 3)
  })
})
