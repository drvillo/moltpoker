import type { EventType } from '@moltpoker/shared';

import * as db from '../db.js';

/**
 * Event logger service for game events
 */
export class EventLogger {
  private tableId: string;
  private nextSeq: number = 1;
  private pendingEvents: Array<{
    seq: number;
    type: string;
    payload: Record<string, unknown>;
    handNumber?: number;
  }> = [];
  private flushPromise: Promise<void> | null = null;

  constructor(tableId: string, initialSeq: number = 1) {
    this.tableId = tableId;
    this.nextSeq = initialSeq;
  }

  /**
   * Initialize from database
   */
  static async create(tableId: string): Promise<EventLogger> {
    const lastSeq = await db.getLastEventSeq(tableId);
    return new EventLogger(tableId, lastSeq + 1);
  }

  /**
   * Get current sequence number
   */
  getSeq(): number {
    return this.nextSeq;
  }

  /**
   * Log an event
   */
  async log(
    type: EventType,
    payload: Record<string, unknown>,
    handNumber?: number
  ): Promise<number> {
    const seq = this.nextSeq++;

    this.pendingEvents.push({
      seq,
      type,
      payload,
      handNumber,
    });

    // Auto-flush
    await this.flush();

    return seq;
  }

  /**
   * Flush pending events to database
   */
  async flush(): Promise<void> {
    if (this.pendingEvents.length === 0) return;

    // Wait for any existing flush
    if (this.flushPromise) {
      await this.flushPromise;
    }

    const events = [...this.pendingEvents];
    this.pendingEvents = [];

    this.flushPromise = this.writeEvents(events);
    await this.flushPromise;
    this.flushPromise = null;
  }

  /**
   * Write events to database
   */
  private async writeEvents(
    events: Array<{
      seq: number;
      type: string;
      payload: Record<string, unknown>;
      handNumber?: number;
    }>
  ): Promise<void> {
    for (const event of events) {
      await db.createEvent(this.tableId, event.seq, event.type, event.payload, event.handNumber);
    }
  }

  /**
   * Get all events for this table
   */
  async getEvents(fromSeq?: number) {
    return db.getEvents(this.tableId, fromSeq);
  }
}
