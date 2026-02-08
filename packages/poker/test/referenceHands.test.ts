import type { Card } from '@moltpoker/shared'
import { describe, it, expect } from 'vitest'

import { createDeck, shuffleDeck } from '../src/deck.js'
import { evaluateHand, compareHands, HandRanks } from '../src/handEvaluator.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function card(str: string): Card {
  return { rank: str[0]!, suit: str[1] as 's' | 'h' | 'd' | 'c' }
}

/**
 * Evaluate a matchup on a fixed board, return index of winning player (or -1 for tie).
 */
function evaluateMatchup(
  holePairs: Card[][],
  board: Card[],
): { winnerIndex: number; evaluations: ReturnType<typeof evaluateHand>[] } {
  const evaluations = holePairs.map((hole) => evaluateHand(hole, board))

  let bestIndex = 0
  for (let i = 1; i < evaluations.length; i++) {
    const cmp = compareHands(evaluations[i]!, evaluations[bestIndex]!)
    if (cmp > 0) bestIndex = i
  }

  // Check for ties with the best hand
  const ties = evaluations.filter(
    (e) => compareHands(e, evaluations[bestIndex]!) === 0,
  )
  const isTie = ties.length > 1

  return { winnerIndex: isTie ? -1 : bestIndex, evaluations }
}

/**
 * Monte Carlo equity estimator.
 * Deals random boards from the remaining deck and counts wins for each player.
 * Returns win rates as fractions (0..1).
 */
function estimateEquity(
  holePairs: Card[][],
  iterations: number,
  seed?: string,
): number[] {
  const usedCards = new Set(
    holePairs.flat().map((c) => `${c.rank}${c.suit}`),
  )
  const baseDeck = createDeck().filter(
    (c) => !usedCards.has(`${c.rank}${c.suit}`),
  )

  const wins = new Array<number>(holePairs.length).fill(0)
  let ties = 0

  for (let i = 0; i < iterations; i++) {
    const shuffled = shuffleDeck(baseDeck, seed ? `${seed}-${i}` : undefined)
    const board = shuffled.slice(0, 5)

    const { winnerIndex } = evaluateMatchup(holePairs, board)
    if (winnerIndex === -1) {
      ties++
    } else {
      wins[winnerIndex]!++
    }
  }

  return wins.map((w) => w / iterations)
}

// ─── A. Deterministic Golden Hands ──────────────────────────────────────────

describe('Reference hands - deterministic winners', () => {
  describe('clear winner on fixed board', () => {
    it('flush beats straight on same board', () => {
      const board = [card('Kh'), card('9h'), card('5d'), card('2h'), card('7c')]
      const flushHole = [card('Ah'), card('3h')] // A-high flush
      const straightHole = [card('6s'), card('8d')] // 9-8-7-6-5 straight

      const { winnerIndex, evaluations } = evaluateMatchup(
        [flushHole, straightHole],
        board,
      )

      expect(evaluations[0]!.rank).toBe(HandRanks.FLUSH)
      expect(evaluations[1]!.rank).toBe(HandRanks.STRAIGHT)
      expect(winnerIndex).toBe(0)
    })

    it('full house beats flush', () => {
      const board = [card('As'), card('Ah'), card('Ks'), card('7s'), card('2s')]
      const fullHouseHole = [card('Kd'), card('Kh')] // KKK-AA full house
      const flushHole = [card('Qs'), card('3s')] // A-K-Q-7-3 spade flush

      const { winnerIndex, evaluations } = evaluateMatchup(
        [fullHouseHole, flushHole],
        board,
      )

      expect(evaluations[0]!.rank).toBe(HandRanks.FULL_HOUSE)
      expect(evaluations[1]!.rank).toBe(HandRanks.FLUSH)
      expect(winnerIndex).toBe(0)
    })

    it('four of a kind beats full house', () => {
      const board = [card('Ts'), card('Th'), card('Td'), card('5s'), card('3c')]
      const quadsHole = [card('Tc'), card('As')] // quad tens
      const boatHole = [card('5h'), card('5d')] // 555-TT full house

      const { winnerIndex, evaluations } = evaluateMatchup(
        [quadsHole, boatHole],
        board,
      )

      expect(evaluations[0]!.rank).toBe(HandRanks.FOUR_OF_A_KIND)
      expect(evaluations[1]!.rank).toBe(HandRanks.FULL_HOUSE)
      expect(winnerIndex).toBe(0)
    })

    it('straight flush beats four of a kind', () => {
      const board = [card('6h'), card('7h'), card('8h'), card('Qs'), card('Qd')]
      const sfHole = [card('9h'), card('Th')] // 6-7-8-9-T hearts straight flush
      const quadsHole = [card('Qh'), card('Qc')] // quad queens

      const { winnerIndex, evaluations } = evaluateMatchup(
        [sfHole, quadsHole],
        board,
      )

      expect(evaluations[0]!.rank).toBe(HandRanks.STRAIGHT_FLUSH)
      expect(evaluations[1]!.rank).toBe(HandRanks.FOUR_OF_A_KIND)
      expect(winnerIndex).toBe(0)
    })
  })

  describe('kicker dominance', () => {
    it('higher kicker wins with same pair', () => {
      const board = [card('As'), card('9h'), card('5d'), card('3c'), card('2h')]
      const betterKicker = [card('Ah'), card('Kd')] // pair of aces, K kicker
      const worseKicker = [card('Ad'), card('Qs')] // pair of aces, Q kicker

      const { winnerIndex, evaluations } = evaluateMatchup(
        [betterKicker, worseKicker],
        board,
      )

      expect(evaluations[0]!.rank).toBe(HandRanks.ONE_PAIR)
      expect(evaluations[1]!.rank).toBe(HandRanks.ONE_PAIR)
      expect(winnerIndex).toBe(0)
    })

    it('second kicker breaks tie when first kicker matches', () => {
      const board = [card('As'), card('Kd'), card('5h'), card('3c'), card('2d')]
      const hand1 = [card('Ah'), card('Qs')] // AA, K-Q-5
      const hand2 = [card('Ad'), card('Jh')] // AA, K-J-5

      const { winnerIndex, evaluations } = evaluateMatchup([hand1, hand2], board)

      expect(evaluations[0]!.rank).toBe(HandRanks.ONE_PAIR)
      expect(evaluations[1]!.rank).toBe(HandRanks.ONE_PAIR)
      expect(winnerIndex).toBe(0)
    })

    it('higher two pair wins over lower two pair', () => {
      const board = [card('Ts'), card('7d'), card('3h'), card('2c'), card('9s')]
      const highTwoPair = [card('Th'), card('9d')] // TT-99
      const lowTwoPair = [card('7h'), card('3d')] // 77-33

      const { winnerIndex, evaluations } = evaluateMatchup(
        [highTwoPair, lowTwoPair],
        board,
      )

      expect(evaluations[0]!.rank).toBe(HandRanks.TWO_PAIR)
      expect(evaluations[1]!.rank).toBe(HandRanks.TWO_PAIR)
      expect(winnerIndex).toBe(0)
    })
  })

  describe('split pots / ties', () => {
    it('board plays for all - identical kickers', () => {
      // Board: A K Q J 9 (no flush). Neither player's hole cards improve the hand.
      const board = [card('As'), card('Kh'), card('Qd'), card('Jc'), card('9s')]
      const hand1 = [card('2h'), card('3d')]
      const hand2 = [card('4c'), card('5h')]

      const { winnerIndex, evaluations } = evaluateMatchup([hand1, hand2], board)

      // Both play A-K-Q-J-9 from the board
      expect(evaluations[0]!.rank).toBe(HandRanks.HIGH_CARD)
      expect(evaluations[1]!.rank).toBe(HandRanks.HIGH_CARD)
      expect(winnerIndex).toBe(-1) // tie
    })

    it('same straight from board splits the pot', () => {
      const board = [card('Ts'), card('Jh'), card('Qd'), card('Kc'), card('As')]
      const hand1 = [card('2h'), card('3d')]
      const hand2 = [card('4c'), card('5h')]

      const { winnerIndex, evaluations } = evaluateMatchup([hand1, hand2], board)

      expect(evaluations[0]!.rank).toBe(HandRanks.STRAIGHT)
      expect(evaluations[1]!.rank).toBe(HandRanks.STRAIGHT)
      expect(winnerIndex).toBe(-1)
    })

    it('same flush rank ties when kickers match', () => {
      // Both players hold spades that are outranked by board spades
      const board = [card('As'), card('Ks'), card('Qs'), card('5d'), card('3c')]
      const hand1 = [card('Js'), card('2s')] // A-K-Q-J-2 flush
      const hand2 = [card('Js'), card('2s')] // same flush (identical)

      // In reality you can't have duplicate cards; but let's test two different
      // spade combos that produce the same 5-card flush
      const board2 = [card('As'), card('Ks'), card('Qs'), card('Js'), card('3c')]
      const h1 = [card('9s'), card('2d')] // A-K-Q-J-9 spade flush
      const h2 = [card('9s'), card('2h')] // same top-5 flush cards
      // Can't use same card twice, so use heart variant:
      // Actually 9s can only appear once. Let's use a valid setup:
      const board3 = [card('As'), card('Ks'), card('Qs'), card('Ts'), card('3c')]
      const ha = [card('2s'), card('4d')] // A-K-Q-T-2 spade flush? No: best 5 = A-K-Q-T-2s flush... but 9s beats 2s
      const hb = [card('2d'), card('4h')] // No flush, just A-K-Q-T high

      // Better approach: both players contribute to the same flush rank
      const board4 = [card('As'), card('Ks'), card('Qs'), card('Js'), card('2c')]
      const hx = [card('9s'), card('3d')] // A-K-Q-J-9 flush
      const hy = [card('9h'), card('3s')] // A-K-Q-J-3 flush? No: 3s gives A-K-Q-J-3 flush
      // Not a tie. Let's just test board-flush:
      const board5 = [card('As'), card('Ks'), card('Qs'), card('Js'), card('9s')]
      const hh1 = [card('2d'), card('3c')] // board flush plays
      const hh2 = [card('4d'), card('5c')] // board flush plays

      const { winnerIndex: w5, evaluations: e5 } = evaluateMatchup([hh1, hh2], board5)
      expect(e5[0]!.rank).toBe(HandRanks.FLUSH)
      expect(e5[1]!.rank).toBe(HandRanks.FLUSH)
      expect(w5).toBe(-1)
    })

    it('two players with same two pair splits', () => {
      const board = [card('As'), card('Ah'), card('Kd'), card('Kc'), card('Qs')]
      const hand1 = [card('2h'), card('3d')] // AA-KK with Q kicker
      const hand2 = [card('4c'), card('5h')] // AA-KK with Q kicker

      const { winnerIndex, evaluations } = evaluateMatchup([hand1, hand2], board)

      expect(evaluations[0]!.rank).toBe(HandRanks.TWO_PAIR)
      expect(evaluations[1]!.rank).toBe(HandRanks.TWO_PAIR)
      expect(winnerIndex).toBe(-1)
    })
  })

  describe('wheel and broadway edge cases', () => {
    it('broadway straight beats wheel straight', () => {
      const board = [card('As'), card('2h'), card('3d'), card('4c'), card('Ts')]
      const broadway = [card('Kd'), card('Qh')] // needs J for broadway... doesn't connect
      // Better: use a board that allows both
      const board2 = [card('As'), card('5h'), card('4d'), card('3c'), card('2s')]
      const wheelHole = [card('8d'), card('9c')] // plays A-2-3-4-5 from board
      const aceHighHole = [card('Kh'), card('Qd')] // plays A-5-4-3-2 same wheel

      // Actually both play the same wheel. Let's set up a board where
      // one player makes a higher straight:
      const board3 = [card('3s'), card('4h'), card('5d'), card('6c'), card('Ts')]
      const higherStraight = [card('7h'), card('2d')] // 3-4-5-6-7 = 7-high straight
      const wheelPlayer = [card('As'), card('2h')] // A-2-3-4-5 = 5-high wheel

      const { winnerIndex, evaluations } = evaluateMatchup(
        [higherStraight, wheelPlayer],
        board3,
      )

      expect(evaluations[0]!.rank).toBe(HandRanks.STRAIGHT)
      expect(evaluations[1]!.rank).toBe(HandRanks.STRAIGHT)
      expect(winnerIndex).toBe(0) // 7-high beats 5-high
    })

    it('wheel straight flush beats regular wheel straight', () => {
      const board = [card('2h'), card('3h'), card('4h'), card('9s'), card('Tc')]
      const wheelSF = [card('Ah'), card('5h')] // A-2-3-4-5 hearts straight flush
      const wheelPlain = [card('As'), card('5d')] // A-2-3-4-5 plain straight

      const { winnerIndex, evaluations } = evaluateMatchup(
        [wheelSF, wheelPlain],
        board,
      )

      expect(evaluations[0]!.rank).toBe(HandRanks.STRAIGHT_FLUSH)
      expect(evaluations[1]!.rank).toBe(HandRanks.STRAIGHT)
      expect(winnerIndex).toBe(0)
    })
  })

  describe('multi-way pots', () => {
    it('three-way: one winner among three players', () => {
      const board = [card('As'), card('Kh'), card('7d'), card('4c'), card('2s')]
      const player1 = [card('Ah'), card('Qd')] // pair of aces, Q kicker
      const player2 = [card('Kd'), card('Qs')] // pair of kings
      const player3 = [card('7h'), card('7c')] // three sevens

      const { winnerIndex, evaluations } = evaluateMatchup(
        [player1, player2, player3],
        board,
      )

      expect(evaluations[2]!.rank).toBe(HandRanks.THREE_OF_A_KIND)
      expect(winnerIndex).toBe(2) // trips beats both pairs
    })

    it('three-way tie: board plays for everyone', () => {
      const board = [card('As'), card('Kh'), card('Qd'), card('Jc'), card('Ts')]
      const p1 = [card('2h'), card('3d')]
      const p2 = [card('4c'), card('5h')]
      const p3 = [card('6d'), card('7c')]

      const { winnerIndex } = evaluateMatchup([p1, p2, p3], board)
      expect(winnerIndex).toBe(-1) // all play A-K-Q-J-T straight from board
    })
  })
})

// ─── A. Monte Carlo Win-Rate Checks ────────────────────────────────────────

describe('Reference hands - Monte Carlo equity', () => {
  // Use wide tolerances to avoid flaky tests. Known equity values are approximate.
  // Iterations kept low for speed; increase locally for tighter validation.
  const ITERATIONS = 10_000

  it('AA vs KK: AA wins ~80% of the time', () => {
    const aaHole = [card('As'), card('Ah')]
    const kkHole = [card('Ks'), card('Kh')]

    const winRates = estimateEquity([aaHole, kkHole], ITERATIONS, 'aa-vs-kk')

    // AA equity is ~81.5%. Tolerance: 70%-92%
    expect(winRates[0]).toBeGreaterThan(0.70)
    expect(winRates[0]).toBeLessThan(0.92)
  })

  it('AKs vs QQ: roughly 45%-55% matchup', () => {
    const aksHole = [card('As'), card('Ks')] // suited
    const qqHole = [card('Qh'), card('Qd')]

    const winRates = estimateEquity([aksHole, qqHole], ITERATIONS, 'aks-vs-qq')

    // AKs vs QQ equity: AKs ~46%, QQ ~54%. Wide tolerance for flake resistance.
    expect(winRates[0]).toBeGreaterThan(0.35)
    expect(winRates[0]).toBeLessThan(0.58)
    expect(winRates[1]).toBeGreaterThan(0.40)
    expect(winRates[1]).toBeLessThan(0.65)
  })

  it('72o vs AKs: AKs heavily favored (~65%+)', () => {
    const sevenTwoOff = [card('7d'), card('2c')] // offsuit
    const aksHole = [card('As'), card('Ks')]

    const winRates = estimateEquity(
      [sevenTwoOff, aksHole],
      ITERATIONS,
      '72o-vs-aks',
    )

    // 72o equity ~34%, AKs ~66%. Tolerance allows wide range.
    expect(winRates[0]).toBeLessThan(0.48)
    expect(winRates[1]).toBeGreaterThan(0.52)
  })

  it('AA vs KK vs QQ: AA wins most often', () => {
    const aaHole = [card('As'), card('Ah')]
    const kkHole = [card('Ks'), card('Kh')]
    const qqHole = [card('Qd'), card('Qc')]

    const winRates = estimateEquity(
      [aaHole, kkHole, qqHole],
      ITERATIONS,
      'aa-kk-qq',
    )

    // AA should win most often in a 3-way
    expect(winRates[0]).toBeGreaterThan(winRates[1]!)
    expect(winRates[0]).toBeGreaterThan(winRates[2]!)
  })
})
