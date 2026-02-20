import type { FastifyInstance } from 'fastify';
import { ErrorCodes } from '@moltpoker/shared';
import {
  createProviderApiKey,
  listProviderApiKeys,
  deleteProviderApiKey,
  SUPPORTED_PROVIDERS,
} from '../simulation/store.js';

export function registerAdminApiKeyRoutes(fastify: FastifyInstance): void {
  /**
   * GET /v1/admin/api-keys — List all provider API keys (masked)
   */
  fastify.get('/v1/admin/api-keys', async (_request, reply) => {
    try {
      const keys = await listProviderApiKeys();
      return reply.status(200).send({ keys });
    } catch (err) {
      fastify.log.error(err, 'Failed to list API keys');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to list API keys' },
      });
    }
  });

  /**
   * POST /v1/admin/api-keys — Add a provider API key
   */
  fastify.post('/v1/admin/api-keys', async (request, reply) => {
    const body = request.body as { provider?: string; label?: string; api_key?: string };

    if (!body.provider || !body.label || !body.api_key) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'provider, label, and api_key are required',
        },
      });
    }

    if (!SUPPORTED_PROVIDERS.includes(body.provider)) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `provider must be one of: ${SUPPORTED_PROVIDERS.join(', ')}`,
        },
      });
    }

    if (body.api_key.trim().length === 0) {
      return reply.status(400).send({
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'api_key must not be empty' },
      });
    }

    try {
      const key = await createProviderApiKey(body.provider, body.label, body.api_key);
      return reply.status(201).send({
        id: key.id,
        provider: key.provider,
        label: key.label,
        masked_key: `...${key.api_key.slice(-4)}`,
        created_at: key.created_at,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to create API key');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to create API key' },
      });
    }
  });

  /**
   * DELETE /v1/admin/api-keys/:id — Delete a provider API key
   */
  fastify.delete<{ Params: { id: string } }>('/v1/admin/api-keys/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      await deleteProviderApiKey(id);
      return reply.status(200).send({ success: true });
    } catch (err) {
      fastify.log.error(err, 'Failed to delete API key');
      return reply.status(500).send({
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to delete API key' },
      });
    }
  });
}
