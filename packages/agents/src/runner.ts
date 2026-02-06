#!/usr/bin/env node


import { MoltPokerClient, MoltPokerWsClient } from '@moltpoker/sdk';
import type { GameStatePayload } from '@moltpoker/shared';
import { program } from 'commander';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { CallStationAgent } from './callStation.js';
import { LlmAgent } from './llm.js';
import { RandomAgent } from './random.js';
import { TightAgent } from './tight.js';
import type { PokerAgent } from './types.js';
import {
  formatChosenAction,
  formatCommunityLine,
  formatHandCompleteHeader,
  formatHandHeader,
  formatLegalActionsLine,
  formatMyCardsLine,
  formatSeatResultLine,
  formatStackLine,
} from './utils/output.js';

function loadEnvFiles(): void {
  const envFiles = ['.env.local', '.env']
  let currentDir = process.cwd()

  for (let depth = 0; depth < 4; depth++) {
    for (const envFile of envFiles) {
      const envPath = resolve(currentDir, envFile)
      if (existsSync(envPath)) loadEnv({ path: envPath, override: false })
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }
}

loadEnvFiles()

/**
 * Parse a provider:model string (e.g. "openai:gpt-4.1") into an AI SDK LanguageModel.
 * Dynamically imports the provider package to avoid loading unused providers.
 */
async function resolveModel(modelSpec: string) {
  const [provider, ...rest] = modelSpec.split(':');
  const modelId = rest.join(':'); // rejoin in case model name contains ':'

  if (!provider || !modelId)
    throw new Error(
      `Invalid model spec "${modelSpec}". Expected format: provider:model (e.g. openai:gpt-4.1)`,
    );

  switch (provider.toLowerCase()) {
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      return openai(modelId);
    }
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(modelId);
    }
    default:
      throw new Error(`Unsupported LLM provider: "${provider}". Supported: openai, anthropic`);
  }
}

// Agent factory
async function createAgent(
  type: string,
  options: { model?: string; skillDoc?: string },
): Promise<PokerAgent> {
  switch (type.toLowerCase()) {
    case 'random':
      return new RandomAgent();
    case 'tight':
      return new TightAgent();
    case 'callstation':
    case 'call-station':
      return new CallStationAgent();
    case 'llm': {
      if (!options.model)
        throw new Error('--model is required for LLM agent (e.g. openai:gpt-4.1)');
      const model = await resolveModel(options.model);
      return new LlmAgent({ model, skillDocPath: options.skillDoc });
    }
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
  model?: string;
  skillDoc?: string;
  llmLog?: boolean;
}): Promise<void> {
  const agent = await createAgent(options.type, {
    model: options.model,
    skillDoc: options.skillDoc,
  });
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

  if (!tableId) {
    throw new Error('Table ID is required to join');
  }
  const resolvedTableId = tableId;

  // Enable LLM logging if requested
  if (options.llmLog && agent instanceof LlmAgent) {
    const logPath = join(process.cwd(), 'logs', `llm-${resolvedTableId}.jsonl`)
    agent.enableLogging(logPath)
    console.log(`LLM logging enabled: ${logPath}`)
  }

  // Join table
  console.log(`Joining table ${resolvedTableId}...`);
  const joinResponse = await client.joinTable(resolvedTableId);
  console.log(`Joined as seat ${joinResponse.seat_id}`);

  // Connect WebSocket
  console.log('Connecting WebSocket...');
  const ws = new MoltPokerWsClient({
    wsUrl: joinResponse.ws_url,
    sessionToken: joinResponse.session_token,
  });

  let currentState: GameStatePayload | null = null;
  let mySeatId = joinResponse.seat_id;
  let isShuttingDown = false;

  async function shutdown(reason: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\nShutting down (${reason})...`);
    ws.disconnect();
    try {
      await client.leaveTable(resolvedTableId);
      console.log('Left table');
    } catch {
      // Ignore errors on shutdown
    }
    process.exit(0);
  }

  function safeSendAction(action: Parameters<MoltPokerWsClient['sendAction']>[0], expectedSeq?: number): void {
    if (isShuttingDown) return;
    if (!ws.isConnected()) {
      console.warn('Skipping action: WebSocket is disconnected');
      return;
    }
    try {
      ws.sendAction(action, expectedSeq);
    } catch (err) {
      console.error('Failed to send action:', err);
    }
  }

  // Handle welcome
  ws.on('welcome', (payload) => {
    console.log(`Connected! Seat: ${payload.seat_id}, Timeout: ${payload.action_timeout_ms}ms`);
    mySeatId = payload.seat_id;
  });

  // Handle game state
  ws.on('game_state', async (state) => {
    currentState = state;
    const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0);
    console.log(`\n${formatHandHeader({ handNumber: state.handNumber, phase: state.phase, totalPot })}`);
    console.log(formatCommunityLine(state.communityCards));

    // Log our cards
    const myPlayer = state.players.find((p) => p.seatId === mySeatId);
    if (myPlayer?.holeCards) {
      console.log(formatMyCardsLine({ cards: myPlayer.holeCards, seatId: mySeatId }));
      console.log(formatStackLine({ stack: myPlayer.stack, toCall: state.toCall ?? 0 }));
    }

    // Check if it's our turn
    if (state.currentSeat === mySeatId && state.legalActions && state.legalActions.length > 0) {
      console.log(formatLegalActionsLine(state.legalActions));

      try {
        const action = await agent.getAction(state, state.legalActions);
        console.log(formatChosenAction(action));
        safeSendAction(action, state.seq);
      } catch (err) {
        console.error('Error getting action:', err);
        // Default to fold
        safeSendAction({ action_id: crypto.randomUUID(), kind: 'fold' }, state.seq);
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
    console.log(`\n${formatHandCompleteHeader(payload.handNumber)}`);
    for (const result of payload.results) {
      const isMe = currentState?.players.find(
        (p) => p.seatId === result.seatId
      )?.seatId === mySeatId;
      console.log(formatSeatResultLine({
        seatId: result.seatId,
        isMe: isMe ?? false,
        cards: result.holeCards,
        handRank: result.handRank,
        winnings: result.winnings,
      }));

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

  // Handle table status (waiting for game to start)
  ws.on('table_status', (payload) => {
    if (payload.status === 'ended') {
      const reason = payload.reason ?? 'table ended';
      console.log(`Table status: ended (${reason})`);
      shutdown(reason).catch((err) => {
        console.error('Failed to shut down cleanly:', err);
        process.exit(1);
      });
      return;
    }

    console.log(`Table status: ${payload.status} (${payload.current_players}/${payload.min_players_to_start} players)`);
    if (payload.status === 'waiting') {
      console.log('Waiting for more players to join...');
    }
  });

  // Handle connection events
  ws.on('disconnected', (code, reason) => {
    console.log(`Disconnected: ${code} - ${reason}`);
    const normalizedReason = (reason ?? '').toLowerCase();
    if (!isShuttingDown && (normalizedReason.includes('table ended') || normalizedReason.includes('kicked'))) {
      shutdown(reason ?? 'disconnected').catch((err) => {
        console.error('Failed to shut down cleanly:', err);
        process.exit(1);
      });
    }
  });

  ws.on('reconnecting', (attempt) => {
    console.log(`Reconnecting... attempt ${attempt}`);
  });

  // Connect
  await ws.connect();

  // Handle shutdown
  process.on('SIGINT', async () => {
    await shutdown('interrupt');
  });

  // Keep running
  console.log('Agent running. Press Ctrl+C to stop.');
}

// CLI
program
  .name('molt-agent')
  .description('Run a MoltPoker reference agent')
  .version('0.1.0')
  .requiredOption('-t, --type <type>', 'Agent type: random, tight, callstation, llm')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
  .option('--table-id <id>', 'Specific table ID to join')
  .option('--name <name>', 'Agent display name')
  .option('--api-key <key>', 'Use existing API key')
  .option('--model <provider:model>', 'LLM model (e.g. openai:gpt-4.1, anthropic:claude-sonnet-4-5)')
  .option('--skill-doc <path>', 'Path to skill.md file (required for LLM agent)')
  .option('--llm-log', 'Enable JSONL logging of LLM prompts/responses (per table)')
  .action(async (options) => {
    try {
      await runAgent(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

program.parse();
