import type { Card } from '@moltpoker/shared';
import seedrandom from 'seedrandom';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
const SUITS = ['s', 'h', 'd', 'c'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

/**
 * Create a standard 52-card deck
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Shuffle deck using Fisher-Yates algorithm with optional seed
 */
export function shuffleDeck(deck: Card[], seed?: string): Card[] {
  const rng = seed ? seedrandom(seed) : Math.random;
  const shuffled = [...deck];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  return shuffled;
}

/**
 * Get rank value (2=2, ..., A=14)
 */
export function getRankValue(rank: string): number {
  const index = RANKS.indexOf(rank as Rank);
  return index + 2;
}

/**
 * Parse a card string like "As" or "Th" into a Card object
 */
export function parseCard(str: string): Card {
  const rank = str[0]!;
  const suit = str[1] as Suit;
  return { rank, suit };
}

/**
 * Convert card to string like "As" or "Th"
 */
export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

/**
 * Compare cards by rank
 */
export function compareCards(a: Card, b: Card): number {
  return getRankValue(b.rank) - getRankValue(a.rank);
}
