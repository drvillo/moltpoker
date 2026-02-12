import { describe, it, expect } from 'vitest';

import {
  AgentRegistrationSchema,
  TableConfigSchema,
  TableListItemSchema,
  TableStatusSchema,
  SeatSchema,
  PlayerActionSchema,
  GameStatePayloadSchema,
  ActionKindSchema,
  TableStatusPayloadSchema,
} from '../src/schemas/index.js';
import type { TableListItem } from '../src/types/index.js';

describe('Schemas', () => {
  describe('AgentRegistrationSchema', () => {
    it('should validate correct registration', () => {
      const result = AgentRegistrationSchema.safeParse({
        name: 'TestAgent',
        metadata: { version: '1.0' },
      });
      expect(result.success).toBe(true);
    });

    it('should allow empty registration', () => {
      const result = AgentRegistrationSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject too long name', () => {
      const result = AgentRegistrationSchema.safeParse({
        name: 'a'.repeat(51),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TableConfigSchema', () => {
    it('should provide defaults', () => {
      const result = TableConfigSchema.parse({});
      expect(result.blinds).toEqual({ small: 1, big: 2 });
      expect(result.maxSeats).toBe(9);
      expect(result.initialStack).toBe(1000);
      expect(result.actionTimeoutMs).toBe(30000);
      expect(result.minPlayersToStart).toBe(2);
    });

    it('should validate custom config', () => {
      const result = TableConfigSchema.safeParse({
        blinds: { small: 5, big: 10 },
        maxSeats: 6,
        initialStack: 5000,
        actionTimeoutMs: 60000,
        seed: 'my-seed',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.blinds.small).toBe(5);
        expect(result.data.seed).toBe('my-seed');
      }
    });

    it('should accept custom minPlayersToStart', () => {
      const result = TableConfigSchema.safeParse({ minPlayersToStart: 4 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.minPlayersToStart).toBe(4);
      }
    });

    it('should reject minPlayersToStart < 2', () => {
      const result = TableConfigSchema.safeParse({ minPlayersToStart: 1 });
      expect(result.success).toBe(false);
    });

    it('should reject invalid maxSeats', () => {
      const result = TableConfigSchema.safeParse({
        maxSeats: 1, // Need at least 2
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TableStatusPayloadSchema', () => {
    it('should validate a waiting status payload', () => {
      const result = TableStatusPayloadSchema.safeParse({
        status: 'waiting',
        seat_id: 0,
        agent_id: 'agt_123',
        min_players_to_start: 2,
        current_players: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should validate an ended status payload', () => {
      const result = TableStatusPayloadSchema.safeParse({
        status: 'ended',
        reason: 'admin_stopped',
        final_stacks: [{ seat_id: 0, agent_id: 'agt_1', stack: 1200 }],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid ended payload stacks', () => {
      const result = TableStatusPayloadSchema.safeParse({
        status: 'ended',
        final_stacks: [{ seat_id: '0', agent_id: 'agt_1', stack: 1200 }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing fields for waiting status', () => {
      const result = TableStatusPayloadSchema.safeParse({
        status: 'waiting',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status value', () => {
      const result = TableStatusPayloadSchema.safeParse({
        status: 'unknown',
        seat_id: 0,
        agent_id: 'agt_123',
        min_players_to_start: 2,
        current_players: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── Helper: build a TableListItem for testing ────────────────────────────

  function makeTableListItem(overrides: Partial<TableListItem> & { id: string }): TableListItem {
    const defaults = TableConfigSchema.parse({});
    return {
      status: 'waiting',
      config: defaults,
      seats: [],
      availableSeats: 6,
      playerCount: 0,
      created_at: new Date(),
      ...overrides,
    };
  }

  function makeSeat(seatId: number, agentId: string | null) {
    return { seatId, agentId, agentName: null, stack: agentId ? 1000 : 0, isActive: !!agentId };
  }

  /**
   * Mimics the agent runner's table selection:
   *   tables.find(t => t.status === 'waiting' && t.availableSeats > 0)
   */
  function findJoinableTable(tables: TableListItem[]): TableListItem | undefined {
    return tables.find((t) => t.status === 'waiting' && t.availableSeats > 0);
  }

  // ─── Multiple waiting tables ──────────────────────────────────────────────

  describe('Multiple waiting tables - table selection', () => {
    it('should pick the first waiting table with available seats', () => {
      const tables: TableListItem[] = [
        makeTableListItem({ id: 'tbl_1', status: 'waiting', availableSeats: 4 }),
        makeTableListItem({ id: 'tbl_2', status: 'waiting', availableSeats: 2 }),
      ];
      const picked = findJoinableTable(tables);
      expect(picked).toBeDefined();
      expect(picked!.id).toBe('tbl_1');
    });

    it('should skip full waiting tables and pick one with seats', () => {
      const tables: TableListItem[] = [
        makeTableListItem({ id: 'tbl_full', status: 'waiting', availableSeats: 0 }),
        makeTableListItem({ id: 'tbl_open', status: 'waiting', availableSeats: 3 }),
      ];
      const picked = findJoinableTable(tables);
      expect(picked).toBeDefined();
      expect(picked!.id).toBe('tbl_open');
    });

    it('should return undefined when all waiting tables are full', () => {
      const tables: TableListItem[] = [
        makeTableListItem({ id: 'tbl_1', status: 'waiting', availableSeats: 0 }),
        makeTableListItem({ id: 'tbl_2', status: 'waiting', availableSeats: 0 }),
      ];
      expect(findJoinableTable(tables)).toBeUndefined();
    });

    it('should return undefined when no tables exist', () => {
      expect(findJoinableTable([])).toBeUndefined();
    });

    it('should prefer waiting tables over running or ended tables', () => {
      const tables: TableListItem[] = [
        makeTableListItem({ id: 'tbl_run', status: 'running', availableSeats: 5 }),
        makeTableListItem({ id: 'tbl_end', status: 'ended', availableSeats: 6 }),
        makeTableListItem({ id: 'tbl_wait', status: 'waiting', availableSeats: 4 }),
      ];
      const picked = findJoinableTable(tables);
      expect(picked).toBeDefined();
      expect(picked!.id).toBe('tbl_wait');
    });

    it('should skip all non-waiting tables even if they have seats', () => {
      const tables: TableListItem[] = [
        makeTableListItem({ id: 'tbl_run', status: 'running', availableSeats: 5 }),
        makeTableListItem({ id: 'tbl_end', status: 'ended', availableSeats: 6 }),
      ];
      expect(findJoinableTable(tables)).toBeUndefined();
    });

    it('should handle a mix of full/open/ended/running tables', () => {
      const tables: TableListItem[] = [
        makeTableListItem({ id: 'tbl_ended', status: 'ended', availableSeats: 4 }),
        makeTableListItem({ id: 'tbl_full', status: 'waiting', availableSeats: 0 }),
        makeTableListItem({ id: 'tbl_run', status: 'running', availableSeats: 2 }),
        makeTableListItem({ id: 'tbl_open', status: 'waiting', availableSeats: 1 }),
      ];
      const picked = findJoinableTable(tables);
      expect(picked).toBeDefined();
      expect(picked!.id).toBe('tbl_open');
    });
  });

  // ─── Non-joinable table states (edge cases) ──────────────────────────────

  describe('Non-joinable table state edge cases', () => {
    it('should validate all three table statuses', () => {
      expect(TableStatusSchema.safeParse('waiting').success).toBe(true);
      expect(TableStatusSchema.safeParse('running').success).toBe(true);
      expect(TableStatusSchema.safeParse('ended').success).toBe(true);
    });

    it('should reject unknown table statuses', () => {
      expect(TableStatusSchema.safeParse('paused').success).toBe(false);
      expect(TableStatusSchema.safeParse('starting').success).toBe(false);
      expect(TableStatusSchema.safeParse('').success).toBe(false);
    });

    it('should parse a full table list item with seats', () => {
      const item = makeTableListItem({
        id: 'tbl_seats',
        seats: [makeSeat(0, 'agt_1'), makeSeat(1, null), makeSeat(2, null)],
        availableSeats: 2,
        playerCount: 1,
      });
      const result = TableListItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    it('should correctly report zero available seats for a full table', () => {
      const item = makeTableListItem({
        id: 'tbl_full',
        seats: [makeSeat(0, 'agt_1'), makeSeat(1, 'agt_2')],
        availableSeats: 0,
        playerCount: 2,
      });
      const result = TableListItemSchema.safeParse(item);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.availableSeats).toBe(0);
        expect(result.data.playerCount).toBe(2);
      }
    });

    it('should not consider ended tables joinable regardless of available seats', () => {
      const tables: TableListItem[] = [
        makeTableListItem({ id: 'tbl_ended_open', status: 'ended', availableSeats: 5 }),
      ];
      expect(findJoinableTable(tables)).toBeUndefined();
    });

    it('should not consider running tables joinable via the agent selection filter', () => {
      // The server rejects joins to running tables with INVALID_TABLE_STATE.
      // The agent runner mirrors this by only picking waiting tables.
      const tables: TableListItem[] = [
        makeTableListItem({ id: 'tbl_running', status: 'running', availableSeats: 3 }),
      ];
      expect(findJoinableTable(tables)).toBeUndefined();
    });

    it('should confirm only waiting is joinable (running and ended rejected)', () => {
      // Mirrors the server-side guard: table.status !== 'waiting' → reject
      const statuses: Array<TableListItem['status']> = ['waiting', 'running', 'ended'];
      const results = statuses.map((status) => {
        const table = makeTableListItem({ id: `tbl_${status}`, status, availableSeats: 5 });
        return { status, joinable: findJoinableTable([table]) !== undefined };
      });
      expect(results).toEqual([
        { status: 'waiting', joinable: true },
        { status: 'running', joinable: false },
        { status: 'ended', joinable: false },
      ]);
    });

    it('should validate minPlayersToStart does not exceed maxSeats', () => {
      const result = TableConfigSchema.safeParse({
        maxSeats: 4,
        minPlayersToStart: 4,
      });
      expect(result.success).toBe(true);

      // minPlayersToStart > MAX_PLAYERS (10) should fail
      const invalid = TableConfigSchema.safeParse({
        minPlayersToStart: 11,
      });
      expect(invalid.success).toBe(false);
    });

    it('should validate seats with null agentId as available', () => {
      const seat = SeatSchema.safeParse({
        seatId: 0,
        agentId: null,
        stack: 0,
        isActive: false,
      });
      expect(seat.success).toBe(true);
      if (seat.success) {
        expect(seat.data.agentId).toBeNull();
      }
    });

    it('should validate seats with agentId as occupied', () => {
      const seat = SeatSchema.safeParse({
        seatId: 3,
        agentId: 'agt_abc',
        agentName: 'TestBot',
        stack: 1000,
        isActive: true,
      });
      expect(seat.success).toBe(true);
      if (seat.success) {
        expect(seat.data.agentId).toBe('agt_abc');
      }
    });

    it('should validate table_status payload for all status variants', () => {
      for (const status of ['waiting', 'running'] as const) {
        const result = TableStatusPayloadSchema.safeParse({
          status,
          seat_id: 0,
          agent_id: 'agt_1',
          min_players_to_start: 2,
          current_players: 1,
        });
        expect(result.success).toBe(true);
      }

      const endedResult = TableStatusPayloadSchema.safeParse({
        status: 'ended',
      });
      expect(endedResult.success).toBe(true);
    });

    it('should validate ended status payload with abandoned reason', () => {
      const result = TableStatusPayloadSchema.safeParse({
        status: 'ended',
        reason: 'abandoned',
        final_stacks: [
          { seat_id: 0, agent_id: 'agt_1', stack: 1500 },
          { seat_id: 1, agent_id: 'agt_2', stack: 500 },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('PlayerActionSchema', () => {
    it('should validate fold action', () => {
      const result = PlayerActionSchema.safeParse({
        turn_token: '550e8400-e29b-41d4-a716-446655440000',
        kind: 'fold',
      });
      expect(result.success).toBe(true);
    });

    it('should validate raise action with amount', () => {
      const result = PlayerActionSchema.safeParse({
        turn_token: '550e8400-e29b-41d4-a716-446655440000',
        kind: 'raiseTo',
        amount: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing turn_token', () => {
      const result = PlayerActionSchema.safeParse({
        kind: 'fold',
      });
      expect(result.success).toBe(false);
    });

    it('should reject unknown action kind', () => {
      const result = PlayerActionSchema.safeParse({
        turn_token: '550e8400-e29b-41d4-a716-446655440000',
        kind: 'bluff', // Invalid
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ActionKindSchema', () => {
    it('should validate all action kinds', () => {
      expect(ActionKindSchema.safeParse('fold').success).toBe(true);
      expect(ActionKindSchema.safeParse('check').success).toBe(true);
      expect(ActionKindSchema.safeParse('call').success).toBe(true);
      expect(ActionKindSchema.safeParse('raiseTo').success).toBe(true);
    });

    it('should reject invalid kinds', () => {
      expect(ActionKindSchema.safeParse('bet').success).toBe(false);
      expect(ActionKindSchema.safeParse('raise').success).toBe(false);
    });
  });

  describe('GameStatePayloadSchema', () => {
    it('should validate complete game state', () => {
      const state = {
        tableId: 'tbl_123',
        handNumber: 1,
        phase: 'preflop',
        communityCards: [],
        pots: [{ amount: 3, eligibleSeats: [0, 1] }],
        players: [
          {
            seatId: 0,
            agentId: 'agt_1',
            agentName: 'Player1',
            stack: 999,
            bet: 1,
            folded: false,
            allIn: false,
            isActive: true,
            holeCards: [
              { rank: 'A', suit: 's' },
              { rank: 'K', suit: 'h' },
            ],
          },
        ],
        dealerSeat: 0,
        currentSeat: 1,
        lastAction: null,
        legalActions: [{ kind: 'fold' }, { kind: 'call' }],
        minRaise: 2,
        seq: 1,
      };

      const result = GameStatePayloadSchema.safeParse(state);
      expect(result.success).toBe(true);
    });

    it('should require all mandatory fields', () => {
      const result = GameStatePayloadSchema.safeParse({
        tableId: 'tbl_123',
        // Missing required fields
      });
      expect(result.success).toBe(false);
    });
  });
});
