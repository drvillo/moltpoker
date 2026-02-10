import {
  ErrorCodes,
  JoinRequestSchema,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SESSION_EXPIRATION_SECONDS,
  TableConfigSchema,
  type Seat,
  type TableListItem,
} from '@moltpoker/shared';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';


import { apiKeyAuth } from '../auth/apiKey.js';
import { generateSessionToken } from '../auth/sessionToken.js';
import { config } from '../config.js';
import * as db from '../db.js';
import { tableManager } from '../table/manager.js';
import { startTableRuntime } from '../table/startTable.js';
import { generateSessionId } from '../utils/crypto.js';
import { broadcastManager } from '../ws/broadcastManager.js';

/**
 * Assign a seat to an agent and create a session.
 * Reusable helper shared between /join and /auto-join endpoints.
 */
export async function assignSeatAndCreateSession(
  tableId: string,
  agentId: string,
  agentName: string | null,
  tableConfig: ReturnType<typeof TableConfigSchema.parse>,
  options: { preferredSeat?: number } = {}
): Promise<{ seatId: number; sessionToken: string } | { error: { code: string; message: string; statusCode: number } }> {
  // Check if agent is already seated
  const existingSeat = await db.getSeatByAgentId(tableId, agentId)
  if (existingSeat) {
    return { error: { code: ErrorCodes.ALREADY_SEATED, message: 'You are already seated at this table', statusCode: 400 } }
  }

  // Find available seat
  const availableSeat = await db.findAvailableSeat(tableId, options.preferredSeat)
  if (!availableSeat) {
    return { error: { code: ErrorCodes.TABLE_FULL, message: 'No available seats at this table', statusCode: 400 } }
  }

  const seatId = availableSeat.seat_id

  // Assign seat
  await db.assignSeat(tableId, seatId, agentId, tableConfig.initialStack)

  // Create session
  const sessionId = generateSessionId()
  const expiresAt = new Date(Date.now() + SESSION_EXPIRATION_SECONDS * 1000)
  await db.createSession(sessionId, agentId, tableId, seatId, expiresAt)

  // Generate session token
  const sessionToken = generateSessionToken(sessionId, agentId, tableId, seatId)

  // Add player to runtime if table is already running
  const managedTable = tableManager.get(tableId)
  if (managedTable) {
    managedTable.runtime.addPlayer(seatId, agentId, agentName, tableConfig.initialStack)
    broadcastManager.broadcastPlayerJoined(tableId, seatId, agentId, agentName, tableConfig.initialStack)
  }

  return { seatId, sessionToken }
}

/**
 * Check if a waiting table has enough players to auto-start, and start it if so.
 * Returns true if the table was started.
 */
export async function checkAndAutoStart(
  tableId: string,
  tableConfig: ReturnType<typeof TableConfigSchema.parse>,
  log?: FastifyBaseLogger
): Promise<boolean> {
  const allSeats = await db.getSeats(tableId)
  const seatedCount = allSeats.filter((s) => s.agent_id).length

  if (seatedCount >= tableConfig.minPlayersToStart) {
    try {
      await startTableRuntime(tableId)
      return true
    } catch (startErr) {
      log?.error(startErr, 'Auto-start failed after join')
      return false
    }
  }
  return false
}

export function registerTableRoutes(fastify: FastifyInstance): void {
  /**
   * GET /v1/tables - List available tables
   * Query params:
   *   - status: Filter by status ('waiting', 'running', 'ended')
   * 
   * Note: For 'running' status, only returns tables with active runtimes.
   * Tables that show 'running' in DB but have no active runtime (e.g., after server restart)
   * are automatically excluded to prevent observer connection errors.
   */
  fastify.get<{ Querystring: { status?: string } }>('/v1/tables', async (request, reply) => {
    try {
      const { status } = request.query;
      const tables = await db.listTables(status);

      const result: TableListItem[] = [];

      for (const table of tables) {
        // For 'running' tables, verify there's an active runtime
        // This prevents showing stale data after server restarts
        if (table.status === 'running' && !tableManager.has(table.id)) {
          // Table is marked running in DB but has no active runtime - skip it
          continue;
        }

        const seats = await db.getSeats(table.id);
        const tableConfig = TableConfigSchema.parse(table.config);

        const seatList: Seat[] = seats.map((s) => ({
          seatId: s.seat_id,
          agentId: s.agent_id,
          agentName: s.agents?.name ?? null,
          stack: s.stack,
          isActive: s.is_active,
        }));

        const availableSeats = seatList.filter((s) => !s.agentId).length;
        const playerCount = seatList.filter((s) => s.agentId).length;

        result.push({
          id: table.id,
          status: table.status,
          config: tableConfig,
          seats: seatList,
          availableSeats,
          playerCount,
          created_at: new Date(table.created_at),
          bucket_key: table.bucket_key ?? 'default',
        });
      }

      return reply.send({
        tables: result,
        protocol_version: PROTOCOL_VERSION,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to list tables');
      return reply.status(500).send({
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to list tables',
        },
      });
    }
  });

  /**
   * GET /v1/tables/:tableId - Get public table details
   * Returns table info, config, and seat data (no auth required).
   */
  fastify.get<{ Params: { tableId: string } }>(
    '/v1/tables/:tableId',
    async (request, reply) => {
      const { tableId } = request.params;

      try {
        const table = await db.getTable(tableId);
        if (!table) {
          return reply.status(404).send({
            error: {
              code: ErrorCodes.TABLE_NOT_FOUND,
              message: 'Table not found',
            },
          });
        }

        const seats = await db.getSeats(tableId);
        const tableConfig = TableConfigSchema.parse(table.config);

        const seatList: Seat[] = seats.map((s) => ({
          seatId: s.seat_id,
          agentId: s.agent_id,
          agentName: s.agents?.name ?? null,
          stack: s.stack,
          isActive: s.is_active,
        }));

        const availableSeats = seatList.filter((s) => !s.agentId).length;
        const playerCount = seatList.filter((s) => s.agentId).length;

        return reply.status(200).send({
          id: table.id,
          status: table.status,
          config: tableConfig,
          seats: seatList,
          availableSeats,
          playerCount,
          created_at: table.created_at,
          bucket_key: table.bucket_key ?? 'default',
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to get table details');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to get table details',
          },
        });
      }
    }
  );

  /**
   * GET /v1/tables/:tableId/events - Get table events (no auth required)
   * Query params:
   *   - fromSeq: Start from this sequence number
   *   - limit: Max number of events to return (default: 100)
   */
  fastify.get<{ Params: { tableId: string }; Querystring: { fromSeq?: string; limit?: string } }>(
    '/v1/tables/:tableId/events',
    async (request, reply) => {
      const { tableId } = request.params;
      const fromSeq = request.query.fromSeq ? parseInt(request.query.fromSeq, 10) : undefined;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;

      try {
        const table = await db.getTable(tableId);
        if (!table) {
          return reply.status(404).send({
            error: {
              code: ErrorCodes.TABLE_NOT_FOUND,
              message: 'Table not found',
            },
          });
        }

        let events = await db.getEvents(tableId, fromSeq);
        const hasMore = events.length > limit;
        events = events.slice(0, limit);

        const eventsList = events.map((e) => ({
          seq: e.seq,
          type: e.type,
          payload: e.payload,
          created_at: e.created_at,
        }));

        return reply.status(200).send({
          events: eventsList,
          hasMore,
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to get table events');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to get table events',
          },
        });
      }
    }
  );

  /**
   * POST /v1/tables/:tableId/join - Join a table
   */
  fastify.post<{ Params: { tableId: string } }>(
    '/v1/tables/:tableId/join',
    { preHandler: apiKeyAuth },
    async (request, reply) => {
      const { tableId } = request.params;
      const agentId = request.agentId!;
      const agentName = request.agent?.name ?? null;

      // Validate request body
      const parseResult = JoinRequestSchema.safeParse(request.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid request body',
            details: parseResult.error.errors,
          },
        });
      }

      const { client_protocol_version, preferred_seat } = parseResult.data;

      // Check protocol version compatibility
      if (
        client_protocol_version &&
        client_protocol_version < MIN_SUPPORTED_PROTOCOL_VERSION
      ) {
        return reply.status(400).send({
          error: {
            code: ErrorCodes.OUTDATED_CLIENT,
            message: 'Your client protocol version is outdated',
            min_supported_protocol_version: MIN_SUPPORTED_PROTOCOL_VERSION,
            skill_doc_url: config.skillDocUrl,
          },
        });
      }

      try {
        // Get table
        const table = await db.getTable(tableId);
        if (!table) {
          return reply.status(404).send({
            error: {
              code: ErrorCodes.TABLE_NOT_FOUND,
              message: 'Table not found',
            },
          });
        }

        // Only waiting tables are joinable
        if (table.status !== 'waiting') {
          const code = table.status === 'ended'
            ? ErrorCodes.TABLE_ENDED
            : ErrorCodes.INVALID_TABLE_STATE;
          return reply.status(400).send({
            error: {
              code,
              message: `Cannot join a table that is ${table.status}`,
            },
          });
        }

        const tableConfig = TableConfigSchema.parse(table.config);

        // Assign seat and create session
        const result = await assignSeatAndCreateSession(
          tableId, agentId, agentName, tableConfig, { preferredSeat: preferred_seat }
        );

        if ('error' in result) {
          return reply.status(result.error.statusCode).send({
            error: { code: result.error.code, message: result.error.message },
          });
        }

        const { seatId, sessionToken } = result;

        // Auto-start if waiting and enough players
        if (table.status === 'waiting' && !tableManager.has(tableId)) {
          await checkAndAutoStart(tableId, tableConfig, fastify.log);
        }

        return reply.status(200).send({
          table_id: tableId,
          seat_id: seatId,
          session_token: sessionToken,
          ws_url: config.wsUrl,
          protocol_version: PROTOCOL_VERSION,
          min_supported_protocol_version: MIN_SUPPORTED_PROTOCOL_VERSION,
          skill_doc_url: config.skillDocUrl,
          action_timeout_ms: tableConfig.actionTimeoutMs,
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to join table');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to join table',
          },
        });
      }
    }
  );

  /**
   * POST /v1/tables/:tableId/leave - Leave a table
   */
  fastify.post<{ Params: { tableId: string } }>(
    '/v1/tables/:tableId/leave',
    { preHandler: apiKeyAuth },
    async (request, reply) => {
      const { tableId } = request.params;
      const agentId = request.agentId!;

      try {
        // Check if agent is seated
        const seat = await db.getSeatByAgentId(tableId, agentId);
        if (!seat) {
          return reply.status(400).send({
            error: {
              code: ErrorCodes.NOT_SEATED,
              message: 'You are not seated at this table',
            },
          });
        }

        // Clear seat
        await db.clearSeat(tableId, seat.seat_id);

        // Delete sessions
        await db.deleteSessionsByAgent(agentId, tableId);

        // Remove from runtime if running
        const managedTable = tableManager.get(tableId);
        if (managedTable) {
          managedTable.runtime.removePlayer(seat.seat_id);

          // Broadcast player left
          broadcastManager.broadcastPlayerLeft(tableId, seat.seat_id, agentId);
        }

        return reply.status(200).send({
          success: true,
          message: 'Successfully left the table',
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to leave table');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to leave table',
          },
        });
      }
    }
  );
}
