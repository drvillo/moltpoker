import { z } from 'zod';

import { PROTOCOL_VERSION } from '../constants/protocol.js';
import { DepositStatus } from '../constants/payments.js';

/**
 * Schema for join table request
 */
export const JoinRequestSchema = z.object({
  client_protocol_version: z.string().default(PROTOCOL_VERSION),
  preferred_seat: z.number().int().min(0).max(9).optional(),
});

/**
 * Schema for deposit instructions (returned for real money tables)
 */
export const DepositInstructionsSchema = z.object({
  deposit_id: z.string(),
  status: z.enum([
    DepositStatus.PENDING,
    DepositStatus.SETTLED,
    DepositStatus.EXPIRED_LATE,
    DepositStatus.INVALID_AMOUNT,
    DepositStatus.PENDING_CONFIRMATION,
    DepositStatus.REFUNDED,
  ]),
  amount_usdc: z.number(),
  chain_id: z.number(),
  chain_name: z.string(),
  token_address: z.string(),
  vault_address: z.string(),
  vault_call: z.object({
    to: z.string(),
    data: z.string(),
    value: z.string().optional(),
  }),
  expires_at: z.string(),
});

/**
 * Schema for join table response
 */
export const JoinResponseSchema = z.object({
  table_id: z.string(),
  seat_id: z.number().int().min(0).max(9),
  session_token: z.string(),
  ws_url: z.string(),
  protocol_version: z.string(),
  min_supported_protocol_version: z.string(),
  skill_doc_url: z.string(),
  action_timeout_ms: z.number().int().positive(),
  deposit: DepositInstructionsSchema.optional(),
});

/**
 * Schema for leave table request (empty body, uses auth header)
 */
export const LeaveRequestSchema = z.object({});

/**
 * Schema for leave table response
 */
export const LeaveResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});
