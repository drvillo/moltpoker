import type { PublicTableListItem } from "@/lib/publicApi"
import type { FinalStanding } from "@/lib/replayState"

/**
 * Build final standings from a table list item (e.g. for ended tables).
 * Filters seated players, sorts by stack descending, adds netChange.
 */
export function getStandingsFromTable(table: PublicTableListItem): FinalStanding[] {
  const { initialStack } = table.config
  return table.seats
    .filter((s) => s.agentId != null)
    .sort((a, b) => b.stack - a.stack)
    .map((s) => ({
      seatId: s.seatId,
      agentId: s.agentId!,
      agentName: s.agentName ?? null,
      stack: s.stack,
      netChange: s.stack - initialStack,
    }))
}
