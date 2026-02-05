import {
  AgentRegistrationSchema,
  PROTOCOL_VERSION,
} from '@moltpoker/shared';
import type { FastifyInstance } from 'fastify';


import { config } from '../config.js';
import * as db from '../db.js';
import { generateAgentId, generateApiKey, hashApiKey } from '../utils/crypto.js';

export function registerAgentRoutes(fastify: FastifyInstance): void {
  /**
   * POST /v1/agents - Register a new agent
   */
  fastify.post('/v1/agents', async (request, reply) => {
    // Validate input
    const parseResult = AgentRegistrationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.errors,
        },
      });
    }

    const { name, metadata } = parseResult.data;

    // Generate credentials
    const agentId = generateAgentId();
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    // Create agent in database
    try {
      await db.createAgent(agentId, name ?? null, apiKeyHash, metadata ?? {});
    } catch (err) {
      fastify.log.error(err, 'Failed to create agent');
      return reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create agent',
        },
      });
    }

    return reply.status(201).send({
      agent_id: agentId,
      api_key: apiKey,
      protocol_version: PROTOCOL_VERSION,
      skill_doc_url: config.skillDocUrl,
    });
  });
}
