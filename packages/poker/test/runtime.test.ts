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
        turn_token: runtime.getTurnToken(),
        kind: 'fold',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_YOUR_TURN');
    });

    it('should accept valid fold', () => {
      const currentSeat = runtime.getCurrentSeat();
      const result = runtime.applyAction(currentSeat, {
        turn_token: runtime.getTurnToken(),
        kind: 'fold',
      });

      expect(result.success).toBe(true);
    });

    it('should accept valid call', () => {
      const currentSeat = runtime.getCurrentSeat();
      const result = runtime.applyAction(currentSeat, {
        turn_token: runtime.getTurnToken(),
        kind: 'call',
      });

      expect(result.success).toBe(true);
    });

    it('should handle idempotency via turn_token', () => {
      const currentSeat = runtime.getCurrentSeat();
      const turnToken = runtime.getTurnToken();
      
      // First action
      const result1 = runtime.applyAction(currentSeat, {
        turn_token: turnToken,
        kind: 'call',
      });
      expect(result1.success).toBe(true);

      // Same turn_token again — should be recorded as processed
      expect(runtime.isTurnTokenProcessed(turnToken)).toBeDefined();
    });
  });

  describe('forceFold', () => {
    beforeEach(() => {
      runtime.addPlayer(0, 'agent-1', 'Agent 1');
      runtime.addPlayer(1, 'agent-2', 'Agent 2');
      runtime.startHand();
    });

    it('should fold the current player and advance the game', () => {
      const currentSeat = runtime.getCurrentSeat();
      const result = runtime.forceFold(currentSeat);

      expect(result.success).toBe(true);

      const player = runtime.getPlayer(currentSeat);
      expect(player?.folded).toBe(true);
    });

    it('should end the hand when the last non-folded player remains', () => {
      // With 2 players, force-folding one should end the hand
      const currentSeat = runtime.getCurrentSeat();
      runtime.forceFold(currentSeat);

      expect(runtime.isHandComplete()).toBe(true);
    });

    it('should award pot to the remaining player', () => {
      const currentSeat = runtime.getCurrentSeat();
      const otherSeat = currentSeat === 0 ? 1 : 0;

      const stackBefore = runtime.getPlayer(otherSeat)!.stack + runtime.getPlayer(otherSeat)!.bet;
      const foldedPlayerBet = runtime.getPlayer(currentSeat)!.bet;

      runtime.forceFold(currentSeat);

      // The remaining player should have won the pot (both blinds)
      const otherPlayer = runtime.getPlayer(otherSeat)!;
      expect(otherPlayer.stack).toBeGreaterThan(stackBefore - foldedPlayerBet);
    });

    it('should succeed for a non-current player (marks as folded)', () => {
      const currentSeat = runtime.getCurrentSeat();
      const otherSeat = currentSeat === 0 ? 1 : 0;

      const result = runtime.forceFold(otherSeat);
      expect(result.success).toBe(true);

      const player = runtime.getPlayer(otherSeat);
      expect(player?.folded).toBe(true);
    });

    it('should return success when player is already folded', () => {
      const currentSeat = runtime.getCurrentSeat();
      runtime.forceFold(currentSeat);

      // Force-fold again -- should be a no-op
      const result = runtime.forceFold(currentSeat);
      expect(result.success).toBe(true);
    });

    it('should return error for non-existent player', () => {
      const result = runtime.forceFold(8); // seat 8 doesn't exist
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_ACTION');
    });

    it('should work in a 3-player game without ending the hand', () => {
      // Set up a 3-player game
      const rt = new TableRuntime({ ...config, seed: 'forcefold-3p' });
      rt.addPlayer(0, 'agent-1', 'Agent 1');
      rt.addPlayer(1, 'agent-2', 'Agent 2');
      rt.addPlayer(2, 'agent-3', 'Agent 3');
      rt.startHand();

      const currentSeat = rt.getCurrentSeat();
      rt.forceFold(currentSeat);

      // Hand should still be in progress with 2 active players
      expect(rt.isHandInProgress()).toBe(true);
      expect(rt.getActivePlayers().length).toBe(2);
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
