import { describe, it, expect, beforeEach } from 'vitest';

import { TableRuntime, type TableRuntimeConfig } from '../src/runtime.js';

describe('TableRuntime', () => {
  let runtime: TableRuntime;
  const config: TableRuntimeConfig = {
    tableId: 'test-table',
    blinds: { small: 1, big: 2 },
    maxSeats: 9,
    initialStack: 1000,
    actionTimeoutMs: 30000,
    seed: 'test-seed-123',
  };

  beforeEach(() => {
    runtime = new TableRuntime(config);
  });

  describe('initialization', () => {
    it('should initialize with correct config', () => {
      expect(runtime.getTableId()).toBe('test-table');
      expect(runtime.getActionTimeoutMs()).toBe(30000);
      expect(runtime.getPhase()).toBe('waiting');
      expect(runtime.getHandNumber()).toBe(0);
    });
  });

  describe('player management', () => {
    it('should add players', () => {
      expect(runtime.addPlayer(0, 'agent-1', 'Agent 1')).toBe(true);
      expect(runtime.addPlayer(1, 'agent-2', 'Agent 2')).toBe(true);
      expect(runtime.getAllPlayers()).toHaveLength(2);
    });

    it('should reject invalid seat numbers', () => {
      expect(runtime.addPlayer(-1, 'agent-1', 'Agent 1')).toBe(false);
      expect(runtime.addPlayer(10, 'agent-1', 'Agent 1')).toBe(false);
    });

    it('should reject duplicate seats', () => {
      runtime.addPlayer(0, 'agent-1', 'Agent 1');
      expect(runtime.addPlayer(0, 'agent-2', 'Agent 2')).toBe(false);
    });

    it('should remove players', () => {
      runtime.addPlayer(0, 'agent-1', 'Agent 1');
      expect(runtime.removePlayer(0)).toBe(true);
      expect(runtime.getAllPlayers()).toHaveLength(0);
    });
  });

  describe('hand start', () => {
    it('should not start with fewer than 2 players', () => {
      runtime.addPlayer(0, 'agent-1', 'Agent 1');
      expect(runtime.startHand()).toBe(false);
    });

    it('should start hand with 2+ players', () => {
      runtime.addPlayer(0, 'agent-1', 'Agent 1');
      runtime.addPlayer(1, 'agent-2', 'Agent 2');
      expect(runtime.startHand()).toBe(true);
      expect(runtime.getPhase()).toBe('preflop');
      expect(runtime.getHandNumber()).toBe(1);
    });

    it('should post blinds correctly', () => {
      runtime.addPlayer(0, 'agent-1', 'Agent 1');
      runtime.addPlayer(1, 'agent-2', 'Agent 2');
      runtime.startHand();

      const players = runtime.getAllPlayers();
      const totalBets = players.reduce((sum, p) => sum + p.bet, 0);
      expect(totalBets).toBe(3); // small blind (1) + big blind (2)
    });

    it('should deal hole cards', () => {
      runtime.addPlayer(0, 'agent-1', 'Agent 1');
      runtime.addPlayer(1, 'agent-2', 'Agent 2');
      runtime.startHand();

      for (const player of runtime.getAllPlayers()) {
        expect(player.holeCards).toHaveLength(2);
      }
    });
  });

  describe('actions', () => {
    beforeEach(() => {
      runtime.addPlayer(0, 'agent-1', 'Agent 1');
      runtime.addPlayer(1, 'agent-2', 'Agent 2');
      runtime.startHand();
    });

    it('should reject action when not player turn', () => {
      const currentSeat = runtime.getCurrentSeat();
      const otherSeat = currentSeat === 0 ? 1 : 0;

      const result = runtime.applyAction(otherSeat, {
        action_id: 'test-1',
        kind: 'fold',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_YOUR_TURN');
    });

    it('should accept valid fold', () => {
      const currentSeat = runtime.getCurrentSeat();
      const result = runtime.applyAction(currentSeat, {
        action_id: 'test-1',
        kind: 'fold',
      });

      expect(result.success).toBe(true);
    });

    it('should accept valid call', () => {
      const currentSeat = runtime.getCurrentSeat();
      const result = runtime.applyAction(currentSeat, {
        action_id: 'test-1',
        kind: 'call',
      });

      expect(result.success).toBe(true);
    });

    it('should handle idempotency', () => {
      const currentSeat = runtime.getCurrentSeat();
      
      // First action
      const result1 = runtime.applyAction(currentSeat, {
        action_id: 'test-same-id',
        kind: 'call',
      });
      expect(result1.success).toBe(true);

      // Same action ID again (might be different player's turn now)
      expect(runtime.isActionProcessed('test-same-id')).toBe(true);
    });
  });

  describe('determinism', () => {
    it('should produce identical results with same seed', () => {
      // First runtime
      const runtime1 = new TableRuntime({ ...config, seed: 'determinism-test' });
      runtime1.addPlayer(0, 'agent-1', 'Agent 1');
      runtime1.addPlayer(1, 'agent-2', 'Agent 2');
      runtime1.startHand();
      const cards1 = runtime1.getAllPlayers().map(p => p.holeCards);

      // Second runtime with same seed
      const runtime2 = new TableRuntime({ ...config, seed: 'determinism-test' });
      runtime2.addPlayer(0, 'agent-1', 'Agent 1');
      runtime2.addPlayer(1, 'agent-2', 'Agent 2');
      runtime2.startHand();
      const cards2 = runtime2.getAllPlayers().map(p => p.holeCards);

      expect(cards1).toEqual(cards2);
    });

    it('should produce different results with different seeds', () => {
      // First runtime
      const runtime1 = new TableRuntime({ ...config, seed: 'seed-one' });
      runtime1.addPlayer(0, 'agent-1', 'Agent 1');
      runtime1.addPlayer(1, 'agent-2', 'Agent 2');
      runtime1.startHand();
      const cards1 = JSON.stringify(runtime1.getAllPlayers().map(p => p.holeCards));

      // Second runtime with different seed
      const runtime2 = new TableRuntime({ ...config, seed: 'seed-two' });
      runtime2.addPlayer(0, 'agent-1', 'Agent 1');
      runtime2.addPlayer(1, 'agent-2', 'Agent 2');
      runtime2.startHand();
      const cards2 = JSON.stringify(runtime2.getAllPlayers().map(p => p.holeCards));

      expect(cards1).not.toEqual(cards2);
    });
  });
});
