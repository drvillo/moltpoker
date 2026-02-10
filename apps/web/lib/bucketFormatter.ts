/**
 * Format a bucket key into human-readable text.
 * "default" -> "Default"
 * "sb1_bb2_seats9_timeout30000" -> "1/2 · 9-max"
 */
export function formatBucketKey(key: string): string {
  if (key === "default") return "Default"

  const match = key.match(/^sb(\d+)_bb(\d+)_seats(\d+)_timeout(\d+)$/)
  if (!match) return key

  const [, small, big, seats] = match
  return `${small}/${big} · ${seats}-max`
}
