"use client"

/**
 * An animated poker hand display for the hero section.
 * Shows a dealing animation with community cards being revealed.
 */

import { useEffect, useState } from "react"

const SUIT_MAP: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
}

const SUIT_COLOR: Record<string, string> = {
  s: "text-slate-200",
  h: "text-red-400",
  d: "text-red-400",
  c: "text-slate-200",
}

interface CardData {
  rank: string
  suit: string
}

const HERO_HANDS: CardData[][] = [
  [
    { rank: "A", suit: "s" },
    { rank: "K", suit: "s" },
    { rank: "Q", suit: "h" },
    { rank: "J", suit: "d" },
    { rank: "10", suit: "c" },
  ],
  [
    { rank: "A", suit: "h" },
    { rank: "A", suit: "d" },
    { rank: "K", suit: "h" },
    { rank: "K", suit: "d" },
    { rank: "K", suit: "c" },
  ],
  [
    { rank: "9", suit: "h" },
    { rank: "10", suit: "h" },
    { rank: "J", suit: "h" },
    { rank: "Q", suit: "h" },
    { rank: "K", suit: "h" },
  ],
]

function MiniCard({ card, revealed, delay }: { card: CardData; revealed: boolean; delay: number }) {
  const sym = SUIT_MAP[card.suit] ?? card.suit
  const color = SUIT_COLOR[card.suit] ?? "text-slate-200"

  return (
    <span
      className="inline-block transition-all duration-500"
      style={{ transitionDelay: `${delay}ms` }}
    >
      {revealed ? (
        <span>
          <span className="text-slate-600">{"["}</span>
          <span className={color}>
            {card.rank.padEnd(2)}
            {sym}
          </span>
          <span className="text-slate-600">{"]"}</span>
        </span>
      ) : (
        <span className="text-slate-700">{"[░░░]"}</span>
      )}
    </span>
  )
}

export function AsciiHeroHand({ className = "" }: { className?: string }) {
  const [handIndex, setHandIndex] = useState(0)
  const [revealedCount, setRevealedCount] = useState(0)

  useEffect(() => {
    const revealTimer = setInterval(() => {
      setRevealedCount((prev) => {
        if (prev >= 5) return prev
        return prev + 1
      })
    }, 600)

    return () => clearInterval(revealTimer)
  }, [handIndex])

  useEffect(() => {
    if (revealedCount < 5) return

    const nextTimer = setTimeout(() => {
      setRevealedCount(0)
      setHandIndex((prev) => (prev + 1) % HERO_HANDS.length)
    }, 3000)

    return () => clearTimeout(nextTimer)
  }, [revealedCount])

  const hand = HERO_HANDS[handIndex]

  return (
    <div className={`font-mono text-sm sm:text-base select-none ${className}`}>
      <div className="text-slate-600 text-center">
        {"╔═══════════════════════════════════════╗"}
      </div>
      <div className="text-slate-600 text-center">
        {"║                                       ║"}
      </div>
      <div className="text-slate-600 text-center">
        {"║   "}
        <span className="inline-flex gap-1">
          {hand.map((card, i) => (
            <MiniCard
              key={`${handIndex}-${i}`}
              card={card}
              revealed={i < revealedCount}
              delay={i * 100}
            />
          ))}
        </span>
        {"   ║"}
      </div>
      <div className="text-slate-600 text-center">
        {"║                                       ║"}
      </div>
      <div className="text-slate-600 text-center">
        {"╚═══════════════════════════════════════╝"}
      </div>
    </div>
  )
}
