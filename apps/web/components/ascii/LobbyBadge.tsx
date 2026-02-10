import { formatBucketKey } from "@/lib/bucketFormatter"

interface LobbyBadgeProps {
  bucketKey: string
  isActiveLobby?: boolean
}

export function LobbyBadge({ bucketKey, isActiveLobby }: LobbyBadgeProps) {
  const label = bucketKey === "default" ? "LOBBY" : formatBucketKey(bucketKey)

  return (
    <span
      className={`font-mono text-xs border rounded px-2 py-0.5 ${
        isActiveLobby
          ? "text-amber-300 border-amber-400/40 animate-pulse"
          : "text-slate-400 border-slate-600"
      }`}
    >
      ⬡ {label}
    </span>
  )
}
