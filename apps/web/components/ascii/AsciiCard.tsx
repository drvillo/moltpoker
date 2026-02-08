"use client"

interface AsciiCardProps {
  rank?: string
  suit?: string
  faceDown?: boolean
  size?: "sm" | "md" | "lg"
  highlighted?: boolean
  className?: string
  animated?: boolean
}

const SUIT_MAP: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
}

const SUIT_COLOR: Record<string, string> = {
  s: "text-slate-300",
  h: "text-red-400",
  d: "text-red-400",
  c: "text-slate-300",
}

export function AsciiCard({
  rank,
  suit,
  faceDown = false,
  size = "md",
  highlighted = false,
  className = "",
  animated = false,
}: AsciiCardProps) {
  const suitSymbol = suit ? SUIT_MAP[suit] ?? suit : ""
  const suitColor = suit ? SUIT_COLOR[suit] ?? "text-slate-300" : "text-slate-300"

  const sizeClasses = {
    sm: "text-[10px] leading-[12px]",
    md: "text-xs leading-[14px]",
    lg: "text-sm leading-4",
  }

  const borderColor = highlighted
    ? "text-amber-400"
    : "text-slate-600"

  const animClass = animated ? "animate-fade-in-up" : ""

  if (faceDown) {
    if (size === "sm") {
      return (
        <pre className={`font-mono ${sizeClasses[size]} text-slate-500 select-none inline-block ${animClass} ${className}`}>
{`┌───┐
│░░░│
│░░░│
└───┘`}
        </pre>
      )
    }
    return (
      <pre className={`font-mono ${sizeClasses[size]} text-slate-500 select-none inline-block ${animClass} ${className}`}>
{`┌─────────┐
│░░░░░░░░░│
│░░░░░░░░░│
│░░░░░░░░░│
│░░░░░░░░░│
│░░░░░░░░░│
└─────────┘`}
      </pre>
    )
  }

  const displayRank = rank ?? "?"
  const padR = displayRank.length === 1 ? " " : ""

  if (size === "sm") {
    return (
      <pre className={`font-mono ${sizeClasses[size]} select-none inline-block ${animClass} ${className}`}>
        <span className={borderColor}>{"┌───┐\n│"}</span>
        <span className={suitColor}>{`${displayRank}${padR}${suitSymbol}`}</span>
        <span className={borderColor}>{"│\n└───┘"}</span>
      </pre>
    )
  }

  return (
    <pre className={`font-mono ${sizeClasses[size]} select-none inline-block ${animClass} ${className}`}>
      <span className={borderColor}>{"┌─────────┐\n│ "}</span>
      <span className={suitColor}>{`${displayRank}${padR}`}</span>
      <span className={borderColor}>{"      │\n│         │\n│    "}</span>
      <span className={suitColor}>{suitSymbol}</span>
      <span className={borderColor}>{"    │\n│         │\n│      "}</span>
      <span className={suitColor}>{`${padR}${displayRank}`}</span>
      <span className={borderColor}>{" │\n└─────────┘"}</span>
    </pre>
  )
}

export function AsciiCardRow({
  cards,
  size = "md",
  animated = false,
}: {
  cards: Array<{ rank: string; suit: string }>
  size?: "sm" | "md" | "lg"
  animated?: boolean
}) {
  return (
    <div className="flex gap-1 sm:gap-2 flex-wrap justify-center">
      {cards.map((card, i) => (
        <AsciiCard
          key={`${card.rank}${card.suit}-${i}`}
          rank={card.rank}
          suit={card.suit}
          size={size}
          animated={animated}
          className={animated ? `delay-${i * 100}` : ""}
        />
      ))}
    </div>
  )
}
