import type { FastifyInstance } from 'fastify';

import {
  CreateTableRequestSchema,
  ErrorCodes,
  TableConfigSchema,
  type Seat,
} from '@moltpoker/shared';

import * as db from '../db.js';
import { tableManager } from '../table/manager.js';
import { scheduleActionTimeout } from '../table/timeoutHandler.js';
import { generateTableId } from '../utils/crypto.js';
import { broadcastManager } from '../ws/broadcastManager.js';

export function registerAdminRoutes(fastify: FastifyInstance): void {
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
    const finalConfig = TableConfigSchema.parse(tableConfig || {});

    const tableId = generateTableId();

    try {
      // Create table in database
      await db.createTable(tableId, finalConfig as unknown as Record<string, unknown>, seed ?? null);

      // Create seats
      await db.createSeats(tableId, finalConfig.maxSeats);

      // Get seats
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
      return reply.status(500).send({
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to create table',
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

        const tableConfig = TableConfigSchema.parse(table.config);

        // Create table runtime
        const managedTable = await tableManager.create(tableId, tableConfig, table.seed ?? undefined);

        // Add players to runtime
        for (const seat of seatedPlayers) {
          const agentName = seat.agents?.name ?? null;
          managedTable.runtime.addPlayer(seat.seat_id, seat.agent_id, agentName, seat.stack);
        }

        // Update status
        await db.updateTableStatus(tableId, 'running');

        // Log table started event
        await managedTable.eventLogger.log('TABLE_STARTED', {
          config: {
            blinds: tableConfig.blinds,
            maxSeats: tableConfig.maxSeats,
            initialStack: tableConfig.initialStack,
            actionTimeoutMs: tableConfig.actionTimeoutMs,
            seed: table.seed,
          },
        });

        // Start first hand
        const handStarted = managedTable.runtime.startHand();

        if (handStarted) {
          // Log hand start
          const runtime = managedTable.runtime;
          const players = runtime.getAllPlayers();

          await managedTable.eventLogger.log(
            'HAND_START',
            {
              handNumber: runtime.getHandNumber(),
              dealerSeat: runtime.getDealerSeat(),
              smallBlindSeat: players.find((p) => p.bet === tableConfig.blinds.small)?.seatId ?? -1,
              bigBlindSeat: players.find((p) => p.bet === tableConfig.blinds.big)?.seatId ?? -1,
              smallBlind: tableConfig.blinds.small,
              bigBlind: tableConfig.blinds.big,
              players: players.map((p) => ({
                seatId: p.seatId,
                agentId: p.agentId,
                stack: p.stack + p.bet, // Original stack before blinds
                holeCards: p.holeCards,
              })),
            },
            runtime.getHandNumber()
          );

          // Schedule timeout for first player
          scheduleActionTimeout(tableId);
        }

        return reply.status(200).send({
          success: true,
          message: 'Table started',
          hand_number: managedTable.runtime.getHandNumber(),
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

          // Disconnect all WebSocket connections
          broadcastManager.disconnectAll(tableId);

          // Destroy runtime
          tableManager.destroy(tableId);
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
}
