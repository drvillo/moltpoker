import {
  AutoJoinRequestSchema,
  DEFAULT_BUCKET_KEY,
  ErrorCodes,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  TableConfigSchema,
} from '@moltpoker/shared'
import type { FastifyInstance } from 'fastify'

import { apiKeyAuth } from '../auth/apiKey.js'
import { config } from '../config.js'
import * as db from '../db.js'
import { generateTableId } from '../utils/crypto.js'
import { assignSeatAndCreateSession, checkAndAutoStart } from './tables.js'
import { createDepositForTable, checkPaymentSystemHealth } from '../payments/paymentService.js'

/**
 * Default table configuration used when auto-join creates a new table.
 */
const DEFAULT_TABLE_CONFIG = TableConfigSchema.parse({})

/**
 * Check if an error is a Postgres unique constraint violation (code 23505).
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code: string }).code === '23505'
  }
  return false
}

/**
 * Ensure a waiting table exists for the given bucket.
 * Used after a table starts to create the next lobby table.
 */
async function ensureWaitingTableExists(bucketKey: string): Promise<void> {
  const existing = await db.findWaitingTableInBucket(bucketKey)
  if (existing) return

  try {
    const tableId = generateTableId()
    const configData = DEFAULT_TABLE_CONFIG as unknown as Record<string, unknown>
    await db.createTableWithBucket(tableId, bucketKey, configData)
    await db.createSeats(tableId, DEFAULT_TABLE_CONFIG.maxSeats)
  } catch (err) {
    // If another request already created one (unique constraint), that's fine
    if (!isUniqueConstraintViolation(err)) throw err
  }
}

export function registerAutoJoinRoutes(fastify: FastifyInstance): void {
  /**
   * POST /v1/tables/auto-join - Auto-join a table
   *
   * Finds an existing waiting table in the requested bucket, or creates one.
   * Assigns a seat, creates a session, and auto-starts the table when
   * minPlayersToStart is reached.
   */
  fastify.post(
    '/v1/tables/auto-join',
    { preHandler: apiKeyAuth },
    async (request, reply) => {
      const agentId = request.agentId!
      const agentName = request.agent?.name ?? null

      // Validate request body
      const parseResult = AutoJoinRequestSchema.safeParse(request.body || {})
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid request body',
            details: parseResult.error.errors,
          },
        })
      }

      const { client_protocol_version, preferred_seat, bucket_key } = parseResult.data
      const bucketKey = bucket_key || DEFAULT_BUCKET_KEY

      // Check protocol version compatibility
      if (client_protocol_version && client_protocol_version < MIN_SUPPORTED_PROTOCOL_VERSION) {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.OUTDATED_CLIENT,
            message: 'Your client protocol version is outdated',
            min_supported_protocol_version: MIN_SUPPORTED_PROTOCOL_VERSION,
            skill_doc_url: config.skillDocUrl,
          },
        })
      }

      try {
        // Find or create a waiting table in the bucket
        let table = await db.findWaitingTableInBucket(bucketKey)

        if (!table) {
          try {
            const tableId = generateTableId()
            const configData = DEFAULT_TABLE_CONFIG as unknown as Record<string, unknown>
            table = await db.createTableWithBucket(tableId, bucketKey, configData)
            await db.createSeats(tableId, DEFAULT_TABLE_CONFIG.maxSeats)
          } catch (err) {
            if (isUniqueConstraintViolation(err)) {
              // Race condition: another request created the table, retry find
              table = await db.findWaitingTableInBucket(bucketKey)
              if (!table) {
                return reply.status(500).send({
                  error: {
                    code: ErrorCodes.INTERNAL_ERROR,
                    message: 'Failed to find or create a table for this bucket',
                  },
                })
              }
            } else {
              throw err
            }
          }
        }

        const tableConfig = TableConfigSchema.parse(table.config)

        // Assign seat and create session
        const result = await assignSeatAndCreateSession(
          table.id, agentId, agentName, tableConfig, { preferredSeat: preferred_seat }
        )

        if ('error' in result) {
          return reply.status(result.error.statusCode).send({
            error: { code: result.error.code, message: result.error.message },
          })
        }

        const { seatId, sessionToken } = result

        // Auto-start if enough players
        const started = await checkAndAutoStart(table.id, tableConfig, fastify.log)

        // If the table started, ensure a new waiting table exists for the bucket
        if (started) {
          try {
            await ensureWaitingTableExists(bucketKey)
          } catch (err) {
            fastify.log.error(err, 'Failed to create next lobby table for bucket')
            // Non-fatal: current agent is already seated
          }
        }

        const response: Record<string, unknown> = {
          table_id: table.id,
          seat_id: seatId,
          session_token: sessionToken,
          ws_url: config.wsUrl,
          protocol_version: PROTOCOL_VERSION,
          min_supported_protocol_version: MIN_SUPPORTED_PROTOCOL_VERSION,
          skill_doc_url: config.skillDocUrl,
          action_timeout_ms: tableConfig.actionTimeoutMs,
        };

        // If this is a real money table, add deposit instructions
        if (tableConfig.realMoney && config.realMoneyEnabled) {
          // Check payment system health
          const paymentHealthy = await checkPaymentSystemHealth();
          if (!paymentHealthy) {
            return reply.status(503).send({
              error: {
                code: ErrorCodes.PAYMENT_SYSTEM_UNAVAILABLE,
                message: 'Payment system is currently unavailable',
              },
            });
          }

          // Create deposit for this table/agent
          const buyInUsdc = tableConfig.initialStack / 100; // 1 chip = $0.01 USDC
          const depositResult = await createDepositForTable(table.id, agentId, seatId, buyInUsdc);
          
          if (depositResult) {
            response.deposit = depositResult.instructions;
          }
        }

        return reply.status(200).send(response)
      } catch (err) {
        fastify.log.error(err, 'Failed to auto-join table')
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to auto-join table',
          },
        })
      }
    }
  )
}
