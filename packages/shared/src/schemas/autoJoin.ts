import { z } from 'zod'

import { PROTOCOL_VERSION } from '../constants/protocol.js'
import { JoinResponseSchema } from './join.js'

/**
 * Schema for auto-join request
 */
export const AutoJoinRequestSchema = z.object({
  client_protocol_version: z.string().default(PROTOCOL_VERSION),
  preferred_seat: z.number().int().min(0).max(9).optional(),
  bucket_key: z.string().optional(),
})

/**
 * Schema for auto-join response (identical to join response)
 */
export const AutoJoinResponseSchema = JoinResponseSchema
