import { z } from 'zod';

import { ActionKindSchema } from './action.js';
import { CardSchema, HandResultSchema, PotSchema } from './ws.js';

/**
 * Schema for event types
 */
export const EventTypeSchema = z.enum([
  'HAND_START',
  'PLAYER_ACTION',
  'STREET_DEALT',
  'SHOWDOWN',
  'HAND_COMPLETE',
  'POT_AWARDED',
  'PLAYER_TIMEOUT',
  'PLAYER_JOINED',
  'PLAYER_LEFT',
  'TABLE_STARTED',
  'TABLE_ENDED',
]);

/**
 * Schema for hand start event payload
 */
export const HandStartEventPayloadSchema = z.object({
  handNumber: z.number().int(),
  dealerSeat: z.number().int(),
  smallBlindSeat: z.number().int(),
  bigBlindSeat: z.number().int(),
  smallBlind: z.number().int(),
  bigBlind: z.number().int(),
  players: z.array(
    z.object({
      seatId: z.number().int(),
      agentId: z.string(),
      stack: z.number().int(),
      holeCards: z.array(CardSchema),
    })
  ),
});

/**
 * Schema for player action event payload
 */
export const PlayerActionEventPayloadSchema = z.object({
  handNumber: z.number().int(),
  seatId: z.number().int(),
  agentId: z.string(),
  actionId: z.string().uuid(),
  kind: ActionKindSchema,
  amount: z.number().int().optional(),
  isTimeout: z.boolean().default(false),
});

/**
 * Schema for street dealt event payload
 */
export const StreetDealtEventPayloadSchema = z.object({
  handNumber: z.number().int(),
  street: z.enum(['flop', 'turn', 'river']),
  cards: z.array(CardSchema),
});

/**
 * Schema for showdown event payload
 */
export const ShowdownEventPayloadSchema = z.object({
  handNumber: z.number().int(),
  reveals: z.array(
    z.object({
      seatId: z.number().int(),
      agentId: z.string(),
      holeCards: z.array(CardSchema),
      handRank: z.string(),
    })
  ),
});

/**
 * Schema for hand complete event payload
 */
export const HandCompleteEventPayloadSchema = z.object({
  handNumber: z.number().int(),
  results: z.array(HandResultSchema),
  finalPots: z.array(PotSchema),
  communityCards: z.array(CardSchema),
  showdown: z.boolean(),
});

/**
 * Schema for pot awarded event payload
 */
export const PotAwardedEventPayloadSchema = z.object({
  handNumber: z.number().int(),
  potIndex: z.number().int(),
  amount: z.number().int(),
  winnerSeatId: z.number().int(),
  winnerAgentId: z.string(),
  handRank: z.string().optional(),
});

/**
 * Schema for player timeout event payload
 */
export const PlayerTimeoutEventPayloadSchema = z.object({
  handNumber: z.number().int(),
  seatId: z.number().int(),
  agentId: z.string(),
  defaultAction: ActionKindSchema,
});

/**
 * Schema for player joined event payload
 */
export const PlayerJoinedEventPayloadSchema = z.object({
  seatId: z.number().int(),
  agentId: z.string(),
  agentName: z.string().nullable(),
  stack: z.number().int(),
});

/**
 * Schema for player left event payload
 */
export const PlayerLeftEventPayloadSchema = z.object({
  seatId: z.number().int(),
  agentId: z.string(),
});

/**
 * Schema for table started event payload
 */
export const TableStartedEventPayloadSchema = z.object({
  config: z.object({
    blinds: z.object({ small: z.number(), big: z.number() }),
    maxSeats: z.number(),
    initialStack: z.number(),
    actionTimeoutMs: z.number(),
    seed: z.string().optional(),
  }),
});

/**
 * Schema for table ended event payload
 */
export const TableEndedEventPayloadSchema = z.object({
  reason: z.string().optional(),
  finalStacks: z.array(
    z.object({
      seatId: z.number().int(),
      agentId: z.string(),
      stack: z.number().int(),
    })
  ),
});

/**
 * Schema for event record
 */
export const EventRecordSchema = z.object({
  id: z.number().int(),
  table_id: z.string(),
  seq: z.number().int(),
  hand_number: z.number().int().nullable(),
  type: EventTypeSchema,
  payload: z.unknown(),
  created_at: z.coerce.date(),
});
