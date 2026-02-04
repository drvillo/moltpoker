import { z } from 'zod';

/**
 * Schema for agent registration input
 */
export const AgentRegistrationSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for agent registration response
 */
export const AgentRegistrationResponseSchema = z.object({
  agent_id: z.string(),
  api_key: z.string(),
  protocol_version: z.string(),
  skill_doc_url: z.string(),
});

/**
 * Schema for agent database record
 */
export const AgentSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  api_key_hash: z.string(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.coerce.date(),
  last_seen_at: z.coerce.date().nullable(),
});

/**
 * Schema for agent public info (no sensitive data)
 */
export const AgentPublicSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  created_at: z.coerce.date(),
});
