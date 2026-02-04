import { z } from 'zod';

import { PROTOCOL_VERSION } from '../constants/protocol.js';

/**
 * Schema for join table request
 */
export const JoinRequestSchema = z.object({
  client_protocol_version: z.string().default(PROTOCOL_VERSION),
  preferred_seat: z.number().int().min(0).max(9).optional(),
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
