import { describe, it, expect } from 'vitest';

import {
  AgentRegistrationSchema,
  TableConfigSchema,
  PlayerActionSchema,
  GameStatePayloadSchema,
  ActionKindSchema,
} from '../src/schemas/index.js';

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

    it('should reject invalid maxSeats', () => {
      const result = TableConfigSchema.safeParse({
        maxSeats: 1, // Need at least 2
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PlayerActionSchema', () => {
    it('should validate fold action', () => {
      const result = PlayerActionSchema.safeParse({
        action_id: '550e8400-e29b-41d4-a716-446655440000',
        kind: 'fold',
      });
      expect(result.success).toBe(true);
    });

    it('should validate raise action with amount', () => {
      const result = PlayerActionSchema.safeParse({
        action_id: '550e8400-e29b-41d4-a716-446655440000',
        kind: 'raiseTo',
        amount: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid action_id', () => {
      const result = PlayerActionSchema.safeParse({
        action_id: 'not-a-uuid',
        kind: 'fold',
      });
      expect(result.success).toBe(false);
    });

    it('should reject unknown action kind', () => {
      const result = PlayerActionSchema.safeParse({
        action_id: '550e8400-e29b-41d4-a716-446655440000',
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
