#!/usr/bin/env node

import { program } from 'commander';

import { MoltPokerClient, MoltPokerWsClient } from '@moltpoker/sdk';
import type { GameStatePayload } from '@moltpoker/shared';

import { CallStationAgent } from './callStation.js';
import { RandomAgent } from './random.js';
import { TightAgent } from './tight.js';
import type { PokerAgent } from './types.js';

// Agent factory
function createAgent(type: string): PokerAgent {
  switch (type.toLowerCase()) {
    case 'random':
      return new RandomAgent();
    case 'tight':
      return new TightAgent();
    case 'callstation':
    case 'call-station':
      return new CallStationAgent();
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
}

// Run agent
async function runAgent(options: {
  type: string;
  server: string;
  tableId?: string;
  name?: string;
  apiKey?: string;
}): Promise<void> {
  const agent = createAgent(options.type);
  console.log(`Starting ${agent.name}...`);

  // Create HTTP client
  const client = new MoltPokerClient({ baseUrl: options.server });

  // Register or use existing API key
  let apiKey = options.apiKey;
  if (!apiKey) {
    console.log('Registering new agent...');
    const registration = await client.register({
      name: options.name ?? agent.name,
    });
    apiKey = registration.api_key;
    console.log(`Registered as ${registration.agent_id}`);
  } else {
    client.setApiKey(apiKey);
  }

  // Find or use specified table
  let tableId = options.tableId;
  if (!tableId) {
    console.log('Looking for available table...');
    const { tables } = await client.listTables();
    const availableTable = tables.find(
      (t) => t.status === 'waiting' && t.availableSeats > 0
    );

    if (!availableTable) {
      console.error('No available tables found. Create a table first.');
      process.exit(1);
    }

    tableId = availableTable.id;
    console.log(`Found table ${tableId}`);
  }

  // Join table
  console.log(`Joining table ${tableId}...`);
  const joinResponse = await client.joinTable(tableId);
  console.log(`Joined as seat ${joinResponse.seat_id}`);

  // Connect WebSocket
  console.log('Connecting WebSocket...');
  const ws = new MoltPokerWsClient({
    wsUrl: joinResponse.ws_url,
    sessionToken: joinResponse.session_token,
  });

  let currentState: GameStatePayload | null = null;
  let mySeatId = joinResponse.seat_id;

  // Handle welcome
  ws.on('welcome', (payload) => {
    console.log(`Connected! Seat: ${payload.seat_id}, Timeout: ${payload.action_timeout_ms}ms`);
    mySeatId = payload.seat_id;
  });

  // Handle game state
  ws.on('game_state', (state) => {
    currentState = state;
    console.log(`\nHand ${state.handNumber}, Phase: ${state.phase}`);
    console.log(`Community: ${state.communityCards.map((c) => c.rank + c.suit).join(' ') || 'none'}`);
    console.log(`Pots: ${state.pots.map((p) => p.amount).join(', ') || 0}`);

    // Log our cards
    const myPlayer = state.players.find((p) => p.seatId === mySeatId);
    if (myPlayer?.holeCards) {
      console.log(`My cards: ${myPlayer.holeCards.map((c) => c.rank + c.suit).join(' ')}`);
      console.log(`My stack: ${myPlayer.stack}`);
    }

    // Check if it's our turn
    if (state.currentSeat === mySeatId && state.legalActions && state.legalActions.length > 0) {
      console.log(`It's my turn! Legal actions: ${state.legalActions.map((a) => a.kind).join(', ')}`);

      try {
        const action = agent.getAction(state, state.legalActions);
        console.log(`Action: ${action.kind}${action.amount ? ` ${action.amount}` : ''}`);
        ws.sendAction(action, state.seq);
      } catch (err) {
        console.error('Error getting action:', err);
        // Default to fold
        ws.sendAction({ action_id: crypto.randomUUID(), kind: 'fold' }, state.seq);
      }
    }
  });

  // Handle ack
  ws.on('ack', (payload) => {
    console.log(`Action ${payload.action_id} acknowledged (seq: ${payload.seq})`);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`Error: ${error.code} - ${error.message}`);
    agent.onError?.(error);
  });

  // Handle hand complete
  ws.on('hand_complete', (payload) => {
    console.log(`\n=== Hand ${payload.handNumber} Complete ===`);
    for (const result of payload.results) {
      const isMe = currentState?.players.find(
        (p) => p.seatId === result.seatId
      )?.seatId === mySeatId;
      const marker = isMe ? ' (ME)' : '';
      console.log(
        `Seat ${result.seatId}${marker}: ${result.holeCards.map((c) => c.rank + c.suit).join(' ')} - ${result.handRank || 'n/a'} - Won: ${result.winnings}`
      );

      if (isMe) {
        agent.onHandComplete?.(payload.handNumber, result.winnings);
      }
    }
    console.log('');
  });

  // Handle player events
  ws.on('player_joined', (payload) => {
    console.log(`Player joined: seat ${payload.seatId} (${payload.agentName || payload.agentId})`);
  });

  ws.on('player_left', (payload) => {
    console.log(`Player left: seat ${payload.seatId}`);
  });

  // Handle connection events
  ws.on('disconnected', (code, reason) => {
    console.log(`Disconnected: ${code} - ${reason}`);
  });

  ws.on('reconnecting', (attempt) => {
    console.log(`Reconnecting... attempt ${attempt}`);
  });

  // Connect
  await ws.connect();

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    ws.disconnect();
    try {
      await client.leaveTable(tableId);
      console.log('Left table');
    } catch {
      // Ignore errors on shutdown
    }
    process.exit(0);
  });

  // Keep running
  console.log('Agent running. Press Ctrl+C to stop.');
}

// CLI
program
  .name('molt-agent')
  .description('Run a MoltPoker reference agent')
  .version('0.1.0')
  .requiredOption('-t, --type <type>', 'Agent type: random, tight, callstation')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
  .option('--table-id <id>', 'Specific table ID to join')
  .option('--name <name>', 'Agent display name')
  .option('--api-key <key>', 'Use existing API key')
  .action(async (options) => {
    try {
      await runAgent(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

program.parse();
