import { z } from 'zod';

import { ActionKindSchema, LegalActionSchema, PlayerActionSchema } from './action.js';

/**
 * Schema for card representation
 */
export const CardSchema = z.object({
  rank: z.string(), // '2'-'9', 'T', 'J', 'Q', 'K', 'A'
  suit: z.enum(['s', 'h', 'd', 'c']), // spades, hearts, diamonds, clubs
});

/**
 * Schema for player state in game
 */
export const PlayerStateSchema = z.object({
  seatId: z.number().int().min(0).max(9),
  agentId: z.string(),
  agentName: z.string().nullable(),
  stack: z.number().int().min(0),
  bet: z.number().int().min(0),
  folded: z.boolean(),
  allIn: z.boolean(),
  isActive: z.boolean(),
  holeCards: z.array(CardSchema).nullable(), // Only visible for own seat
});

/**
 * Schema for pot information
 */
export const PotSchema = z.object({
  amount: z.number().int().min(0),
  eligibleSeats: z.array(z.number().int()),
});

/**
 * Schema for game state payload
 */
export const GameStatePayloadSchema = z.object({
  tableId: z.string(),
  handNumber: z.number().int().min(0),
  phase: z.enum(['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown', 'ended']),
  communityCards: z.array(CardSchema),
  pots: z.array(PotSchema),
  players: z.array(PlayerStateSchema),
  dealerSeat: z.number().int().min(0).max(9),
  currentSeat: z.number().int().min(0).max(9).nullable(),
  lastAction: z
    .object({
      seatId: z.number().int(),
      kind: ActionKindSchema,
      amount: z.number().int().optional(),
    })
    .nullable(),
  legalActions: z.array(LegalActionSchema).nullable(), // Only present when it's your turn
  minRaise: z.number().int().min(0).optional(),
  toCall: z.number().int().min(0).optional(),
  seq: z.number().int(),
});

/**
 * Schema for welcome message payload
 */
export const WelcomePayloadSchema = z.object({
  protocol_version: z.string(),
  min_supported_protocol_version: z.string(),
  skill_doc_url: z.string(),
  seat_id: z.number().int().min(0).max(9),
  agent_id: z.string(),
  action_timeout_ms: z.number().int().positive(),
});

/**
 * Schema for ack payload
 */
export const AckPayloadSchema = z.object({
  action_id: z.string().uuid(),
  seq: z.number().int(),
  success: z.boolean(),
});

/**
 * Schema for error payload
 */
export const ErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  min_supported_protocol_version: z.string().optional(),
  skill_doc_url: z.string().optional(),
});

/**
 * Schema for hand result
 */
export const HandResultSchema = z.object({
  seatId: z.number().int(),
  agentId: z.string(),
  holeCards: z.array(CardSchema),
  handRank: z.string().optional(), // e.g., "Full House, Aces over Kings"
  winnings: z.number().int().min(0),
});

/**
 * Schema for hand complete payload
 */
export const HandCompletePayloadSchema = z.object({
  handNumber: z.number().int(),
  results: z.array(HandResultSchema),
  finalPots: z.array(PotSchema),
  communityCards: z.array(CardSchema),
  showdown: z.boolean(),
});

/**
 * Schema for ping payload
 */
export const PingPayloadSchema = z.object({
  timestamp: z.number().int(),
});

/**
 * Schema for pong payload
 */
export const PongPayloadSchema = z.object({
  timestamp: z.number().int(),
});

/**
 * Schema for table status payload (sent when waiting or when table ends)
 */
const TableStatusPlayerPayloadSchema = z.object({
  status: z.enum(['waiting', 'running']),
  seat_id: z.number().int().min(0).max(9),
  agent_id: z.string(),
  min_players_to_start: z.number().int().min(2),
  current_players: z.number().int().min(0),
});

const TableStatusEndedPayloadSchema = z.object({
  status: z.literal('ended'),
  reason: z.string().optional(),
  final_stacks: z
    .array(
      z.object({
        seat_id: z.number().int(),
        agent_id: z.string(),
        stack: z.number().int(),
      })
    )
    .optional(),
});

export const TableStatusPayloadSchema = z.discriminatedUnion('status', [
  TableStatusPlayerPayloadSchema,
  TableStatusEndedPayloadSchema,
]);

/**
 * Schema for WebSocket message types
 */
export const WsMessageTypeSchema = z.enum([
  'welcome',
  'game_state',
  'action',
  'ack',
  'error',
  'hand_complete',
  'ping',
  'pong',
  'player_joined',
  'player_left',
  'table_status',
]);

/**
 * Schema for WebSocket message envelope
 */
export const WsMessageEnvelopeSchema = z.object({
  type: WsMessageTypeSchema,
  table_id: z.string().optional(),
  seq: z.number().int().optional(),
  ts: z.number().int(), // Unix timestamp ms
  payload: z.unknown(),
});

/**
 * Schema for client action message
 */
export const ClientActionMessageSchema = z.object({
  type: z.literal('action'),
  action: PlayerActionSchema,
  expected_seq: z.number().int().optional(),
});

/**
 * Schema for client ping message
 */
export const ClientPingMessageSchema = z.object({
  type: z.literal('ping'),
  payload: PingPayloadSchema,
});

/**
 * Union of all client message types
 */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  ClientActionMessageSchema,
  ClientPingMessageSchema,
]);
