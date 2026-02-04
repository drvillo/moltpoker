import type { Card } from '@moltpoker/shared';

import { getRankValue } from './deck.js';

// Hand rankings from highest to lowest
export const HandRanks = {
  ROYAL_FLUSH: 10,
  STRAIGHT_FLUSH: 9,
  FOUR_OF_A_KIND: 8,
  FULL_HOUSE: 7,
  FLUSH: 6,
  STRAIGHT: 5,
  THREE_OF_A_KIND: 4,
  TWO_PAIR: 3,
  ONE_PAIR: 2,
  HIGH_CARD: 1,
} as const;

export type HandRankName = keyof typeof HandRanks;

export interface HandEvaluation {
  rank: number;
  rankName: HandRankName;
  description: string;
  cards: Card[]; // Best 5 cards
  kickers: number[]; // For tie-breaking
}

/**
 * Get all 5-card combinations from a set of cards
 */
function getCombinations(cards: Card[], size: number): Card[][] {
  if (size === 0) return [[]];
  if (cards.length < size) return [];

  const [first, ...rest] = cards;
  if (!first) return [];

  const withFirst = getCombinations(rest, size - 1).map((combo) => [first, ...combo]);
  const withoutFirst = getCombinations(rest, size);

  return [...withFirst, ...withoutFirst];
}

/**
 * Count cards by rank
 */
function countByRank(cards: Card[]): Map<number, Card[]> {
  const counts = new Map<number, Card[]>();
  for (const card of cards) {
    const value = getRankValue(card.rank);
    const existing = counts.get(value) || [];
    counts.set(value, [...existing, card]);
  }
  return counts;
}

/**
 * Check if cards form a flush
 */
function isFlush(cards: Card[]): boolean {
  const suit = cards[0]?.suit;
  return cards.every((c) => c.suit === suit);
}

/**
 * Check if cards form a straight (returns high card value or 0)
 */
function getStraightHigh(cards: Card[]): number {
  const values = [...new Set(cards.map((c) => getRankValue(c.rank)))].sort((a, b) => b - a);

  // Check for wheel (A-2-3-4-5)
  if (
    values.includes(14) &&
    values.includes(2) &&
    values.includes(3) &&
    values.includes(4) &&
    values.includes(5)
  ) {
    return 5; // 5-high straight
  }

  // Check for normal straight
  for (let i = 0; i <= values.length - 5; i++) {
    let isStraight = true;
    for (let j = 0; j < 4; j++) {
      if (values[i + j]! - values[i + j + 1]! !== 1) {
        isStraight = false;
        break;
      }
    }
    if (isStraight) {
      return values[i]!;
    }
  }

  return 0;
}

/**
 * Evaluate a 5-card hand
 */
function evaluate5Cards(cards: Card[]): HandEvaluation {
  const sortedCards = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
  const flush = isFlush(cards);
  const straightHigh = getStraightHigh(cards);
  const counts = countByRank(cards);

  // Get groups sorted by count then by rank
  const groups = [...counts.entries()]
    .sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return b[0] - a[0];
    })
    .map(([value, groupCards]) => ({ value, cards: groupCards }));

  // Royal Flush / Straight Flush
  if (flush && straightHigh > 0) {
    if (straightHigh === 14) {
      return {
        rank: HandRanks.ROYAL_FLUSH,
        rankName: 'ROYAL_FLUSH',
        description: 'Royal Flush',
        cards: sortedCards,
        kickers: [14],
      };
    }
    return {
      rank: HandRanks.STRAIGHT_FLUSH,
      rankName: 'STRAIGHT_FLUSH',
      description: `Straight Flush, ${rankToName(straightHigh)}-high`,
      cards: sortedCards,
      kickers: [straightHigh],
    };
  }

  // Four of a Kind
  if (groups[0]?.cards.length === 4) {
    const quad = groups[0];
    const kicker = groups[1]!;
    return {
      rank: HandRanks.FOUR_OF_A_KIND,
      rankName: 'FOUR_OF_A_KIND',
      description: `Four of a Kind, ${rankToName(quad.value)}s`,
      cards: [...quad.cards, kicker.cards[0]!],
      kickers: [quad.value, kicker.value],
    };
  }

  // Full House
  if (groups[0]?.cards.length === 3 && groups[1]?.cards.length === 2) {
    const trips = groups[0];
    const pair = groups[1];
    return {
      rank: HandRanks.FULL_HOUSE,
      rankName: 'FULL_HOUSE',
      description: `Full House, ${rankToName(trips.value)}s full of ${rankToName(pair.value)}s`,
      cards: [...trips.cards, ...pair.cards],
      kickers: [trips.value, pair.value],
    };
  }

  // Flush
  if (flush) {
    const values = sortedCards.map((c) => getRankValue(c.rank));
    return {
      rank: HandRanks.FLUSH,
      rankName: 'FLUSH',
      description: `Flush, ${rankToName(values[0]!)}-high`,
      cards: sortedCards,
      kickers: values,
    };
  }

  // Straight
  if (straightHigh > 0) {
    return {
      rank: HandRanks.STRAIGHT,
      rankName: 'STRAIGHT',
      description: `Straight, ${rankToName(straightHigh)}-high`,
      cards: sortedCards,
      kickers: [straightHigh],
    };
  }

  // Three of a Kind
  if (groups[0]?.cards.length === 3) {
    const trips = groups[0];
    const kickers = groups.slice(1).flatMap((g) => g.cards);
    return {
      rank: HandRanks.THREE_OF_A_KIND,
      rankName: 'THREE_OF_A_KIND',
      description: `Three of a Kind, ${rankToName(trips.value)}s`,
      cards: [...trips.cards, ...kickers.slice(0, 2)],
      kickers: [trips.value, ...groups.slice(1, 3).map((g) => g.value)],
    };
  }

  // Two Pair
  if (groups[0]?.cards.length === 2 && groups[1]?.cards.length === 2) {
    const highPair = groups[0];
    const lowPair = groups[1];
    const kicker = groups[2]!;
    return {
      rank: HandRanks.TWO_PAIR,
      rankName: 'TWO_PAIR',
      description: `Two Pair, ${rankToName(highPair.value)}s and ${rankToName(lowPair.value)}s`,
      cards: [...highPair.cards, ...lowPair.cards, kicker.cards[0]!],
      kickers: [highPair.value, lowPair.value, kicker.value],
    };
  }

  // One Pair
  if (groups[0]?.cards.length === 2) {
    const pair = groups[0];
    const kickers = groups.slice(1).flatMap((g) => g.cards);
    return {
      rank: HandRanks.ONE_PAIR,
      rankName: 'ONE_PAIR',
      description: `Pair of ${rankToName(pair.value)}s`,
      cards: [...pair.cards, ...kickers.slice(0, 3)],
      kickers: [pair.value, ...groups.slice(1, 4).map((g) => g.value)],
    };
  }

  // High Card
  const values = sortedCards.map((c) => getRankValue(c.rank));
  return {
    rank: HandRanks.HIGH_CARD,
    rankName: 'HIGH_CARD',
    description: `High Card, ${rankToName(values[0]!)}`,
    cards: sortedCards,
    kickers: values,
  };
}

/**
 * Convert rank value to name
 */
function rankToName(value: number): string {
  const names: Record<number, string> = {
    14: 'Ace',
    13: 'King',
    12: 'Queen',
    11: 'Jack',
    10: 'Ten',
    9: 'Nine',
    8: 'Eight',
    7: 'Seven',
    6: 'Six',
    5: 'Five',
    4: 'Four',
    3: 'Three',
    2: 'Two',
  };
  return names[value] || String(value);
}

/**
 * Evaluate the best 5-card hand from hole cards + community cards
 */
export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandEvaluation {
  const allCards = [...holeCards, ...communityCards];

  if (allCards.length < 5) {
    throw new Error('Need at least 5 cards to evaluate');
  }

  const combinations = getCombinations(allCards, 5);
  let bestHand: HandEvaluation | null = null;

  for (const combo of combinations) {
    const evaluation = evaluate5Cards(combo);

    if (!bestHand || compareHands(evaluation, bestHand) > 0) {
      bestHand = evaluation;
    }
  }

  return bestHand!;
}

/**
 * Compare two hands: returns positive if a > b, negative if a < b, 0 if equal
 */
export function compareHands(a: HandEvaluation, b: HandEvaluation): number {
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }

  // Compare kickers
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) {
      return a.kickers[i]! - b.kickers[i]!;
    }
  }

  return 0;
}
