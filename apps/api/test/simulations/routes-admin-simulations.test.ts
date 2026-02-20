import Fastify from 'fastify'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/simulation/store.js', () => ({
  createSimulationConfig: vi.fn(),
  listSimulationConfigs: vi.fn(),
  getSimulationConfig: vi.fn(),
  updateSimulationConfig: vi.fn(),
  deleteSimulationConfig: vi.fn(),
  listSimulationRuns: vi.fn(),
  getSimulationRun: vi.fn(),
}))

vi.mock('../../src/simulation/runner.js', () => ({
  getSimulationRunner: vi.fn(() => ({
    getActiveRunId: () => null,
    isRunning: () => false,
    startRun: vi.fn(),
    stopActiveRun: vi.fn(),
    emergencyStop: vi.fn(),
  })),
}))

describe('Admin simulation routes - create validation', () => {
  let app: any
  let storeMock: any

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify()
    storeMock = await import('../../src/simulation/store.js')
    const { registerAdminSimulationRoutes } = await import('../../src/routes/admin-simulations.js')
    registerAdminSimulationRoutes(app)
  })

  it('rejects create when agent_slots length does not equal agent_count', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/simulations',
      payload: {
        name: 'Mismatch config',
        agent_count: 4,
        agent_slots: [{ type: 'random' }, { type: 'tight' }, { type: 'callstation' }],
        table_config: {
          blinds: { small: 1, big: 2 },
          initialStack: 1000,
          actionTimeoutMs: 10000,
        },
      },
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('agent_slots length (3) must equal agent_count (4)')
    expect(storeMock.createSimulationConfig).not.toHaveBeenCalled()
  })

  it('accepts create when agent_slots length equals agent_count', async () => {
    storeMock.createSimulationConfig.mockResolvedValue({
      id: 'sim_test',
      name: 'Aligned config',
      status: 'paused',
      schedule_type: 'one_off',
      interval_minutes: null,
      cooldown_minutes: 5,
      max_hands: 20,
      agent_count: 3,
      agent_slots: [{ type: 'random' }, { type: 'tight' }, { type: 'callstation' }],
      table_config: {
        blinds: { small: 1, big: 2 },
        initialStack: 1000,
        actionTimeoutMs: 10000,
      },
      bucket_key: 'test-bucket',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/simulations',
      payload: {
        name: 'Aligned config',
        agent_count: 3,
        agent_slots: [{ type: 'random' }, { type: 'tight' }, { type: 'callstation' }],
        table_config: {
          blinds: { small: 1, big: 2 },
          initialStack: 1000,
          actionTimeoutMs: 10000,
        },
      },
    })

    expect(response.statusCode).toBe(201)
    expect(storeMock.createSimulationConfig).toHaveBeenCalledTimes(1)
  })
})
