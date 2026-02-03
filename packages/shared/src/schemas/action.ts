import { z } from 'zod';

/**
 * Schema for action kinds
 */
export const ActionKindSchema = z.enum(['fold', 'check', 'call', 'raiseTo']);

/**
 * Schema for player action
 */
export const PlayerActionSchema = z.object({
  action_id: z.string().uuid(),
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
 * Schema for action result
 */
export const ActionResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
});
