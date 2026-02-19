import type {
  Card,
  ErrorPayload,
  GameStatePayload,
  HandCompletePayload,
  PlayerState,
  WelcomePayload,
} from '@moltpoker/shared'
import { describe, expect, it } from 'vitest'

import { formatMessage } from '../src/ws/compactFormat.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function card(str: string): Card {
  return { rank: str[0]!, suit: str[1] as 's' | 'h' | 'd' | 'c' }
}

function makePlayer(overrides: Partial<PlayerState> & { seatId: number }): PlayerState {
  return {
    agentId: `agt_${overrides.seatId}`,
    agentName: `Player${overrides.seatId}`,
    stack: 100,
    bet: 0,
    folded: false,
    allIn: false,
    isActive: true,
    holeCards: null,
    ...overrides,
  }
}

function makeGameState(overrides: Partial<GameStatePayload> = {}): GameStatePayload {
  return {
    tableId: 'tbl_test',
    handNumber: 1,
    phase: 'preflop',
    communityCards: [],
    pots: [{ amount: 30, eligibleSeats: [0, 1] }],
    players: [
      makePlayer({ seatId: 0, stack: 90, bet: 10 }),
      makePlayer({ seatId: 1, stack: 80, bet: 20, holeCards: [card('As'), card('Kh')] }),
    ],
    dealerSeat: 0,
    currentSeat: 1,
    lastAction: null,
    legalActions: [
      { kind: 'fold' },
      { kind: 'call', minAmount: 10, maxAmount: 10 },
      { kind: 'raiseTo', minAmount: 40, maxAmount: 90 },
    ],
    minRaise: 20,
    toCall: 10,
    seq: 5,
    ...overrides,
  }
}

// ─── Card Conversion ─────────────────────────────────────────────────────────

describe('Card conversion', () => {
  it('converts {rank,suit} to 2-char string in board', () => {
    const state = makeGameState({
      phase: 'flop',
      communityCards: [card('Qs'), card('Jd'), card('Th')],
    })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    expect(result.board).toEqual(['Qs', 'Jd', 'Th'])
  })

  it('converts {rank,suit} to 2-char string in player cards', () => {
    const state = makeGameState()
    const result = formatMessage('game_state', state) as Record<string, unknown>
    const players = result.players as Array<Record<string, unknown>>
    expect(players[1]!.cards).toEqual(['As', 'Kh'])
  })

  it('converts {rank,suit} to 2-char string in hand_complete results', () => {
    const payload: HandCompletePayload = {
      handNumber: 3,
      results: [
        { seatId: 0, agentId: 'agt_0', holeCards: [card('7s'), card('2d')], winnings: 0 },
        { seatId: 1, agentId: 'agt_1', holeCards: [card('As'), card('Kh')], handRank: 'Pair of Aces', winnings: 60 },
      ],
      finalPots: [{ amount: 60, eligibleSeats: [1] }],
      communityCards: [card('Ad'), card('9c'), card('3h'), card('8s'), card('5d')],
      showdown: true,
    }
    const result = formatMessage('hand_complete', payload) as Record<string, unknown>
    const results = result.results as Array<Record<string, unknown>>
    expect(results[0]!.cards).toEqual(['7s', '2d'])
    expect(results[1]!.cards).toEqual(['As', 'Kh'])
  })
})

// ─── game_state Conversion ───────────────────────────────────────────────────

describe('game_state conversion', () => {
  it('renames fields correctly', () => {
    const state = makeGameState({ handNumber: 7, phase: 'flop', dealerSeat: 0, currentSeat: 1 })
    const result = formatMessage('game_state', state) as Record<string, unknown>

    expect(result.type).toBe('game_state')
    expect(result.hand).toBe(7)
    expect(result.phase).toBe('flop')
    expect(result.dealer).toBe(0)
    expect(result.turn).toBe(1)
    expect(result.seq).toBe(5)

    // Original field names should NOT be present
    expect(result).not.toHaveProperty('handNumber')
    expect(result).not.toHaveProperty('communityCards')
    expect(result).not.toHaveProperty('currentSeat')
    expect(result).not.toHaveProperty('dealerSeat')
    expect(result).not.toHaveProperty('legalActions')
  })

  it('renames legalActions to actions with min/max', () => {
    const state = makeGameState()
    const result = formatMessage('game_state', state) as Record<string, unknown>
    const actions = result.actions as Array<Record<string, unknown>>

    expect(actions).toHaveLength(3)
    expect(actions[0]).toEqual({ kind: 'fold' })
    expect(actions[1]).toEqual({ kind: 'call', min: 10, max: 10 })
    expect(actions[2]).toEqual({ kind: 'raiseTo', min: 40, max: 90 })
  })

  it('sums pots into a single pot number', () => {
    const state = makeGameState({
      pots: [
        { amount: 40, eligibleSeats: [0, 1] },
        { amount: 20, eligibleSeats: [1] },
      ],
    })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    expect(result.pot).toBe(60)
  })

  it('strips agentId and isActive from players', () => {
    const state = makeGameState()
    const result = formatMessage('game_state', state) as Record<string, unknown>
    const players = result.players as Array<Record<string, unknown>>

    for (const p of players) {
      expect(p).not.toHaveProperty('agentId')
      expect(p).not.toHaveProperty('isActive')
    }
  })

  it('renames player fields: seatId -> seat, agentName -> name', () => {
    const state = makeGameState()
    const result = formatMessage('game_state', state) as Record<string, unknown>
    const players = result.players as Array<Record<string, unknown>>

    expect(players[0]!.seat).toBe(0)
    expect(players[0]!.name).toBe('Player0')
    expect(players[0]).not.toHaveProperty('seatId')
    expect(players[0]).not.toHaveProperty('agentName')
  })

  it('omits holeCards key when null (not visible)', () => {
    const state = makeGameState()
    const result = formatMessage('game_state', state) as Record<string, unknown>
    const players = result.players as Array<Record<string, unknown>>

    // Player 0 has holeCards: null — key should be absent
    expect(players[0]).not.toHaveProperty('cards')
    expect(players[0]).not.toHaveProperty('holeCards')

    // Player 1 has hole cards — should be present
    expect(players[1]!.cards).toEqual(['As', 'Kh'])
  })

  it('omits folded and allIn when false', () => {
    const state = makeGameState()
    const result = formatMessage('game_state', state) as Record<string, unknown>
    const players = result.players as Array<Record<string, unknown>>

    expect(players[0]).not.toHaveProperty('folded')
    expect(players[0]).not.toHaveProperty('allIn')
  })

  it('includes folded when true', () => {
    const state = makeGameState({
      players: [
        makePlayer({ seatId: 0, folded: true }),
        makePlayer({ seatId: 1, holeCards: [card('As'), card('Kh')] }),
      ],
    })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    const players = result.players as Array<Record<string, unknown>>

    expect(players[0]!.folded).toBe(true)
  })

  it('includes allIn when true', () => {
    const state = makeGameState({
      players: [
        makePlayer({ seatId: 0, allIn: true, stack: 0, bet: 100 }),
        makePlayer({ seatId: 1, holeCards: [card('As'), card('Kh')] }),
      ],
    })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    const players = result.players as Array<Record<string, unknown>>

    expect(players[0]!.allIn).toBe(true)
  })

  it('has no table_id, ts, or payload wrapper', () => {
    const state = makeGameState()
    const result = formatMessage('game_state', state, 'tbl_test', 5) as Record<string, unknown>

    expect(result).not.toHaveProperty('table_id')
    expect(result).not.toHaveProperty('ts')
    expect(result).not.toHaveProperty('payload')
  })

  it('handles empty community cards', () => {
    const state = makeGameState({ communityCards: [] })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    expect(result.board).toEqual([])
  })

  it('omits actions key when legalActions is null (not your turn)', () => {
    const state = makeGameState({ legalActions: null, currentSeat: 0 })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    expect(result).not.toHaveProperty('actions')
  })

  it('omits turn when currentSeat is null', () => {
    const state = makeGameState({ currentSeat: null })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    expect(result).not.toHaveProperty('turn')
  })

  it('includes toCall when present', () => {
    const state = makeGameState({ toCall: 10 })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    expect(result.toCall).toBe(10)
  })

  it('omits toCall when undefined', () => {
    const state = makeGameState({ toCall: undefined })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    expect(result).not.toHaveProperty('toCall')
  })

  it('includes lastAction with seat rename', () => {
    const state = makeGameState({
      lastAction: { seatId: 0, kind: 'raiseTo', amount: 50 },
    })
    const result = formatMessage('game_state', state) as Record<string, unknown>
    expect(result.last).toEqual({ seat: 0, kind: 'raiseTo', amount: 50 })
  })
})

// ─── hand_complete Conversion ────────────────────────────────────────────────

describe('hand_complete conversion', () => {
  const payload: HandCompletePayload = {
    handNumber: 5,
    results: [
      { seatId: 0, agentId: 'agt_0', holeCards: [card('Jh'), card('3c')], winnings: 0 },
      { seatId: 1, agentId: 'agt_1', holeCards: [card('Qs'), card('Qh')], handRank: 'Pair of Queens', winnings: 40 },
    ],
    finalPots: [{ amount: 40, eligibleSeats: [1] }],
    communityCards: [card('Ad'), card('9c'), card('3h'), card('8s'), card('5d')],
    showdown: true,
  }

  it('has correct top-level fields', () => {
    const result = formatMessage('hand_complete', payload) as Record<string, unknown>
    expect(result.type).toBe('hand_complete')
    expect(result.hand).toBe(5)
    expect(result.showdown).toBe(true)
  })

  it('results have seat, cards, won fields', () => {
    const result = formatMessage('hand_complete', payload) as Record<string, unknown>
    const results = result.results as Array<Record<string, unknown>>

    expect(results[0]).toEqual({ seat: 0, cards: ['Jh', '3c'], won: 0 })
    expect(results[1]).toEqual({ seat: 1, cards: ['Qs', 'Qh'], rank: 'Pair of Queens', won: 40 })
  })

  it('omits communityCards and finalPots (redundant)', () => {
    const result = formatMessage('hand_complete', payload) as Record<string, unknown>
    expect(result).not.toHaveProperty('communityCards')
    expect(result).not.toHaveProperty('finalPots')
  })

  it('omits rank when not present', () => {
    const result = formatMessage('hand_complete', payload) as Record<string, unknown>
    const results = result.results as Array<Record<string, unknown>>
    expect(results[0]).not.toHaveProperty('rank')
  })
})

// ─── welcome Conversion ──────────────────────────────────────────────────────

describe('welcome conversion', () => {
  const payload: WelcomePayload = {
    protocol_version: '0.1',
    min_supported_protocol_version: '0.1',
    skill_doc_url: 'http://localhost/skill.md',
    seat_id: 3,
    agent_id: 'agt_abc',
    action_timeout_ms: 30000,
  }

  it('maps fields correctly', () => {
    const result = formatMessage('welcome', payload) as Record<string, unknown>
    expect(result).toEqual({
      type: 'welcome',
      seat: 3,
      agent_id: 'agt_abc',
      timeout: 30000,
    })
  })

  it('strips protocol versions and skill_doc_url', () => {
    const result = formatMessage('welcome', payload) as Record<string, unknown>
    expect(result).not.toHaveProperty('protocol_version')
    expect(result).not.toHaveProperty('min_supported_protocol_version')
    expect(result).not.toHaveProperty('skill_doc_url')
  })
})

// ─── ack Conversion ──────────────────────────────────────────────────────────

describe('ack conversion', () => {
  it('maps fields correctly', () => {
    const payload = { turn_token: 'token-123', seq: 43, success: true }
    const result = formatMessage('ack', payload) as Record<string, unknown>
    expect(result).toEqual({
      type: 'ack',
      turn_token: 'token-123',
      seq: 43,
    })
  })
})

// ─── error Conversion ────────────────────────────────────────────────────────

describe('error conversion', () => {
  it('maps fields correctly', () => {
    const payload: ErrorPayload = {
      code: 'NOT_YOUR_TURN',
      message: 'It is not your turn to act',
      min_supported_protocol_version: '0.1',
      skill_doc_url: 'http://localhost/skill.md',
    }
    const result = formatMessage('error', payload) as Record<string, unknown>
    expect(result).toEqual({
      type: 'error',
      code: 'NOT_YOUR_TURN',
      message: 'It is not your turn to act',
    })
  })

  it('strips optional fields', () => {
    const payload: ErrorPayload = {
      code: 'INVALID_ACTION',
      message: 'Bad action',
      details: { foo: 'bar' },
      min_supported_protocol_version: '0.1',
      skill_doc_url: 'http://localhost/skill.md',
    }
    const result = formatMessage('error', payload) as Record<string, unknown>
    expect(result).not.toHaveProperty('details')
    expect(result).not.toHaveProperty('min_supported_protocol_version')
    expect(result).not.toHaveProperty('skill_doc_url')
  })
})

// ─── Passthrough Messages ────────────────────────────────────────────────────

describe('passthrough messages', () => {
  it('table_status preserves payload but strips envelope metadata', () => {
    const payload = { status: 'waiting', seat_id: 2, agent_id: 'agt_x', min_players_to_start: 2, current_players: 1 }
    const result = formatMessage('table_status', payload, 'tbl_test') as Record<string, unknown>

    expect(result.type).toBe('table_status')
    expect(result.status).toBe('waiting')
    expect(result.seat_id).toBe(2)
    expect(result).not.toHaveProperty('table_id')
    expect(result).not.toHaveProperty('ts')
  })

  it('player_joined preserves payload', () => {
    const payload = { seatId: 2, agentId: 'agt_x', agentName: 'TestAgent', stack: 1000 }
    const result = formatMessage('player_joined', payload, 'tbl_test') as Record<string, unknown>

    expect(result.type).toBe('player_joined')
    expect(result.seatId).toBe(2)
    expect(result).not.toHaveProperty('table_id')
    expect(result).not.toHaveProperty('ts')
  })

  it('player_left preserves payload', () => {
    const payload = { seatId: 2, agentId: 'agt_x' }
    const result = formatMessage('player_left', payload, 'tbl_test') as Record<string, unknown>

    expect(result.type).toBe('player_left')
    expect(result.seatId).toBe(2)
    expect(result).not.toHaveProperty('table_id')
    expect(result).not.toHaveProperty('ts')
  })
})

// ─── Payment Message Conversion ──────────────────────────────────────────────

describe('deposit_confirmed conversion', () => {
  it('passes through all fields with type tag', () => {
    const payload = {
      deposit_id: 'dep_123',
      table_id: 'tbl_abc',
      seat_id: 0,
      agent_id: 'agt_xyz',
      amount_usdc: 10.5,
      tx_hash: '0xabcdef',
      confirmed_at: '2024-01-01T00:00:00Z',
    }
    const result = formatMessage('deposit_confirmed', payload) as Record<string, unknown>

    expect(result.type).toBe('deposit_confirmed')
    expect(result.deposit_id).toBe('dep_123')
    expect(result.table_id).toBe('tbl_abc')
    expect(result.seat_id).toBe(0)
    expect(result.agent_id).toBe('agt_xyz')
    expect(result.amount_usdc).toBe(10.5)
    expect(result.tx_hash).toBe('0xabcdef')
    expect(result.confirmed_at).toBe('2024-01-01T00:00:00Z')
  })

  it('does not rename or strip fields', () => {
    const payload = {
      deposit_id: 'dep_123',
      table_id: 'tbl_abc',
      seat_id: 0,
      agent_id: 'agt_xyz',
      amount_usdc: 10.5,
      tx_hash: '0xabcdef',
      confirmed_at: '2024-01-01T00:00:00Z',
    }
    const result = formatMessage('deposit_confirmed', payload) as Record<string, unknown>

    // All original keys should be present
    expect(result).toHaveProperty('deposit_id')
    expect(result).toHaveProperty('amount_usdc')
    expect(result).toHaveProperty('tx_hash')
  })
})

describe('payout_initiated conversion', () => {
  it('passes through all fields with type tag', () => {
    const payload = {
      payout_id: 'pay_456',
      table_id: 'tbl_abc',
      seat_id: 1,
      agent_id: 'agt_xyz',
      amount_usdc: 15.0,
      tx_hash: '0x123456',
      status: 'pending_confirmation',
    }
    const result = formatMessage('payout_initiated', payload) as Record<string, unknown>

    expect(result.type).toBe('payout_initiated')
    expect(result.payout_id).toBe('pay_456')
    expect(result.amount_usdc).toBe(15.0)
    expect(result.tx_hash).toBe('0x123456')
    expect(result.status).toBe('pending_confirmation')
  })

  it('passes through when tx_hash is undefined (optional field)', () => {
    const payload = {
      payout_id: 'pay_456',
      table_id: 'tbl_abc',
      seat_id: 1,
      agent_id: 'agt_xyz',
      amount_usdc: 15.0,
      status: 'pending',
    }
    const result = formatMessage('payout_initiated', payload) as Record<string, unknown>

    expect(result.type).toBe('payout_initiated')
    expect(result.payout_id).toBe('pay_456')
    // When tx_hash is not in the payload, it won't be in the result (JS spread behavior)
    expect('tx_hash' in result).toBe(false)
  })
})

describe('welcome conversion - RM fields', () => {
  it('strips deposit_status and real_money fields (current behavior)', () => {
    const payload = {
      protocol_version: '0.1',
      min_supported_protocol_version: '0.1',
      skill_doc_url: 'http://localhost/skill.md',
      seat_id: 3,
      agent_id: 'agt_abc',
      action_timeout_ms: 30000,
      deposit_status: 'pending',
      real_money: true,
    }
    const result = formatMessage('welcome', payload as any) as Record<string, unknown>

    expect(result.type).toBe('welcome')
    expect(result.seat).toBe(3)
    expect(result.agent_id).toBe('agt_abc')
    expect(result.timeout).toBe(30000)

    // RM fields are NOT forwarded in compact format (current implementation)
    expect(result).not.toHaveProperty('deposit_status')
    expect(result).not.toHaveProperty('real_money')
  })

  it('welcome without RM fields works normally', () => {
    const payload = {
      protocol_version: '0.1',
      min_supported_protocol_version: '0.1',
      skill_doc_url: 'http://localhost/skill.md',
      seat_id: 2,
      agent_id: 'agt_test',
      action_timeout_ms: 20000,
    }
    const result = formatMessage('welcome', payload) as Record<string, unknown>

    expect(result).toEqual({
      type: 'welcome',
      seat: 2,
      agent_id: 'agt_test',
      timeout: 20000,
    })
  })
})

describe('table_status conversion - RM fields', () => {
  it('forwards real_money field when present', () => {
    const payload = {
      status: 'waiting',
      seat_id: 0,
      agent_id: 'agt_x',
      min_players_to_start: 2,
      current_players: 1,
      real_money: true,
    }
    const result = formatMessage('table_status', payload) as Record<string, unknown>

    expect(result.type).toBe('table_status')
    expect(result.real_money).toBe(true)
  })

  it('does not include real_money key when not present', () => {
    const payload = {
      status: 'waiting',
      seat_id: 0,
      agent_id: 'agt_x',
      min_players_to_start: 2,
      current_players: 1,
    }
    const result = formatMessage('table_status', payload) as Record<string, unknown>

    expect(result.type).toBe('table_status')
    expect(result).not.toHaveProperty('real_money')
  })
})
