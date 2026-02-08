import type { Card } from '@moltpoker/shared'
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { createDeck } from '../src/deck.js'
import { evaluateHand, compareHands, HandRanks } from '../src/handEvaluator.js'

// ─── Generators ─────────────────────────────────────────────────────────────

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const
const SUITS = ['s', 'h', 'd', 'c'] as const

/** Generate a single card */
const cardArb: fc.Arbitrary<Card> = fc
  .tuple(
    fc.constantFrom(...RANKS),
    fc.constantFrom(...SUITS),
  )
  .map(([rank, suit]) => ({ rank, suit }))

/** Generate a set of N unique cards from the full deck */
function uniqueCards(n: number): fc.Arbitrary<Card[]> {
  const fullDeck = createDeck()
  return fc
    .shuffledSubarray(fullDeck, { minLength: n, maxLength: n })
}

/** Generate a valid 7-card deal: 2 hole + 5 community, all unique */
function validDeal(): fc.Arbitrary<{ hole: Card[]; community: Card[] }> {
  return uniqueCards(7).map((cards) => ({
    hole: cards.slice(0, 2),
    community: cards.slice(2, 7),
  }))
}

/** Generate two non-overlapping hands on the same board */
function twoPlayerDeal(): fc.Arbitrary<{
  hole1: Card[]
  hole2: Card[]
  community: Card[]
}> {
  return uniqueCards(9).map((cards) => ({
    hole1: cards.slice(0, 2),
    hole2: cards.slice(2, 4),
    community: cards.slice(4, 9),
  }))
}

// ─── Configuration ──────────────────────────────────────────────────────────

// Default iterations. Increase locally for more thorough runs:
//   NUM_RUNS=10000 pnpm --filter @moltpoker/poker test
const NUM_RUNS = Number(process.env.NUM_RUNS ?? 200)

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property-based tests', () => {
  describe('hand evaluation fundamentals', () => {
    it('evaluateHand always returns a valid rank', () => {
      const validRanks = new Set(Object.values(HandRanks))

      fc.assert(
        fc.property(validDeal(), ({ hole, community }) => {
          const result = evaluateHand(hole, community)
          expect(validRanks.has(result.rank)).toBe(true)
          expect(result.cards).toHaveLength(5)
          expect(result.kickers.length).toBeGreaterThan(0)
          expect(result.description.length).toBeGreaterThan(0)
          expect(result.rankName).toBeDefined()
        }),
        { numRuns: NUM_RUNS },
      )
    })

    it('evaluateHand selects exactly 5 cards', () => {
      fc.assert(
        fc.property(validDeal(), ({ hole, community }) => {
          const result = evaluateHand(hole, community)
          expect(result.cards).toHaveLength(5)
        }),
        { numRuns: NUM_RUNS },
      )
    })

    it('best 5 cards are a subset of the 7 dealt cards', () => {
      fc.assert(
        fc.property(validDeal(), ({ hole, community }) => {
          const result = evaluateHand(hole, community)
          const allCards = [...hole, ...community]
          const allCardStrings = new Set(
            allCards.map((c) => `${c.rank}${c.suit}`),
          )

          for (const c of result.cards) {
            expect(allCardStrings.has(`${c.rank}${c.suit}`)).toBe(true)
          }
        }),
        { numRuns: NUM_RUNS },
      )
    })
  })

  describe('compareHands ordering properties', () => {
    it('antisymmetry: compareHands(a, b) === -compareHands(b, a)', () => {
      fc.assert(
        fc.property(twoPlayerDeal(), ({ hole1, hole2, community }) => {
          const evalA = evaluateHand(hole1, community)
          const evalB = evaluateHand(hole2, community)

          const ab = compareHands(evalA, evalB)
          const ba = compareHands(evalB, evalA)

          // Sum of opposite comparisons must be zero (avoids +0/-0 issues)
          expect(ab + ba).toBe(0)
          // If one is positive, the other must be negative (or both zero)
          if (ab > 0) expect(ba).toBeLessThan(0)
          if (ab < 0) expect(ba).toBeGreaterThan(0)
          if (ab === 0) expect(ba).toBe(0)
        }),
        { numRuns: NUM_RUNS },
      )
    })

    it('reflexivity: any hand ties with itself', () => {
      fc.assert(
        fc.property(validDeal(), ({ hole, community }) => {
          const evaluation = evaluateHand(hole, community)
          expect(compareHands(evaluation, evaluation)).toBe(0)
        }),
        { numRuns: NUM_RUNS },
      )
    })

    it('transitivity: if a > b and b > c then a > c', () => {
      // Generate three non-overlapping hands on the same board
      const threePlayerDeal = uniqueCards(11).map((cards) => ({
        hole1: cards.slice(0, 2),
        hole2: cards.slice(2, 4),
        hole3: cards.slice(4, 6),
        community: cards.slice(6, 11),
      }))

      fc.assert(
        fc.property(threePlayerDeal, ({ hole1, hole2, hole3, community }) => {
          const a = evaluateHand(hole1, community)
          const b = evaluateHand(hole2, community)
          const c = evaluateHand(hole3, community)

          const ab = compareHands(a, b)
          const bc = compareHands(b, c)
          const ac = compareHands(a, c)

          if (ab > 0 && bc > 0) expect(ac).toBeGreaterThan(0)
          if (ab < 0 && bc < 0) expect(ac).toBeLessThan(0)
          if (ab === 0 && bc === 0) expect(ac).toBe(0)
        }),
        { numRuns: NUM_RUNS },
      )
    })
  })

  describe('hand rank monotonicity', () => {
    it('royal flush always beats any non-royal-flush hand', () => {
      // Generate a random non-flush hand and compare against a fixed royal flush
      const royalHole: Card[] = [
        { rank: 'A', suit: 's' },
        { rank: 'K', suit: 's' },
      ]
      const royalBoard: Card[] = [
        { rank: 'Q', suit: 's' },
        { rank: 'J', suit: 's' },
        { rank: 'T', suit: 's' },
      ]
      const royalEval = evaluateHand(royalHole, royalBoard)

      // Generate random hands that don't use the royal flush cards
      const usedCards = new Set([...royalHole, ...royalBoard].map((c) => `${c.rank}${c.suit}`))
      const remainingDeck = createDeck().filter(
        (c) => !usedCards.has(`${c.rank}${c.suit}`),
      )

      const nonRoyalDeal = fc
        .shuffledSubarray(remainingDeck, { minLength: 7, maxLength: 7 })
        .map((cards) => ({
          hole: cards.slice(0, 2),
          community: cards.slice(2, 7),
        }))

      fc.assert(
        fc.property(nonRoyalDeal, ({ hole, community }) => {
          const otherEval = evaluateHand(hole, community)
          if (otherEval.rank < HandRanks.ROYAL_FLUSH) {
            expect(compareHands(royalEval, otherEval)).toBeGreaterThan(0)
          }
        }),
        { numRuns: NUM_RUNS },
      )
    })

    it('higher rank category always beats lower rank category', () => {
      fc.assert(
        fc.property(twoPlayerDeal(), ({ hole1, hole2, community }) => {
          const a = evaluateHand(hole1, community)
          const b = evaluateHand(hole2, community)

          if (a.rank > b.rank) {
            expect(compareHands(a, b)).toBeGreaterThan(0)
          } else if (a.rank < b.rank) {
            expect(compareHands(a, b)).toBeLessThan(0)
          }
          // If ranks are equal, kickers decide (or tie) -- no constraint here
        }),
        { numRuns: NUM_RUNS },
      )
    })
  })

  describe('deck integrity under random deals', () => {
    it('all 7 dealt cards are unique', () => {
      fc.assert(
        fc.property(validDeal(), ({ hole, community }) => {
          const all = [...hole, ...community]
          const cardStrings = all.map((c) => `${c.rank}${c.suit}`)
          const uniqueSet = new Set(cardStrings)
          expect(uniqueSet.size).toBe(7)
        }),
        { numRuns: NUM_RUNS },
      )
    })

    it('9 dealt cards for two players are all unique', () => {
      fc.assert(
        fc.property(twoPlayerDeal(), ({ hole1, hole2, community }) => {
          const all = [...hole1, ...hole2, ...community]
          const cardStrings = all.map((c) => `${c.rank}${c.suit}`)
          const uniqueSet = new Set(cardStrings)
          expect(uniqueSet.size).toBe(9)
        }),
        { numRuns: NUM_RUNS },
      )
    })
  })

  describe('evaluation consistency', () => {
    it('same cards always produce same evaluation', () => {
      fc.assert(
        fc.property(validDeal(), ({ hole, community }) => {
          const eval1 = evaluateHand(hole, community)
          const eval2 = evaluateHand(hole, community)

          expect(eval1.rank).toBe(eval2.rank)
          expect(eval1.rankName).toBe(eval2.rankName)
          expect(eval1.kickers).toEqual(eval2.kickers)
          expect(compareHands(eval1, eval2)).toBe(0)
        }),
        { numRuns: NUM_RUNS },
      )
    })

    it('order of hole cards does not affect evaluation', () => {
      fc.assert(
        fc.property(validDeal(), ({ hole, community }) => {
          const eval1 = evaluateHand(hole, community)
          const eval2 = evaluateHand([hole[1]!, hole[0]!], community)

          expect(eval1.rank).toBe(eval2.rank)
          expect(eval1.rankName).toBe(eval2.rankName)
          expect(eval1.kickers).toEqual(eval2.kickers)
        }),
        { numRuns: NUM_RUNS },
      )
    })

    it('order of community cards does not affect evaluation', () => {
      fc.assert(
        fc.property(validDeal(), ({ hole, community }) => {
          const eval1 = evaluateHand(hole, community)
          const reversed = [...community].reverse()
          const eval2 = evaluateHand(hole, reversed)

          expect(eval1.rank).toBe(eval2.rank)
          expect(eval1.rankName).toBe(eval2.rankName)
          expect(eval1.kickers).toEqual(eval2.kickers)
        }),
        { numRuns: NUM_RUNS },
      )
    })
  })
})
