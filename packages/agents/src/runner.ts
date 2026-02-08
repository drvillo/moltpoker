#!/usr/bin/env node


import { MoltPokerClient, MoltPokerWsClient } from '@moltpoker/sdk';
import type { GameStatePayload } from '@moltpoker/shared';
import { program } from 'commander';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { AutonomousAgent } from './autonomous.js';
import type { StepEvent } from './autonomous.js';
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

// ─── Poker Display Formatter (for autonomous agent) ──────────────────────────

function safeParseJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) as Record<string, unknown> } catch { return null }
}

/**
 * Normalise a card value that may be either a compact string ("Qs") or
 * a full Card object ({rank:"Q",suit:"s"}) into a Card object.
 */
function normalizeCard(c: unknown): { rank: string; suit: string } {
  if (typeof c === 'string' && c.length >= 2)
    return { rank: c[0]!, suit: c[1]! }
  if (c && typeof c === 'object' && 'rank' in (c as Record<string, unknown>))
    return c as { rank: string; suit: string }
  return { rank: '?', suit: '?' }
}

function normalizeCards(arr: unknown): Array<{ rank: string; suit: string }> {
  if (!Array.isArray(arr)) return []
  return arr.map(normalizeCard)
}

/**
 * Normalise legal actions from either human format ({kind, minAmount, maxAmount})
 * or compact format ({kind, min, max}) into the shape expected by formatLegalActionsLine.
 */
function normalizeLegalActions(arr: unknown): Array<{ kind: string; minAmount?: number; maxAmount?: number }> {
  if (!Array.isArray(arr)) return []
  return arr.map((a: Record<string, unknown>) => {
    const out: { kind: string; minAmount?: number; maxAmount?: number } = { kind: a.kind as string }
    if (a.minAmount !== undefined) out.minAmount = a.minAmount as number
    else if (a.min !== undefined) out.minAmount = a.min as number
    if (a.maxAmount !== undefined) out.maxAmount = a.maxAmount as number
    else if (a.max !== undefined) out.maxAmount = a.max as number
    return out
  })
}

/**
 * Creates an onStep callback that formats autonomous agent tool results
 * using the same shared output utilities as the LLM / scripted agents.
 * The agent itself stays domain-agnostic; all MoltPoker-specific
 * interpretation lives here in the runner.
 *
 * Handles both the verbose (human) and compact (agent) WebSocket formats.
 */
function createPokerDisplayFormatter(agentName: string): (step: StepEvent) => void {
  let mySeatId = -1

  function handleWsMessage(msg: Record<string, unknown>): void {
    if (!msg || typeof msg !== 'object') return
    const msgRecord = msg as Record<string, unknown>
    // Human format wraps data in `payload`; compact format is flat.
    const payload = (msgRecord.payload as Record<string, unknown> | undefined) ?? msgRecord

    switch (msgRecord.type) {
      case 'welcome':
        // Human: payload.seat_id, payload.action_timeout_ms | Compact: seat, timeout
        mySeatId = (payload.seat_id ?? payload.seat ?? -1) as number
        console.log(`Connected! Seat: ${mySeatId}, Timeout: ${payload.action_timeout_ms ?? payload.timeout}ms`)
        break

      case 'game_state': {
        // Pot: human has pots array, compact has pot number
        const totalPot = typeof payload.pot === 'number'
          ? payload.pot as number
          : ((payload.pots as Array<{ amount: number }>) ?? []).reduce((sum, p) => sum + p.amount, 0)

        // Hand number: human=handNumber, compact=hand
        const handNumber = (payload.handNumber ?? payload.hand_number ?? payload.hand) as number
        const phase = (payload.phase ?? payload.street) as string

        // Community cards: human=communityCards (Card[]), compact=board (string[])
        const communityCards = normalizeCards(payload.communityCards ?? payload.community_cards ?? payload.board)

        console.log(`\n${formatHandHeader({ handNumber, phase, totalPot })}`)
        console.log(formatCommunityLine(communityCards as never[]))

        // Find my player: human uses seatId, compact uses seat
        const players = (payload.players ?? []) as Array<Record<string, unknown>>
        const myPlayer = players.find((p) => (p.seatId ?? p.seat) === mySeatId)

        // Hole cards: human=holeCards (Card[]), compact=cards (string[])
        const myCards = normalizeCards(myPlayer?.holeCards ?? myPlayer?.cards)
        if (myCards.length > 0) {
          console.log(formatMyCardsLine({ cards: myCards as never[], seatId: mySeatId }))
          console.log(formatStackLine({ stack: myPlayer?.stack as number, toCall: (payload.toCall ?? payload.to_call ?? 0) as number }))
        }

        // Legal actions: human=legalActions/currentSeat, compact=actions/turn
        const currentSeat = (payload.currentSeat ?? payload.turn) as number | null | undefined
        const legalActions = normalizeLegalActions(payload.legalActions ?? payload.legal_actions ?? payload.actions)
        if (currentSeat === mySeatId && legalActions.length > 0)
          console.log(formatLegalActionsLine(legalActions as never[]))

        break
      }

      case 'ack':
        console.log(`Action ${payload.action_id ?? payload.actionId} acknowledged (seq: ${payload.seq ?? msgRecord.seq})`)
        break

      case 'error':
        console.error(`Error: ${payload.code ?? msgRecord.code} - ${payload.message ?? msgRecord.message}`)
        break

      case 'hand_complete': {
        // Hand number: human=handNumber, compact=hand
        const handNumber = (payload.handNumber ?? payload.hand_number ?? payload.hand) as number
        console.log(`\n${formatHandCompleteHeader(handNumber)}`)
        const results = (payload.results ?? []) as Array<Record<string, unknown>>
        for (const r of results) {
          // Seat: human=seatId, compact=seat
          const seatId = (r.seatId ?? r.seat) as number
          const isMe = seatId === mySeatId
          // Cards: human=holeCards (Card[]), compact=cards (string[])
          const cards = normalizeCards(r.holeCards ?? r.cards)
          // Hand rank: human=handRank, compact=rank
          const handRank = (r.handRank ?? r.rank) as string | null | undefined
          // Winnings: human=winnings, compact=won
          const winnings = (r.winnings ?? r.won ?? 0) as number
          console.log(formatSeatResultLine({
            seatId,
            isMe,
            cards: cards as never[],
            handRank,
            winnings,
          }))
          if (isMe && winnings > 0)
            console.log(`[${agentName}] Hand ${handNumber}: Won ${winnings}!`)
        }
        console.log('')
        break
      }

      case 'table_status':
        if (msg.status === 'ended') {
          console.log(`\nTable status: ended (${(msg.reason as string) ?? 'table ended'})`)
        } else {
          console.log(`Table status: ${msg.status} (${msg.current_players}/${msg.min_players_to_start} players)`)
          if (msg.status === 'waiting') console.log('Waiting for more players to join...')
        }
        break

      case 'player_joined':
        console.log(`Player joined: seat ${msg.seatId} (${msg.agentName || msg.agentId})`)
        break

      case 'player_left':
        console.log(`Player left: seat ${msg.seatId}`)
        break
    }
  }

  return (step: StepEvent) => {
    for (const t of step.tools) {
      switch (t.toolName) {
        case 'fetch_document':
          // Silent – the skill doc fetch is an internal bootstrap step
          break

        case 'http_request': {
          const input = t.input as Record<string, unknown> | null
          const output = t.output as Record<string, unknown> | null
          const body = safeParseJson(output?.body)

          if (input?.method === 'POST' && typeof input.url === 'string' && input.url.endsWith('/v1/agents')) {
            console.log('Registering new agent...')
            if (body?.agent_id) console.log(`Registered as ${body.agent_id}`)
          } else if (input?.method === 'GET' && typeof input.url === 'string' && input.url.endsWith('/v1/tables')) {
            console.log('Looking for available table...')
            const tables = (body?.tables ?? []) as Array<Record<string, unknown>>
            const table = tables.find((tb) => tb.status === 'waiting' && (tb.availableSeats as number) > 0)
            if (table) console.log(`Found table ${table.id}`)
          } else if (input?.method === 'POST' && typeof input.url === 'string' && input.url.includes('/join')) {
            // Extract table ID from URL
            const tableMatch = (input.url as string).match(/tables\/([^/]+)\/join/)
            const tableId = tableMatch?.[1] ?? 'unknown'
            console.log(`Joining table ${tableId}...`)
            if (body?.seat_id !== undefined) {
              mySeatId = body.seat_id as number
              console.log(`Joined as seat ${body.seat_id}`)
            }
          }
          break
        }

        case 'websocket_connect': {
          const output = t.output as Record<string, unknown> | null
          if (output?.connectionId) console.log('Connecting WebSocket...')
          break
        }

        case 'websocket_read': {
          const output = t.output as Record<string, unknown> | null
          const msgs = (output?.messages ?? []) as Array<Record<string, unknown>>
          for (const msg of msgs) handleWsMessage(msg)
          if (output?.connectionClosed) console.log('WebSocket connection closed.')
          break
        }

        case 'websocket_send': {
          const input = t.input as Record<string, unknown> | null
          const parsed = safeParseJson(input?.message)
          if (parsed?.type === 'action' && parsed.action)
            console.log(formatChosenAction(parsed.action as { kind: string; amount?: number }))
          break
        }

        // generate_uuid: silent
      }
    }

    // Show agent text output (conclusions, end-of-game messages)
    if (step.text) {
      const preview = step.text.length > 300 ? step.text.slice(0, 300) + '...' : step.text
      console.log(`[${agentName}] ${preview}`)
    }
  }
}

// Run autonomous agent (thin wrapper — the agent does everything)
async function runAutonomousAgent(options: {
  server: string;
  name?: string;
  model?: string;
  skillUrl?: string;
  skillDoc?: string;
  llmLog?: boolean;
}): Promise<void> {
  if (!options.model)
    throw new Error('--model is required for autonomous agent (e.g. openai:gpt-4.1)')
  if (!options.skillUrl)
    throw new Error('--skill-url is required for autonomous agent' +
      (options.skillDoc ? ' (did you mean --skill-url instead of --skill-doc?)' : ''))

  const model = await resolveModel(options.model)
  const agentName = options.name ?? 'AutonomousAgent'

  const logPath = options.llmLog
    ? join(process.cwd(), 'logs', `autonomous-${Date.now()}.jsonl`)
    : undefined

  const onStep = createPokerDisplayFormatter(agentName)
  const agent = new AutonomousAgent({ model, temperature: 0.3, logPath, onStep })

  const task =
    `Visit ${options.skillUrl} to learn how to interact with this platform. ` +
    `The server base URL is ${options.server}. ` +
    `Register as an agent${options.name ? ` named "${options.name}"` : ''}, ` +
    `find an available table, join it, and play. Continue playing until the table ends or you are told to stop.`

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping autonomous agent...')
    agent.stop()
  })

  console.log(`Starting ${agentName}...`)
  if (logPath) console.log(`Logging to: ${logPath}`)
  console.log('Agent running. Press Ctrl+C to stop.')
  await agent.run(task)
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
  skillUrl?: string;
  llmLog?: boolean;
}): Promise<void> {
  // Autonomous agent — completely self-contained, no SDK interaction needed
  if (options.type.toLowerCase() === 'autonomous') {
    await runAutonomousAgent(options)
    return
  }

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

  const MAX_ACTION_RETRIES = 2;

  let currentState: GameStatePayload | null = null;
  let mySeatId = joinResponse.seat_id;
  let isShuttingDown = false;
  let retryCount = 0;
  let pendingRetryState: { state: GameStatePayload; legalActions: NonNullable<GameStatePayload['legalActions']> } | null = null;

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

  // Retry-aware turn handler: gets an action from the agent and sends it
  async function handleTurn(state: GameStatePayload, legalActions: NonNullable<GameStatePayload['legalActions']>, previousError?: string): Promise<void> {
    try {
      const action = await agent.getAction(state, legalActions, previousError);
      console.log(formatChosenAction(action));
      pendingRetryState = { state, legalActions };
      safeSendAction(action, state.seq);
    } catch (err) {
      // LLM call itself failed -- count as a retry attempt
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[${agent.name}] Action call failed:`, errorMsg);

      retryCount++;
      if (retryCount <= MAX_ACTION_RETRIES) {
        console.log(`Retrying action (attempt ${retryCount}/${MAX_ACTION_RETRIES})...`);
        await handleTurn(state, legalActions, `Agent call failed: ${errorMsg}`);
      } else {
        // Max retries exhausted -- let server timeout handle it (check/fold)
        console.error(`Max retries (${MAX_ACTION_RETRIES}) exhausted. Server timeout will apply default.`);
        pendingRetryState = null;
      }
    }
  }

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
      retryCount = 0;
      pendingRetryState = null;
      await handleTurn(state, state.legalActions);
    }
  });

  // Handle ack
  ws.on('ack', (payload) => {
    console.log(`Action ${payload.action_id} acknowledged (seq: ${payload.seq})`);
  });

  // Handle errors -- retry on INVALID_ACTION if retries remain
  ws.on('error', (error) => {
    console.error(`Error: ${error.code} - ${error.message}`);
    agent.onError?.(error);

    if (error.code === 'INVALID_ACTION' && pendingRetryState && retryCount < MAX_ACTION_RETRIES) {
      retryCount++;
      console.log(`Retrying action (attempt ${retryCount}/${MAX_ACTION_RETRIES})...`);
      const { state, legalActions } = pendingRetryState;
      handleTurn(state, legalActions, error.message).catch((err) => {
        console.error('Retry failed:', err);
      });
    } else if (error.code === 'INVALID_ACTION' && retryCount >= MAX_ACTION_RETRIES) {
      pendingRetryState = null;
      console.error(`Max retries (${MAX_ACTION_RETRIES}) exhausted. Server timeout will apply default.`);
    }
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
  .requiredOption('-t, --type <type>', 'Agent type: random, tight, callstation, llm, autonomous')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
  .option('--table-id <id>', 'Specific table ID to join')
  .option('--name <name>', 'Agent display name')
  .option('--api-key <key>', 'Use existing API key')
  .option('--model <provider:model>', 'LLM model (e.g. openai:gpt-4.1, anthropic:claude-sonnet-4-5)')
  .option('--skill-doc <path>', 'Path to skill.md file (required for LLM agent)')
  .option('--skill-url <url>', 'URL to skill.md document (required for autonomous agent)')
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
