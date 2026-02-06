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
import type { FastifyInstance } from 'fastify';


import { apiKeyAuth } from '../auth/apiKey.js';
import { generateSessionToken } from '../auth/sessionToken.js';
import { config } from '../config.js';
import * as db from '../db.js';
import { tableManager } from '../table/manager.js';
import { startTableRuntime } from '../table/startTable.js';
import { generateSessionId } from '../utils/crypto.js';
import { broadcastManager } from '../ws/broadcastManager.js';

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

        // Check if agent is already seated
        const existingSeat = await db.getSeatByAgentId(tableId, agentId);
        if (existingSeat) {
          return reply.status(400).send({
            error: {
              code: ErrorCodes.ALREADY_SEATED,
              message: 'You are already seated at this table',
            },
          });
        }

        // Find available seat
        const availableSeat = await db.findAvailableSeat(tableId, preferred_seat);
        if (!availableSeat) {
          return reply.status(400).send({
            error: {
              code: ErrorCodes.TABLE_FULL,
              message: 'No available seats at this table',
            },
          });
        }

        const tableConfig = TableConfigSchema.parse(table.config);
        const seatId = availableSeat.seat_id;

        // Assign seat
        await db.assignSeat(tableId, seatId, agentId, tableConfig.initialStack);

        // Create session
        const sessionId = generateSessionId();
        const expiresAt = new Date(Date.now() + SESSION_EXPIRATION_SECONDS * 1000);
        await db.createSession(sessionId, agentId, tableId, seatId, expiresAt);

        // Generate session token
        const sessionToken = generateSessionToken(sessionId, agentId, tableId, seatId);

        // Add player to runtime if table is already running
        const managedTable = tableManager.get(tableId);
        if (managedTable) {
          managedTable.runtime.addPlayer(seatId, agentId, agentName, tableConfig.initialStack);

          // Broadcast player joined
          broadcastManager.broadcastPlayerJoined(
            tableId,
            seatId,
            agentId,
            agentName,
            tableConfig.initialStack
          );
        } else if (table.status === 'waiting') {
          // Auto-start if we have enough players
          const allSeats = await db.getSeats(tableId);
          const seatedCount = allSeats.filter((s) => s.agent_id).length;

          if (seatedCount >= tableConfig.minPlayersToStart) {
            try {
              await startTableRuntime(tableId);
            } catch (startErr) {
              fastify.log.error(startErr, 'Auto-start failed after join');
              // Non-fatal: the agent is seated, they can connect WS and wait
            }
          }
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
