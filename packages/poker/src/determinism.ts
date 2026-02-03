import seedrandom from 'seedrandom';

/**
 * Create a seeded random number generator
 */
export function createSeededRng(seed: string): () => number {
  return seedrandom(seed);
}

/**
 * Generate a random seed string
 */
export function generateRandomSeed(): string {
  return `seed-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create a hand-specific seed from a table seed and hand number
 */
export function createHandSeed(tableSeed: string, handNumber: number): string {
  return `${tableSeed}-hand-${handNumber}`;
}

/**
 * Shuffle an array using a seeded RNG
 */
export function seededShuffle<T>(array: T[], seed: string): T[] {
  const rng = createSeededRng(seed);
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }

  return result;
}

/**
 * Get a seeded random integer in range [min, max]
 */
export function seededRandomInt(seed: string, min: number, max: number): number {
  const rng = createSeededRng(seed);
  return Math.floor(rng() * (max - min + 1)) + min;
}
