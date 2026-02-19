import { z } from 'zod';

import {
  ActionKindSchema,
  ActionResultSchema,
  LegalActionSchema,
  PlayerActionSchema,
} from '../schemas/action.js';
import {
  AgentPublicSchema,
  AgentRegistrationResponseSchema,
  AgentRegistrationSchema,
  AgentSchema,
} from '../schemas/agent.js';
import {
  EventRecordSchema,
  EventTypeSchema,
  HandCompleteEventPayloadSchema,
  HandStartEventPayloadSchema,
  PlayerActionEventPayloadSchema,
  PlayerJoinedEventPayloadSchema,
  PlayerLeftEventPayloadSchema,
  PlayerTimeoutEventPayloadSchema,
  PotAwardedEventPayloadSchema,
  ShowdownEventPayloadSchema,
  StreetDealtEventPayloadSchema,
  TableEndedEventPayloadSchema,
  TableStartedEventPayloadSchema,
} from '../schemas/events.js';
import {
  AutoJoinRequestSchema,
  AutoJoinResponseSchema,
} from '../schemas/autoJoin.js';
import {
  DepositInstructionsSchema,
  JoinRequestSchema,
  JoinResponseSchema,
  LeaveRequestSchema,
  LeaveResponseSchema,
} from '../schemas/join.js';
import {
  BlindsSchema,
  CreateTableRequestSchema,
  CreateTableResponseSchema,
  SeatSchema,
  TableConfigSchema,
  TableListItemSchema,
  TableSchema,
  TableStatusSchema,
} from '../schemas/table.js';
import {
  AckPayloadSchema,
  CardSchema,
  ClientActionMessageSchema,
  ClientMessageSchema,
  ClientPingMessageSchema,
  DepositConfirmedPayloadSchema,
  ErrorPayloadSchema,
  GameStatePayloadSchema,
  HandCompletePayloadSchema,
  HandResultSchema,
  PayoutInitiatedPayloadSchema,
  PingPayloadSchema,
  PlayerStateSchema,
  PongPayloadSchema,
  PotSchema,
  TableStatusPayloadSchema,
  WelcomePayloadSchema,
  WsMessageEnvelopeSchema,
  WsMessageTypeSchema,
} from '../schemas/ws.js';

// Agent types
export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;
export type AgentRegistrationResponse = z.infer<typeof AgentRegistrationResponseSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type AgentPublic = z.infer<typeof AgentPublicSchema>;

// Table types
export type Blinds = z.infer<typeof BlindsSchema>;
export type TableConfig = z.infer<typeof TableConfigSchema>;
export type TableStatus = z.infer<typeof TableStatusSchema>;
export type Seat = z.infer<typeof SeatSchema>;
export type Table = z.infer<typeof TableSchema>;
export type TableListItem = z.infer<typeof TableListItemSchema>;
export type CreateTableRequest = z.infer<typeof CreateTableRequestSchema>;
export type CreateTableResponse = z.infer<typeof CreateTableResponseSchema>;

// Join types
export type JoinRequest = z.infer<typeof JoinRequestSchema>;
export type JoinResponse = z.infer<typeof JoinResponseSchema>;
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;
export type LeaveResponse = z.infer<typeof LeaveResponseSchema>;
export type DepositInstructions = z.infer<typeof DepositInstructionsSchema>;

// Auto-join types
export type AutoJoinRequest = z.infer<typeof AutoJoinRequestSchema>;
export type AutoJoinResponse = z.infer<typeof AutoJoinResponseSchema>;

// Action types
export type ActionKind = z.infer<typeof ActionKindSchema>;
export type PlayerAction = z.infer<typeof PlayerActionSchema>;
export type LegalAction = z.infer<typeof LegalActionSchema>;
export type ActionResult = z.infer<typeof ActionResultSchema>;

// WebSocket types
export type Card = z.infer<typeof CardSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type Pot = z.infer<typeof PotSchema>;
export type GameStatePayload = z.infer<typeof GameStatePayloadSchema>;
export type WelcomePayload = z.infer<typeof WelcomePayloadSchema>;
export type AckPayload = z.infer<typeof AckPayloadSchema>;
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;
export type HandResult = z.infer<typeof HandResultSchema>;
export type HandCompletePayload = z.infer<typeof HandCompletePayloadSchema>;
export type PingPayload = z.infer<typeof PingPayloadSchema>;
export type PongPayload = z.infer<typeof PongPayloadSchema>;
export type TableStatusPayload = z.infer<typeof TableStatusPayloadSchema>;
export type WsMessageType = z.infer<typeof WsMessageTypeSchema>;
export type WsMessageEnvelope = z.infer<typeof WsMessageEnvelopeSchema>;
export type ClientActionMessage = z.infer<typeof ClientActionMessageSchema>;
export type ClientPingMessage = z.infer<typeof ClientPingMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type DepositConfirmedPayload = z.infer<typeof DepositConfirmedPayloadSchema>;
export type PayoutInitiatedPayload = z.infer<typeof PayoutInitiatedPayloadSchema>;

// Event types
export type EventType = z.infer<typeof EventTypeSchema>;
export type HandStartEventPayload = z.infer<typeof HandStartEventPayloadSchema>;
export type PlayerActionEventPayload = z.infer<typeof PlayerActionEventPayloadSchema>;
export type StreetDealtEventPayload = z.infer<typeof StreetDealtEventPayloadSchema>;
export type ShowdownEventPayload = z.infer<typeof ShowdownEventPayloadSchema>;
export type HandCompleteEventPayload = z.infer<typeof HandCompleteEventPayloadSchema>;
export type PotAwardedEventPayload = z.infer<typeof PotAwardedEventPayloadSchema>;
export type PlayerTimeoutEventPayload = z.infer<typeof PlayerTimeoutEventPayloadSchema>;
export type PlayerJoinedEventPayload = z.infer<typeof PlayerJoinedEventPayloadSchema>;
export type PlayerLeftEventPayload = z.infer<typeof PlayerLeftEventPayloadSchema>;
export type TableStartedEventPayload = z.infer<typeof TableStartedEventPayloadSchema>;
export type TableEndedEventPayload = z.infer<typeof TableEndedEventPayloadSchema>;
export type EventRecord = z.infer<typeof EventRecordSchema>;
