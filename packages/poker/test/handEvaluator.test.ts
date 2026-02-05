import type { Card } from '@moltpoker/shared';
import { describe, it, expect } from 'vitest';

import { evaluateHand, compareHands, HandRanks } from '../src/handEvaluator.js';

function card(str: string): Card {
  return { rank: str[0]!, suit: str[1] as 's' | 'h' | 'd' | 'c' };
}

describe('Hand Evaluator', () => {
  describe('evaluateHand', () => {
    it('should identify royal flush', () => {
      const hole: Card[] = [card('As'), card('Ks')];
      const community: Card[] = [card('Qs'), card('Js'), card('Ts')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.ROYAL_FLUSH);
      expect(result.description).toBe('Royal Flush');
    });

    it('should identify straight flush', () => {
      const hole: Card[] = [card('9h'), card('8h')];
      const community: Card[] = [card('7h'), card('6h'), card('5h')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.STRAIGHT_FLUSH);
    });

    it('should identify four of a kind', () => {
      const hole: Card[] = [card('As'), card('Ah')];
      const community: Card[] = [card('Ad'), card('Ac'), card('Ks')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.FOUR_OF_A_KIND);
    });

    it('should identify full house', () => {
      const hole: Card[] = [card('As'), card('Ah')];
      const community: Card[] = [card('Ad'), card('Ks'), card('Kh')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.FULL_HOUSE);
    });

    it('should identify flush', () => {
      const hole: Card[] = [card('As'), card('9s')];
      const community: Card[] = [card('7s'), card('4s'), card('2s')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.FLUSH);
    });

    it('should identify straight', () => {
      const hole: Card[] = [card('9s'), card('8h')];
      const community: Card[] = [card('7d'), card('6c'), card('5s')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.STRAIGHT);
    });

    it('should identify wheel (A-2-3-4-5)', () => {
      const hole: Card[] = [card('As'), card('2h')];
      const community: Card[] = [card('3d'), card('4c'), card('5s')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.STRAIGHT);
    });

    it('should identify three of a kind', () => {
      const hole: Card[] = [card('As'), card('Ah')];
      const community: Card[] = [card('Ad'), card('Ks'), card('Qh')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.THREE_OF_A_KIND);
    });

    it('should identify two pair', () => {
      const hole: Card[] = [card('As'), card('Ah')];
      const community: Card[] = [card('Ks'), card('Kh'), card('Qd')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.TWO_PAIR);
    });

    it('should identify one pair', () => {
      const hole: Card[] = [card('As'), card('Ah')];
      const community: Card[] = [card('Ks'), card('Qh'), card('Jd')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.ONE_PAIR);
    });

    it('should identify high card', () => {
      const hole: Card[] = [card('As'), card('Kh')];
      const community: Card[] = [card('9s'), card('7h'), card('2d')];
      
      const result = evaluateHand(hole, community);
      expect(result.rank).toBe(HandRanks.HIGH_CARD);
    });
  });

  describe('compareHands', () => {
    it('should rank flush higher than straight', () => {
      const flush = evaluateHand(
        [card('As'), card('9s')],
        [card('7s'), card('4s'), card('2s')]
      );
      const straight = evaluateHand(
        [card('9s'), card('8h')],
        [card('7d'), card('6c'), card('5s')]
      );
      
      expect(compareHands(flush, straight)).toBeGreaterThan(0);
    });

    it('should compare same rank hands by kickers', () => {
      const pair1 = evaluateHand(
        [card('As'), card('Ah')],
        [card('Ks'), card('Qh'), card('Jd')]
      );
      const pair2 = evaluateHand(
        [card('Ks'), card('Kh')],
        [card('As'), card('Qh'), card('Jd')]
      );
      
      // Pair of Aces beats Pair of Kings
      expect(compareHands(pair1, pair2)).toBeGreaterThan(0);
    });

    it('should identify tied hands', () => {
      const hand1 = evaluateHand(
        [card('As'), card('Kh')],
        [card('Qs'), card('Jh'), card('Td'), card('2c'), card('3s')]
      );
      const hand2 = evaluateHand(
        [card('Ah'), card('Kd')],
        [card('Qs'), card('Jh'), card('Td'), card('4c'), card('5s')]
      );
      
      // Same straight A-K-Q-J-T
      expect(compareHands(hand1, hand2)).toBe(0);
    });
  });
});
