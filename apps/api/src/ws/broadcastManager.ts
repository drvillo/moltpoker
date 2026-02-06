
import type { TableRuntime } from '@moltpoker/poker';
import type {
  ErrorPayload,
  GameStatePayload,
  HandCompletePayload,
  TableStatusPayload,
  WelcomePayload,
  WsMessageEnvelope,
} from '@moltpoker/shared';
import type { WebSocket } from 'ws';

interface Connection {
  ws: WebSocket;
  agentId: string;
  seatId: number;
}

interface PendingConnection {
  ws: WebSocket;
  agentId: string;
  seatId: number;
}

/**
 * Broadcast manager for WebSocket connections
 */
class BroadcastManager {
  // tableId -> connections
  private connections: Map<string, Map<string, Connection>> = new Map();
  // tableId -> observer connections
  private observers: Map<string, Set<WebSocket>> = new Map();
  // tableId -> pending connections (waiting tables without runtime)
  private pendingConnections: Map<string, Map<string, PendingConnection>> = new Map();

  /**
   * Register a connection for a table
   */
  register(tableId: string, agentId: string, seatId: number, ws: WebSocket): void {
    if (!this.connections.has(tableId)) {
      this.connections.set(tableId, new Map());
    }

    const tableConnections = this.connections.get(tableId)!;
    tableConnections.set(agentId, { ws, agentId, seatId });

    // Handle disconnect
    ws.on('close', () => {
      this.unregister(tableId, agentId);
    });
  }

  /**
   * Unregister a connection
   */
  unregister(tableId: string, agentId: string): void {
    const tableConnections = this.connections.get(tableId);
    if (tableConnections) {
      tableConnections.delete(agentId);
      if (tableConnections.size === 0) {
        this.connections.delete(tableId);
      }
    }
  }

  /**
   * Register an observer connection
   */
  registerObserver(tableId: string, ws: WebSocket): void {
    if (!this.observers.has(tableId)) {
      this.observers.set(tableId, new Set());
    }
    this.observers.get(tableId)!.add(ws);

    ws.on('close', () => {
      this.unregisterObserver(tableId, ws);
    });
  }

  /**
   * Unregister an observer
   */
  unregisterObserver(tableId: string, ws: WebSocket): void {
    const tableObservers = this.observers.get(tableId);
    if (tableObservers) {
      tableObservers.delete(ws);
      if (tableObservers.size === 0) {
        this.observers.delete(tableId);
      }
    }
  }

  /**
   * Register a pending connection (for waiting tables without a runtime)
   */
  registerPending(tableId: string, agentId: string, seatId: number, ws: WebSocket): void {
    if (!this.pendingConnections.has(tableId)) {
      this.pendingConnections.set(tableId, new Map());
    }

    const tablePending = this.pendingConnections.get(tableId)!;
    tablePending.set(agentId, { ws, agentId, seatId });

    ws.on('close', () => {
      this.unregisterPending(tableId, agentId);
    });
  }

  /**
   * Unregister a pending connection
   */
  unregisterPending(tableId: string, agentId: string): void {
    const tablePending = this.pendingConnections.get(tableId);
    if (tablePending) {
      tablePending.delete(agentId);
      if (tablePending.size === 0) {
        this.pendingConnections.delete(tableId);
      }
    }
  }

  /**
   * Get all pending connections for a table
   */
  getPendingConnections(tableId: string): PendingConnection[] {
    const tablePending = this.pendingConnections.get(tableId);
    return tablePending ? [...tablePending.values()] : [];
  }

  /**
   * Promote all pending connections to active connections.
   * Called when a waiting table transitions to running.
   */
  promotePendingConnections(tableId: string): PendingConnection[] {
    const tablePending = this.pendingConnections.get(tableId);
    if (!tablePending || tablePending.size === 0) return [];

    const promoted: PendingConnection[] = [];
    for (const pending of tablePending.values()) {
      // Register as a real connection (skip close listener since pending already has one)
      if (!this.connections.has(tableId)) {
        this.connections.set(tableId, new Map());
      }
      this.connections.get(tableId)!.set(pending.agentId, {
        ws: pending.ws,
        agentId: pending.agentId,
        seatId: pending.seatId,
      });
      promoted.push(pending);
    }

    // Clear pending map for this table
    this.pendingConnections.delete(tableId);
    return promoted;
  }

  /**
   * Send table_status message to a connection
   */
  sendTableStatus(ws: WebSocket, tableId: string, payload: TableStatusPayload): void {
    this.send(ws, this.createEnvelope('table_status', payload, tableId));
  }

  /**
   * Broadcast table_status to all connections for a table
   */
  broadcastTableStatus(
    tableId: string,
    payload: TableStatusPayload,
    options?: { includeObservers?: boolean; includePending?: boolean }
  ): void {
    const { includeObservers = false, includePending = true } = options ?? {};

    const envelope = this.createEnvelope('table_status', payload, tableId);
    const connections = this.getConnections(tableId);
    for (const conn of connections) {
      this.send(conn.ws, envelope);
    }

    if (includePending) {
      const pending = this.getPendingConnections(tableId);
      for (const conn of pending) {
        this.send(conn.ws, envelope);
      }
    }

    if (includeObservers) {
      const observers = this.observers.get(tableId);
      if (observers) {
        for (const ws of observers) {
          this.send(ws, envelope);
        }
      }
    }
  }

  /**
   * Get connection for an agent
   */
  getConnection(tableId: string, agentId: string): Connection | undefined {
    return this.connections.get(tableId)?.get(agentId);
  }

  /**
   * Get all connections for a table
   */
  getConnections(tableId: string): Connection[] {
    const tableConnections = this.connections.get(tableId);
    return tableConnections ? [...tableConnections.values()] : [];
  }

  /**
   * Send a message to a specific WebSocket
   */
  private send(ws: WebSocket, message: WsMessageEnvelope): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Create a message envelope
   */
  private createEnvelope(
    type: WsMessageEnvelope['type'],
    payload: unknown,
    tableId?: string,
    seq?: number
  ): WsMessageEnvelope {
    return {
      type,
      table_id: tableId,
      seq,
      ts: Date.now(),
      payload,
    };
  }

  /**
   * Send welcome message to a connection
   */
  sendWelcome(tableId: string, agentId: string, payload: WelcomePayload): void {
    const conn = this.getConnection(tableId, agentId);
    if (conn) {
      this.send(conn.ws, this.createEnvelope('welcome', payload, tableId));
    }
  }

  /**
   * Send game state to a specific connection
   */
  sendGameState(tableId: string, agentId: string, state: GameStatePayload): void {
    const conn = this.getConnection(tableId, agentId);
    if (conn) {
      this.send(conn.ws, this.createEnvelope('game_state', state, tableId, state.seq));
    }
  }

  /**
   * Send ack to a specific connection
   */
  sendAck(
    tableId: string,
    agentId: string,
    actionId: string,
    seq: number,
    success: boolean
  ): void {
    const conn = this.getConnection(tableId, agentId);
    if (conn) {
      this.send(conn.ws, this.createEnvelope('ack', { action_id: actionId, seq, success }, tableId, seq));
    }
  }

  /**
   * Send error to a specific connection
   */
  sendError(tableId: string, agentId: string, error: ErrorPayload): void {
    const conn = this.getConnection(tableId, agentId);
    if (conn) {
      this.send(conn.ws, this.createEnvelope('error', error, tableId));
    }
  }

  /**
   * Broadcast game state to all connections at a table
   */
  broadcastGameState(tableId: string, runtime: TableRuntime): void {
    const connections = this.getConnections(tableId);

    for (const conn of connections) {
      const state = runtime.getStateForSeat(conn.seatId);
      this.send(conn.ws, this.createEnvelope('game_state', state, tableId, state.seq));
    }

    // Send public state to observers
    const observers = this.observers.get(tableId);
    if (observers) {
      const publicState = runtime.getPublicState();
      const envelope = this.createEnvelope('game_state', publicState, tableId, publicState.seq);
      for (const ws of observers) {
        this.send(ws, envelope);
      }
    }
  }

  /**
   * Broadcast hand complete to all connections at a table
   */
  broadcastHandComplete(tableId: string, payload: HandCompletePayload): void {
    const connections = this.getConnections(tableId);
    const envelope = this.createEnvelope('hand_complete', payload, tableId);

    for (const conn of connections) {
      this.send(conn.ws, envelope);
    }

    // Send to observers
    const observers = this.observers.get(tableId);
    if (observers) {
      for (const ws of observers) {
        this.send(ws, envelope);
      }
    }
  }

  /**
   * Broadcast player joined to all connections
   */
  broadcastPlayerJoined(
    tableId: string,
    seatId: number,
    agentId: string,
    agentName: string | null,
    stack: number
  ): void {
    const envelope = this.createEnvelope(
      'player_joined',
      { seatId, agentId, agentName, stack },
      tableId
    );

    const connections = this.getConnections(tableId);
    for (const conn of connections) {
      this.send(conn.ws, envelope);
    }

    const observers = this.observers.get(tableId);
    if (observers) {
      for (const ws of observers) {
        this.send(ws, envelope);
      }
    }
  }

  /**
   * Broadcast player left to all connections
   */
  broadcastPlayerLeft(tableId: string, seatId: number, agentId: string): void {
    const envelope = this.createEnvelope('player_left', { seatId, agentId }, tableId);

    const connections = this.getConnections(tableId);
    for (const conn of connections) {
      this.send(conn.ws, envelope);
    }

    const observers = this.observers.get(tableId);
    if (observers) {
      for (const ws of observers) {
        this.send(ws, envelope);
      }
    }
  }

  /**
   * Send pong response
   */
  sendPong(ws: WebSocket, timestamp: number): void {
    const envelope: WsMessageEnvelope = {
      type: 'pong',
      ts: Date.now(),
      payload: { timestamp },
    };
    this.send(ws, envelope);
  }

  /**
   * Get connection count for a table
   */
  getConnectionCount(tableId: string): number {
    return this.connections.get(tableId)?.size ?? 0;
  }

  /**
   * Disconnect all connections for a table
   */
  disconnectAll(tableId: string): void {
    const connections = this.getConnections(tableId);
    for (const conn of connections) {
      conn.ws.close(1000, 'Table ended');
    }
    this.connections.delete(tableId);

    // Close pending connections too
    const pending = this.getPendingConnections(tableId);
    for (const conn of pending) {
      conn.ws.close(1000, 'Table ended');
    }
    this.pendingConnections.delete(tableId);

    const observers = this.observers.get(tableId);
    if (observers) {
      for (const ws of observers) {
        ws.close(1000, 'Table ended');
      }
      this.observers.delete(tableId);
    }
  }
}

export const broadcastManager = new BroadcastManager();
