export type TableStatus = "waiting" | "running" | "ended"

const STATUS_CONFIG: Record<
  TableStatus,
  { dot: string; label: string; dotColor: string; badgeClasses: string }
> = {
  running: {
    dot: "●",
    label: "LIVE",
    dotColor: "text-green-400",
    badgeClasses: "text-green-400 border-green-400/30",
  },
  waiting: {
    dot: "●",
    label: "WAITING",
    dotColor: "text-amber-400",
    badgeClasses: "text-amber-400 border-amber-400/30",
  },
  ended: {
    dot: "●",
    label: "ENDED",
    dotColor: "text-red-400",
    badgeClasses: "text-slate-500 border-slate-700",
  },
}

interface StatusBadgeProps {
  status: string
  variant?: "badge" | "inline"
}

export function StatusBadge({ status, variant = "badge" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status as TableStatus]
  if (!config) return null

  const { dot, label, dotColor, badgeClasses } = config

  if (variant === "inline") {
    return (
      <span className="font-mono text-xs text-slate-500">
        <span className={dotColor}>{dot}</span> {label}
      </span>
    )
  }

  return (
    <span
      className={`font-mono text-xs border rounded px-2 py-0.5 ${badgeClasses}`}
    >
      <span className={dotColor}>{dot}</span> {label}
    </span>
  )
}
