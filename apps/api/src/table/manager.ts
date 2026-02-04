import { TableRuntime, type TableRuntimeConfig } from '@moltpoker/poker';
import type { TableConfig } from '@moltpoker/shared';

import { EventLogger } from '../services/eventLogger.js';

export interface ManagedTable {
  runtime: TableRuntime;
  eventLogger: EventLogger;
  timeouts: Map<number, NodeJS.Timeout>; // seatId -> timeout
}

/**
 * Table runtime manager
 */
class TableManager {
  private tables: Map<string, ManagedTable> = new Map();

  /**
   * Create and register a new table runtime
   */
  async create(
    tableId: string,
    config: TableConfig,
    seed?: string
  ): Promise<ManagedTable> {
    if (this.tables.has(tableId)) {
      throw new Error(`Table ${tableId} already exists`);
    }

    const runtimeConfig: TableRuntimeConfig = {
      tableId,
      blinds: config.blinds,
      maxSeats: config.maxSeats,
      initialStack: config.initialStack,
      actionTimeoutMs: config.actionTimeoutMs,
      seed,
    };

    const runtime = new TableRuntime(runtimeConfig);
    const eventLogger = await EventLogger.create(tableId);

    const managedTable: ManagedTable = {
      runtime,
      eventLogger,
      timeouts: new Map(),
    };

    this.tables.set(tableId, managedTable);
    return managedTable;
  }

  /**
   * Get a managed table by ID
   */
  get(tableId: string): ManagedTable | undefined {
    return this.tables.get(tableId);
  }

  /**
   * Check if a table exists
   */
  has(tableId: string): boolean {
    return this.tables.has(tableId);
  }

  /**
   * Remove and clean up a table
   */
  destroy(tableId: string): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;

    // Clear all timeouts
    for (const timeout of table.timeouts.values()) {
      clearTimeout(timeout);
    }
    table.timeouts.clear();

    return this.tables.delete(tableId);
  }

  /**
   * Set a timeout for a player action
   */
  setActionTimeout(
    tableId: string,
    seatId: number,
    callback: () => void,
    timeoutMs: number
  ): void {
    const table = this.tables.get(tableId);
    if (!table) return;

    // Clear existing timeout for this seat
    this.clearActionTimeout(tableId, seatId);

    const timeout = setTimeout(() => {
      table.timeouts.delete(seatId);
      callback();
    }, timeoutMs);

    table.timeouts.set(seatId, timeout);
  }

  /**
   * Clear a timeout for a player action
   */
  clearActionTimeout(tableId: string, seatId: number): void {
    const table = this.tables.get(tableId);
    if (!table) return;

    const timeout = table.timeouts.get(seatId);
    if (timeout) {
      clearTimeout(timeout);
      table.timeouts.delete(seatId);
    }
  }

  /**
   * Get all active table IDs
   */
  getTableIds(): string[] {
    return [...this.tables.keys()];
  }

  /**
   * Get table count
   */
  get size(): number {
    return this.tables.size;
  }
}

// Export singleton instance
export const tableManager = new TableManager();
