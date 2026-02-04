import type { GameStatePayload } from '@moltpoker/shared';

import type { TableRuntime } from './runtime.js';

/**
 * Get a game state snapshot for a specific seat (includes their hole cards)
 */
export function getSnapshotForSeat(runtime: TableRuntime, seatId: number): GameStatePayload {
  return runtime.getStateForSeat(seatId);
}

/**
 * Get a public game state snapshot (no hole cards - for observers)
 */
export function getPublicSnapshot(runtime: TableRuntime): GameStatePayload {
  return runtime.getPublicState();
}

/**
 * Get snapshots for all seats at a table
 */
export function getAllSeatSnapshots(runtime: TableRuntime): Map<number, GameStatePayload> {
  const snapshots = new Map<number, GameStatePayload>();

  for (const player of runtime.getAllPlayers()) {
    snapshots.set(player.seatId, runtime.getStateForSeat(player.seatId));
  }

  return snapshots;
}
