import type { FastifyInstance } from 'fastify';

import {
  CreateTableRequestSchema,
  ErrorCodes,
  TableConfigSchema,
  type Seat,
} from '@moltpoker/shared';

import * as db from '../db.js';
import { tableManager } from '../table/manager.js';
import { startTableRuntime } from '../table/startTable.js';
import { clearScheduledNextHand, scheduleActionTimeout } from '../table/timeoutHandler.js';
import { generateTableId } from '../utils/crypto.js';
import { broadcastManager } from '../ws/broadcastManager.js';
import { adminAuthMiddleware } from '../auth/adminAuth.js';

export function registerAdminRoutes(fastify: FastifyInstance): void {
  // Apply admin auth middleware to all admin routes
  fastify.addHook('onRequest', adminAuthMiddleware);
  /**
   * POST /v1/admin/tables - Create a new table
   */
  fastify.post('/v1/admin/tables', async (request, reply) => {
    const parseResult = CreateTableRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid request body',
          details: parseResult.error.errors,
        },
      });
    }

    const { config: tableConfig, seed } = parseResult.data;
    const bucketKey = (request.body as Record<string, unknown>)?.bucket_key as string | undefined;
    const finalConfig = TableConfigSchema.parse(tableConfig || {});

    const tableId = generateTableId();

    try {
      await db.createTable(tableId, finalConfig as unknown as Record<string, unknown>, seed ?? null, bucketKey || 'default');
      await db.createSeats(tableId, finalConfig.maxSeats);
      const seats = await db.getSeats(tableId);
      const seatList: Seat[] = seats.map((s) => ({
        seatId: s.seat_id,
        agentId: s.agent_id,
        agentName: s.agents?.name ?? null,
        stack: s.stack,
        isActive: s.is_active,
      }));

      return reply.status(201).send({
        id: tableId,
        status: 'waiting',
        config: finalConfig,
        seats: seatList,
        created_at: new Date(),
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to create table');
      const message = err instanceof Error ? err.message : String(err);
      const errObj = err as { code?: string };
      const isConfigError = message.includes('SUPABASE_SERVICE_ROLE_KEY');
      const isPgrst002 = errObj.code === 'PGRST002';
      const pgrst002Message =
        'Supabase database temporarily unreachable (PGRST002). Try: 1) Check if project is paused in Supabase Dashboard and resume it. 2) In SQL Editor, run: NOTIFY pgrst, \'reload schema\';';
      return reply.status(500).send({
        error: {
          code: isConfigError ? 'CONFIG_ERROR' : isPgrst002 ? 'DB_UNAVAILABLE' : ErrorCodes.INTERNAL_ERROR,
          message: isConfigError ? message : isPgrst002 ? pgrst002Message : 'Failed to create table',
        },
      });
    }
  });

  /**
   * POST /v1/admin/tables/:tableId/start - Start a table
   */
  fastify.post<{ Params: { tableId: string } }>(
    '/v1/admin/tables/:tableId/start',
    async (request, reply) => {
      const { tableId } = request.params;

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

        if (table.status !== 'waiting') {
          return reply.status(400).send({
            error: {
              code: ErrorCodes.INVALID_TABLE_STATE,
              message: `Table is already ${table.status}`,
            },
          });
        }

        // Get seats
        const seats = await db.getSeats(tableId);
        const seatedPlayers = seats.filter((s) => s.agent_id);

        if (seatedPlayers.length < 2) {
          return reply.status(400).send({
            error: {
              code: ErrorCodes.INVALID_TABLE_STATE,
              message: 'At least 2 players required to start',
            },
          });
        }

        const result = await startTableRuntime(tableId);

        return reply.status(200).send({
          success: true,
          message: 'Table started',
          hand_number: result.handNumber,
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to start table');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to start table',
          },
        });
      }
    }
  );

  /**
   * POST /v1/admin/tables/:tableId/stop - Stop a table
   */
  fastify.post<{ Params: { tableId: string } }>(
    '/v1/admin/tables/:tableId/stop',
    async (request, reply) => {
      const { tableId } = request.params;

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

        // Get managed table
        const managedTable = tableManager.get(tableId);

        if (managedTable) {
          // Get final stacks
          const players = managedTable.runtime.getAllPlayers();
          const finalStacks = players.map((p) => ({
            seatId: p.seatId,
            agentId: p.agentId,
            stack: p.stack,
          }));

          // Log table ended event
          await managedTable.eventLogger.log('TABLE_ENDED', {
            reason: 'admin_stopped',
            finalStacks,
          });

          broadcastManager.broadcastTableStatus(
            tableId,
            {
              status: 'ended',
              reason: 'admin_stopped',
              final_stacks: finalStacks.map((stack) => ({
                seat_id: stack.seatId,
                agent_id: stack.agentId,
                stack: stack.stack,
              })),
            },
            { includeObservers: true }
          );

          // Disconnect all WebSocket connections
          broadcastManager.disconnectAll(tableId);

          // Clear scheduled next-hand
          clearScheduledNextHand(tableId);

          // Destroy runtime
          tableManager.destroy(tableId);
        } else {
          broadcastManager.broadcastTableStatus(
            tableId,
            { status: 'ended', reason: 'admin_stopped' },
            { includeObservers: true }
          );
          broadcastManager.disconnectAll(tableId);
        }

        // Update status
        await db.updateTableStatus(tableId, 'ended');

        return reply.status(200).send({
          success: true,
          message: 'Table stopped',
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to stop table');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to stop table',
          },
        });
      }
    }
  );

  /**
   * POST /v1/admin/tables/:tableId/next-hand - Start next hand
   */
  fastify.post<{ Params: { tableId: string } }>(
    '/v1/admin/tables/:tableId/next-hand',
    async (request, reply) => {
      const { tableId } = request.params;

      try {
        const managedTable = tableManager.get(tableId);
        if (!managedTable) {
          return reply.status(404).send({
            error: {
              code: ErrorCodes.TABLE_NOT_FOUND,
              message: 'Table not found or not started',
            },
          });
        }

        const { runtime, eventLogger } = managedTable;

        if (runtime.isHandInProgress() && !runtime.isHandComplete()) {
          return reply.status(400).send({
            error: {
              code: ErrorCodes.INVALID_TABLE_STATE,
              message: 'Hand is still in progress',
            },
          });
        }

        // Start next hand
        const handStarted = runtime.startHand();

        if (!handStarted) {
          return reply.status(400).send({
            error: {
              code: ErrorCodes.INVALID_TABLE_STATE,
              message: 'Cannot start hand. Not enough players.',
            },
          });
        }

        // Log hand start
        const players = runtime.getAllPlayers();
        const config = runtime.getConfig();

        await eventLogger.log(
          'HAND_START',
          {
            handNumber: runtime.getHandNumber(),
            dealerSeat: runtime.getDealerSeat(),
            smallBlindSeat: players.find((p) => p.bet === config.blinds.small)?.seatId ?? -1,
            bigBlindSeat: players.find((p) => p.bet === config.blinds.big)?.seatId ?? -1,
            smallBlind: config.blinds.small,
            bigBlind: config.blinds.big,
            players: players.map((p) => ({
              seatId: p.seatId,
              agentId: p.agentId,
              stack: p.stack + p.bet,
              holeCards: p.holeCards,
            })),
          },
          runtime.getHandNumber()
        );

        // Broadcast game state
        broadcastManager.broadcastGameState(tableId, runtime);

        // Schedule timeout
        scheduleActionTimeout(tableId);

        return reply.status(200).send({
          success: true,
          hand_number: runtime.getHandNumber(),
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to start next hand');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to start next hand',
          },
        });
      }
    }
  );

  /**
   * GET /v1/admin/agents - List all registered agents
   */
  fastify.get('/v1/admin/agents', async (_request, reply) => {
    try {
      const supabase = db.getDb();
      const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, created_at, last_seen_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get active connections to determine status
      const connections = new Map<string, { tableId: string | null; seatId: number | null }>();
      for (const tableId of tableManager.getTableIds()) {
        const tableConnections = broadcastManager.getConnections(tableId);
        for (const conn of tableConnections) {
          connections.set(conn.agentId, { tableId, seatId: conn.seatId });
        }
      }

      // Also check all tables (not just running ones) for seat assignments
      const allTables = await db.listTables();
      const seatAssignments = new Map<string, { tableId: string; seatId: number }>();
      for (const table of allTables) {
        const seats = await db.getSeats(table.id);
        for (const seat of seats) {
          if (seat.agent_id) {
            seatAssignments.set(seat.agent_id, { tableId: table.id, seatId: seat.seat_id });
          }
        }
      }

      const agentsList = (agents || []).map((agent) => {
        const connection = connections.get(agent.id);
        const seatAssignment = seatAssignments.get(agent.id);
        const lastSeen = agent.last_seen_at ? new Date(agent.last_seen_at) : null;
        const isConnected = connection !== undefined;
        // Consider connected if last seen within last 5 minutes
        const recentlySeen =
          lastSeen && Date.now() - lastSeen.getTime() < 5 * 60 * 1000;
        const status = isConnected || recentlySeen ? 'connected' : 'disconnected';

        // Use connection info if available, otherwise use seat assignment
        const currentTableId = connection?.tableId ?? seatAssignment?.tableId ?? null;
        const currentSeatId = connection?.seatId ?? seatAssignment?.seatId ?? null;

        return {
          agent_id: agent.id,
          name: agent.name,
          created_at: agent.created_at,
          last_seen_at: agent.last_seen_at,
          status,
          current_table_id: currentTableId,
          current_seat_id: currentSeatId,
        };
      });

      return reply.status(200).send({ agents: agentsList });
    } catch (err) {
      fastify.log.error(err, 'Failed to list agents');
      return reply.status(500).send({
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to list agents',
        },
      });
    }
  });

  /**
   * GET /v1/admin/tables/:tableId - Get detailed table state
   */
  fastify.get<{ Params: { tableId: string } }>(
    '/v1/admin/tables/:tableId',
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
        const seatList = seats.map((s) => {
          const connected =
            s.agent_id !== null
              ? broadcastManager.getConnection(tableId, s.agent_id) !== undefined
              : false;
          return {
            seat_id: s.seat_id,
            agent_id: s.agent_id,
            agent_name: s.agents?.name ?? null,
            stack: s.stack,
            connected,
          };
        });

        const managedTable = tableManager.get(tableId);
        const currentHandNumber = managedTable?.runtime.getHandNumber() ?? null;

        const tableConfig = TableConfigSchema.parse(table.config);

        return reply.status(200).send({
          id: table.id,
          status: table.status,
          config: tableConfig,
          seats: seatList,
          current_hand_number: currentHandNumber,
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
   * GET /v1/admin/tables/:tableId/events - Get table events with pagination
   */
  fastify.get<{ Params: { tableId: string }; Querystring: { fromSeq?: string; limit?: string } }>(
    '/v1/admin/tables/:tableId/events',
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
   * GET /v1/admin/tables/:tableId/export - Export full event log as JSONL
   */
  fastify.get<{ Params: { tableId: string } }>(
    '/v1/admin/tables/:tableId/export',
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

        const events = await db.getEvents(tableId);
        const tableConfig = TableConfigSchema.parse(table.config);

        // Create export bundle
        const exportData = {
          table_id: tableId,
          config: tableConfig,
          seed: table.seed,
          created_at: table.created_at,
          status: table.status,
          events: events.map((e) => ({
            seq: e.seq,
            hand_number: e.hand_number,
            type: e.type,
            payload: e.payload,
            created_at: e.created_at,
          })),
        };

        // Convert to JSONL format (one JSON object per line)
        const jsonl = JSON.stringify(exportData);

        reply
          .header('Content-Type', 'application/jsonl')
          .header('Content-Disposition', `attachment; filename="table-${tableId}-export.jsonl"`)
          .send(jsonl);
      } catch (err) {
        fastify.log.error(err, 'Failed to export table events');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to export table events',
          },
        });
      }
    }
  );

  /**
   * POST /v1/admin/agents/:agentId/kick - Kick agent from table
   */
  fastify.post<{ Params: { agentId: string } }>(
    '/v1/admin/agents/:agentId/kick',
    async (request, reply) => {
      const { agentId } = request.params;

      try {
        // Find which table the agent is seated at
        let targetTableId: string | null = null;
        let targetSeatId: number | null = null;

        // Check all tables for seat assignment
        const allTables = await db.listTables();
        for (const table of allTables) {
          const seats = await db.getSeats(table.id);
          const seat = seats.find((s) => s.agent_id === agentId);
          if (seat) {
            targetTableId = table.id;
            targetSeatId = seat.seat_id;
            break;
          }
        }

        if (!targetTableId || targetSeatId === null) {
          return reply.status(404).send({
            error: {
              code: ErrorCodes.TABLE_NOT_FOUND,
              message: 'Agent is not connected to any table',
            },
          });
        }

        // Get seat info
        const seats = await db.getSeats(targetTableId);
        const seat = seats.find((s) => s.seat_id === targetSeatId && s.agent_id === agentId);

        if (!seat) {
          return reply.status(404).send({
            error: {
              code: ErrorCodes.TABLE_NOT_FOUND,
              message: 'Agent seat not found',
            },
          });
        }

        // Disconnect WebSocket if connected
        const conn = broadcastManager.getConnection(targetTableId, agentId);
        if (conn) {
          conn.ws.close(1000, 'Kicked by admin');
          broadcastManager.unregister(targetTableId, agentId);
        }

        // Remove from seat
        await db.clearSeat(targetTableId, targetSeatId);

        // Log AGENT_KICKED event
        const managedTable = tableManager.get(targetTableId);
        if (managedTable) {
          await managedTable.eventLogger.log('AGENT_KICKED', {
            seatId: targetSeatId,
            agentId,
            agentName: seat.agents?.name ?? null,
          });
        }

        return reply.status(200).send({
          success: true,
          message: 'Agent kicked from table',
          table_id: targetTableId,
          seat_id: targetSeatId,
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to kick agent');
        return reply.status(500).send({
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: 'Failed to kick agent',
          },
        });
      }
    }
  );
}
