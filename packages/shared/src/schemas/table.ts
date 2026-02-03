import { z } from 'zod';

import {
  DEFAULT_ACTION_TIMEOUT_MS,
  DEFAULT_BIG_BLIND,
  DEFAULT_INITIAL_STACK,
  DEFAULT_MAX_SEATS,
  DEFAULT_SMALL_BLIND,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
} from '../constants/protocol.js';

/**
 * Schema for blinds configuration
 */
export const BlindsSchema = z.object({
  small: z.number().int().positive().default(DEFAULT_SMALL_BLIND),
  big: z.number().int().positive().default(DEFAULT_BIG_BLIND),
});

/**
 * Schema for table configuration
 */
export const TableConfigSchema = z.object({
  blinds: BlindsSchema.default({ small: DEFAULT_SMALL_BLIND, big: DEFAULT_BIG_BLIND }),
  maxSeats: z.number().int().min(MIN_PLAYERS_TO_START).max(MAX_PLAYERS).default(DEFAULT_MAX_SEATS),
  initialStack: z.number().int().positive().default(DEFAULT_INITIAL_STACK),
  actionTimeoutMs: z.number().int().positive().default(DEFAULT_ACTION_TIMEOUT_MS),
  seed: z.string().optional(),
});

/**
 * Schema for table status
 */
export const TableStatusSchema = z.enum(['waiting', 'running', 'ended']);

/**
 * Schema for seat information
 */
export const SeatSchema = z.object({
  seatId: z.number().int().min(0).max(9),
  agentId: z.string().nullable(),
  agentName: z.string().nullable().optional(),
  stack: z.number().int().min(0),
  isActive: z.boolean(),
});

/**
 * Schema for table database record
 */
export const TableSchema = z.object({
  id: z.string(),
  status: TableStatusSchema,
  config: TableConfigSchema,
  seed: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date().optional(),
});

/**
 * Schema for table list item (includes seat info)
 */
export const TableListItemSchema = z.object({
  id: z.string(),
  status: TableStatusSchema,
  config: TableConfigSchema,
  seats: z.array(SeatSchema),
  availableSeats: z.number().int().min(0),
  playerCount: z.number().int().min(0),
  created_at: z.coerce.date(),
});

/**
 * Schema for create table request
 */
export const CreateTableRequestSchema = z.object({
  config: TableConfigSchema.optional(),
  seed: z.string().optional(),
});

/**
 * Schema for create table response
 */
export const CreateTableResponseSchema = z.object({
  id: z.string(),
  status: TableStatusSchema,
  config: TableConfigSchema,
  seats: z.array(SeatSchema),
  created_at: z.coerce.date(),
});
