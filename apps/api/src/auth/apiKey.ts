import { ErrorCodes } from '@moltpoker/shared';
import type { FastifyRequest, FastifyReply } from 'fastify';


import { getAgentByApiKeyHash } from '../db.js';
import { hashApiKey } from '../utils/crypto.js';

declare module 'fastify' {
  interface FastifyRequest {
    agentId?: string;
    agent?: {
      id: string;
      name: string | null;
    };
  }
}

/**
 * Extract API key from Authorization header
 */
export function extractApiKey(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;

  // Support "Bearer <key>" or just "<key>"
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer') {
    return parts[1] || null;
  }

  return authHeader;
}

/**
 * Validate API key and attach agent info to request
 */
export async function validateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    reply.status(401).send({
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'API key is required. Use Authorization header.',
      },
    });
    return false;
  }

  const apiKeyHash = hashApiKey(apiKey);
  const agent = await getAgentByApiKeyHash(apiKeyHash);

  if (!agent) {
    reply.status(401).send({
      error: {
        code: ErrorCodes.INVALID_API_KEY,
        message: 'Invalid API key',
      },
    });
    return false;
  }

  request.agentId = agent.id;
  request.agent = {
    id: agent.id,
    name: agent.name,
  };

  return true;
}

/**
 * API key authentication middleware
 */
export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const isValid = await validateApiKey(request, reply);
  if (!isValid) {
    // Reply already sent
    throw new Error('Unauthorized');
  }
}
