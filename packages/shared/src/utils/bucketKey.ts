import type { TableConfig } from '../types/index.js'

/** Default bucket key used when no specific bucket is requested */
export const DEFAULT_BUCKET_KEY = 'default'

/**
 * Generate a canonical bucket key from a table configuration.
 * Format: "sb{small}_bb{big}_seats{maxSeats}_timeout{ms}"
 */
export function generateBucketKey(config: Pick<TableConfig, 'blinds' | 'maxSeats' | 'actionTimeoutMs'>): string {
  const { blinds, maxSeats, actionTimeoutMs } = config
  return `sb${blinds.small}_bb${blinds.big}_seats${maxSeats}_timeout${actionTimeoutMs}`
}

/**
 * Parse a canonical bucket key back into partial table config.
 * Returns null if the key doesn't match the expected format.
 */
export function parseBucketKey(key: string): Pick<TableConfig, 'blinds' | 'maxSeats' | 'actionTimeoutMs'> | null {
  if (key === DEFAULT_BUCKET_KEY) return null

  const match = key.match(/^sb(\d+)_bb(\d+)_seats(\d+)_timeout(\d+)$/)
  if (!match) return null

  const [, small, big, seats, timeout] = match
  return {
    blinds: { small: Number(small), big: Number(big) },
    maxSeats: Number(seats),
    actionTimeoutMs: Number(timeout),
  }
}
