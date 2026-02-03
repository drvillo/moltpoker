import { createHash, randomBytes, randomUUID } from 'crypto';

/**
 * Generate a random API key
 */
export function generateApiKey(): string {
  return `mpk_${randomBytes(32).toString('hex')}`;
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate a prefixed UUID
 */
export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Generate agent ID
 */
export function generateAgentId(): string {
  return generateId('agt');
}

/**
 * Generate table ID
 */
export function generateTableId(): string {
  return generateId('tbl');
}

/**
 * Generate session ID
 */
export function generateSessionId(): string {
  return generateId('ses');
}
