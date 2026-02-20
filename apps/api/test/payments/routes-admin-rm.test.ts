/**
 * Unit tests for admin routes - real money validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { ErrorCodes } from '@moltpoker/shared'
import { makeTableRow } from './fixtures.js'

// Mock all dependencies
vi.mock('../../src/db.js', () => ({
  createTable: vi.fn(),
  createSeats: vi.fn(),
  getSeats: vi.fn(),
  listTables: vi.fn(),
  getTable: vi.fn(),
}))

vi.mock('../../src/config.js', () => ({
  config: {
    realMoneyEnabled: false,
  },
}))

vi.mock('../../src/auth/adminAuth.js', () => ({
  adminAuthMiddleware: vi.fn((request, reply, done) => {
    done()
  }),
}))

vi.mock('../../src/utils/crypto.js', () => ({
  generateTableId: vi.fn(() => 'tbl_generated'),
}))

vi.mock('../../src/table/manager.js', () => ({
  tableManager: {
    has: vi.fn(() => false),
  },
}))

describe('Admin Routes - Real Money', () => {
  let app: any
  let dbMock: any
  let configMock: any

  beforeEach(async () => {
    vi.clearAllMocks()

    app = Fastify()

    dbMock = await import('../../src/db.js')
    configMock = await import('../../src/config.js')

    // Register routes
    const { registerAdminRoutes } = await import('../../src/routes/admin.js')
    registerAdminRoutes(app)
  })

  describe('POST /v1/admin/tables - real money validation', () => {
    it('realMoney: true in body config + config.realMoneyEnabled = false: 400 REAL_MONEY_DISABLED', async () => {
      configMock.config.realMoneyEnabled = false

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/tables',
        payload: {
          config: {
            realMoney: true,
          },
        },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error.code).toBe(ErrorCodes.REAL_MONEY_DISABLED)
      expect(body.error.message).toContain('Real money tables are not enabled')
      expect(dbMock.createTable).not.toHaveBeenCalled()
    })

    it('realMoney: true in body config + config.realMoneyEnabled = true: 201, table created', async () => {
      configMock.config.realMoneyEnabled = true

      dbMock.createTable.mockResolvedValue(undefined)
      dbMock.createSeats.mockResolvedValue(undefined)
      dbMock.getSeats.mockResolvedValue([
        { seat_id: 0, agent_id: null, stack: 0, is_active: true, agents: null },
        { seat_id: 1, agent_id: null, stack: 0, is_active: true, agents: null },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/tables',
        payload: {
          config: {
            realMoney: true,
            maxSeats: 2,
          },
        },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.config.realMoney).toBe(true)
      expect(dbMock.createTable).toHaveBeenCalledWith(
        'tbl_generated',
        expect.objectContaining({ realMoney: true }),
        null,
        'default'
      )

      // Reset for other tests
      configMock.config.realMoneyEnabled = false
    })

    it('realMoney: false (or omitted) + config.realMoneyEnabled = false: 201, FTP table created', async () => {
      configMock.config.realMoneyEnabled = false

      dbMock.createTable.mockResolvedValue(undefined)
      dbMock.createSeats.mockResolvedValue(undefined)
      dbMock.getSeats.mockResolvedValue([
        { seat_id: 0, agent_id: null, stack: 0, is_active: true, agents: null },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/tables',
        payload: {
          config: {
            realMoney: false,
          },
        },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.config.realMoney).toBe(false)
    })

    it('no realMoney in body (defaults to false) + config.realMoneyEnabled = false: 201', async () => {
      configMock.config.realMoneyEnabled = false

      dbMock.createTable.mockResolvedValue(undefined)
      dbMock.createSeats.mockResolvedValue(undefined)
      dbMock.getSeats.mockResolvedValue([
        { seat_id: 0, agent_id: null, stack: 0, is_active: true, agents: null },
      ])

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/tables',
        payload: {
          config: {},
        },
      })

      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.config.realMoney).toBe(false)
    })
  })

  describe('GET /v1/tables - realMoney field', () => {
    it('table with realMoney: true in config: response includes realMoney: true', async () => {
      const rmTable = makeTableRow({ id: 'tbl_rm', config: { realMoney: true } })

      dbMock.listTables.mockResolvedValue([rmTable])
      dbMock.getSeats.mockResolvedValue([
        { seat_id: 0, agent_id: null, stack: 0, is_active: true, agents: null },
      ])

      // Register table routes (GET /v1/tables is there)
      const { registerTableRoutes } = await import('../../src/routes/tables.js')
      registerTableRoutes(app)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tables',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.tables[0].realMoney).toBe(true)
    })

    it('table with realMoney: false in config: response includes realMoney: false', async () => {
      const ftpTable = makeTableRow({ id: 'tbl_ftp', config: { realMoney: false } })

      dbMock.listTables.mockResolvedValue([ftpTable])
      dbMock.getSeats.mockResolvedValue([
        { seat_id: 0, agent_id: null, stack: 0, is_active: true, agents: null },
      ])

      const { registerTableRoutes } = await import('../../src/routes/tables.js')
      registerTableRoutes(app)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tables',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.tables[0].realMoney).toBe(false)
    })

    it('table with no realMoney in config (legacy): response defaults to realMoney: false', async () => {
      const legacyTable = makeTableRow({ id: 'tbl_legacy', config: {} }) // no realMoney field

      dbMock.listTables.mockResolvedValue([legacyTable])
      dbMock.getSeats.mockResolvedValue([
        { seat_id: 0, agent_id: null, stack: 0, is_active: true, agents: null },
      ])

      const { registerTableRoutes } = await import('../../src/routes/tables.js')
      registerTableRoutes(app)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/tables',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.tables[0].realMoney).toBe(false)
    })
  })
})
