import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/db.js', () => ({
  updateSeatStacksBatch: vi.fn(),
  updateTableStatus: vi.fn(),
  clearSeat: vi.fn(),
}))

vi.mock('../../src/table/manager.js', () => ({
  tableManager: {
    get: vi.fn(),
    destroy: vi.fn(),
  },
}))

vi.mock('../../src/ws/broadcastManager.js', () => ({
  broadcastManager: {
    broadcastTableStatus: vi.fn(),
    disconnectAll: vi.fn(),
  },
}))

vi.mock('../../src/table/nextHandScheduler.js', () => ({
  clearScheduledNextHand: vi.fn(),
}))

describe('endTable invariants', () => {
  let dbMock: any
  let managerMock: any
  let broadcastMock: any

  beforeEach(async () => {
    vi.clearAllMocks()
    dbMock = await import('../../src/db.js')
    managerMock = await import('../../src/table/manager.js')
    broadcastMock = await import('../../src/ws/broadcastManager.js')
  })

  it('persists runtime final stacks and never clears seats', async () => {
    const eventLogger = { log: vi.fn().mockResolvedValue(undefined) }
    const runtime = {
      getAllPlayers: vi.fn(() => [
        { seatId: 0, agentId: 'agt_a', stack: 80 },
        { seatId: 1, agentId: 'agt_b', stack: 120 },
      ]),
    }

    managerMock.tableManager.get.mockReturnValue({ runtime, eventLogger })
    dbMock.updateSeatStacksBatch.mockResolvedValue(2)
    dbMock.updateTableStatus.mockResolvedValue(undefined)

    const { endTable } = await import('../../src/table/endTable.js')
    await endTable({ tableId: 'tbl_1', reason: 'admin_stopped', source: 'admin' })

    expect(eventLogger.log).toHaveBeenCalledWith('TABLE_ENDED', {
      reason: 'admin_stopped',
      finalStacks: [
        { seatId: 0, agentId: 'agt_a', stack: 80 },
        { seatId: 1, agentId: 'agt_b', stack: 120 },
      ],
    })
    expect(dbMock.updateSeatStacksBatch).toHaveBeenCalledWith('tbl_1', [
      { seatId: 0, stack: 80 },
      { seatId: 1, stack: 120 },
    ])
    expect(dbMock.clearSeat).not.toHaveBeenCalled()
    expect(dbMock.updateTableStatus).toHaveBeenCalledWith('tbl_1', 'ended')
    expect(broadcastMock.broadcastManager.broadcastTableStatus).toHaveBeenCalled()
  })

  it('handles missing runtime without mutating seat ownership', async () => {
    managerMock.tableManager.get.mockReturnValue(null)
    dbMock.updateTableStatus.mockResolvedValue(undefined)

    const { endTable } = await import('../../src/table/endTable.js')
    await endTable({ tableId: 'tbl_2', reason: 'abandoned', source: 'abandonment' })

    expect(dbMock.updateSeatStacksBatch).not.toHaveBeenCalled()
    expect(dbMock.clearSeat).not.toHaveBeenCalled()
    expect(dbMock.updateTableStatus).toHaveBeenCalledWith('tbl_2', 'ended')
  })
})
