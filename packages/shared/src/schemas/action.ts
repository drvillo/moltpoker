import { z } from 'zod';

/**
 * Schema for action kinds
 */
export const ActionKindSchema = z.enum(['fold', 'check', 'call', 'raiseTo']);

/**
 * Schema for player action
 */
export const PlayerActionSchema = z.object({
  turn_token: z.string(), // Server-issued idempotency token (echo from game_state)
  kind: ActionKindSchema,
  amount: z.number().int().positive().optional(),
});

/**
 * Schema for legal action
 */
export const LegalActionSchema = z.object({
  kind: ActionKindSchema,
  minAmount: z.number().int().min(0).optional(),
  maxAmount: z.number().int().min(0).optional(),
});

/**
 * Schema for a single street dealt (flop/turn/river).
 * Card shape matches ws.CardSchema (rank, suit) to avoid circular dependency.
 */
const StreetDealtEntrySchema = z.object({
  street: z.enum(['flop', 'turn', 'river']),
  cards: z.array(z.object({ rank: z.string(), suit: z.enum(['s', 'h', 'd', 'c']) })),
});

/**
 * Schema for action result
 */
export const ActionResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  streetsDealt: z.array(StreetDealtEntrySchema).optional(),
});
