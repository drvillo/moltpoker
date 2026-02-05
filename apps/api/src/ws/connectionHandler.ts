import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

import {
  ErrorCodes,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from '@moltpoker/shared';

import { config } from '../config.js';
import { updateAgentLastSeen } from '../db.js';
import { validateSession } from '../auth/sessionToken.js';
import { verifyAdminAuth } from '../auth/adminAuth.js';
import { tableManager } from '../table/manager.js';
import { broadcastManager } from './broadcastManager.js';
import { handleMessage } from './messageHandler.js';
import type { FastifyRequest } from 'fastify';

/**
 * Register WebSocket routes
 */
export function registerWebSocketRoutes(fastify: FastifyInstance): void {
  fastify.get('/v1/ws', { websocket: true }, async (connection, request) => {
    const ws = connection;

    // Get token from query params
    const token = (request.query as { token?: string }).token;

    if (!token) {
      sendErrorAndClose(ws, ErrorCodes.UNAUTHORIZED, 'Session token is required');
      return;
    }

    // Validate session
    const sessionResult = await validateSession(token);

    if (!sessionResult.valid) {
      sendErrorAndClose(ws, sessionResult.error.code, sessionResult.error.message);
      return;
    }

    const { agentId, tableId, seatId } = sessionResult.payload;

    // Check if table runtime exists
    const table = tableManager.get(tableId);
    if (!table) {
      sendErrorAndClose(ws, ErrorCodes.TABLE_NOT_FOUND, 'Table not found or not started');
      return;
    }

    // Register connection
    broadcastManager.register(tableId, agentId, seatId, ws);

    // Update last seen
    updateAgentLastSeen(agentId).catch(() => {});

    // Send welcome message
    broadcastManager.sendWelcome(tableId, agentId, {
      protocol_version: PROTOCOL_VERSION,
      min_supported_protocol_version: MIN_SUPPORTED_PROTOCOL_VERSION,
      skill_doc_url: config.skillDocUrl,
      seat_id: seatId,
      agent_id: agentId,
      action_timeout_ms: table.runtime.getActionTimeoutMs(),
    });

    // Send current game state
    const state = table.runtime.getStateForSeat(seatId);
    broadcastManager.sendGameState(tableId, agentId, state);

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        await handleMessage(ws, data.toString(), { agentId, tableId, seatId });
      } catch (err) {
        console.error('Error handling message:', err);
        broadcastManager.sendError(tableId, agentId, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'An error occurred processing your message',
        });
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      broadcastManager.unregister(tableId, agentId);

      // If it was this player's turn, the timeout handler will manage it
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  /**
   * Observer WebSocket endpoint - allows watching games without being a player
   * GET /v1/ws/observe/:tableId
   */
  fastify.get<{ Params: { tableId: string }; Querystring: { showCards?: string } }>(
    '/v1/ws/observe/:tableId',
    { websocket: true },
    async (connection, request) => {
      const ws = connection;
      const { tableId } = request.params;
      const showCards = request.query.showCards === 'true';

      // Check if table exists
      const table = tableManager.get(tableId);
      if (!table) {
        sendErrorAndClose(ws, ErrorCodes.TABLE_NOT_FOUND, 'Table not found or not started');
        return;
      }

      // If showCards is requested, verify admin auth
      let isAdmin = false;
      if (showCards) {
        // Create a mock reply object for admin auth check
        const mockReply = {
          status: (code: number) => ({
            send: (data: unknown) => {
              if (code >= 400) {
                const error = data as { error?: { code: string; message: string } };
                sendErrorAndClose(
                  ws,
                  error.error?.code || ErrorCodes.UNAUTHORIZED,
                  error.error?.message || 'Unauthorized'
                );
              }
              return mockReply;
            },
          }),
        } as unknown as Parameters<typeof verifyAdminAuth>[1];

        const admin = await verifyAdminAuth(request as FastifyRequest, mockReply);
        if (!admin) {
          return; // Error already sent
        }
        isAdmin = true;
      }

      // Register observer
      broadcastManager.registerObserver(tableId, ws);

      // Send initial game state
      // If admin and showCards=true, send state with hole cards for all players
      // Otherwise send public state (no hole cards)
      let gameState = table.runtime.getPublicState();

      if (isAdmin && showCards) {
        // Modify public state to include all hole cards for admin debug mode
        const players = table.runtime.getAllPlayers();
        gameState = {
          ...gameState,
          players: gameState.players.map((p) => {
            const player = players.find((pl) => pl.seatId === p.seatId);
            return {
              ...p,
              holeCards: player?.holeCards ?? null,
            };
          }),
        };
      }

      const envelope = {
        type: 'game_state',
        table_id: tableId,
        seq: gameState.seq,
        ts: Date.now(),
        payload: gameState,
      };
      ws.send(JSON.stringify(envelope));

      // Handle disconnect
      ws.on('close', () => {
        broadcastManager.unregisterObserver(tableId, ws);
      });

      // Handle errors
      ws.on('error', (err) => {
        console.error('Observer WebSocket error:', err);
      });

      // Observers don't send messages, only receive
      ws.on('message', () => {
        // Ignore messages from observers
      });
    }
  );
}

/**
 * Send error and close connection
 */
function sendErrorAndClose(ws: WebSocket, code: string, message: string): void {
  const envelope = {
    type: 'error',
    ts: Date.now(),
    payload: {
      code,
      message,
      min_supported_protocol_version: MIN_SUPPORTED_PROTOCOL_VERSION,
      skill_doc_url: config.skillDocUrl,
    },
  };

  ws.send(JSON.stringify(envelope));
  ws.close(1008, message);
}
