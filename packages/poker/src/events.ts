import type {
  EventType,
  HandCompleteEventPayload,
  HandStartEventPayload,
  PlayerActionEventPayload,
  PlayerJoinedEventPayload,
  PlayerLeftEventPayload,
  PlayerTimeoutEventPayload,
  PotAwardedEventPayload,
  ShowdownEventPayload,
  StreetDealtEventPayload,
  TableEndedEventPayload,
  TableStartedEventPayload,
} from '@moltpoker/shared';

/**
 * Event types for game logging
 */
export const EventTypes = {
  HAND_START: 'HAND_START',
  PLAYER_ACTION: 'PLAYER_ACTION',
  STREET_DEALT: 'STREET_DEALT',
  SHOWDOWN: 'SHOWDOWN',
  HAND_COMPLETE: 'HAND_COMPLETE',
  POT_AWARDED: 'POT_AWARDED',
  PLAYER_TIMEOUT: 'PLAYER_TIMEOUT',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  TABLE_STARTED: 'TABLE_STARTED',
  TABLE_ENDED: 'TABLE_ENDED',
} as const;

export type GameEvent =
  | { type: 'HAND_START'; payload: HandStartEventPayload }
  | { type: 'PLAYER_ACTION'; payload: PlayerActionEventPayload }
  | { type: 'STREET_DEALT'; payload: StreetDealtEventPayload }
  | { type: 'SHOWDOWN'; payload: ShowdownEventPayload }
  | { type: 'HAND_COMPLETE'; payload: HandCompleteEventPayload }
  | { type: 'POT_AWARDED'; payload: PotAwardedEventPayload }
  | { type: 'PLAYER_TIMEOUT'; payload: PlayerTimeoutEventPayload }
  | { type: 'PLAYER_JOINED'; payload: PlayerJoinedEventPayload }
  | { type: 'PLAYER_LEFT'; payload: PlayerLeftEventPayload }
  | { type: 'TABLE_STARTED'; payload: TableStartedEventPayload }
  | { type: 'TABLE_ENDED'; payload: TableEndedEventPayload };

/**
 * Helper to create typed events
 */
export function createEvent<T extends EventType>(
  type: T,
  payload: T extends 'HAND_START'
    ? HandStartEventPayload
    : T extends 'PLAYER_ACTION'
      ? PlayerActionEventPayload
      : T extends 'STREET_DEALT'
        ? StreetDealtEventPayload
        : T extends 'SHOWDOWN'
          ? ShowdownEventPayload
          : T extends 'HAND_COMPLETE'
            ? HandCompleteEventPayload
            : T extends 'POT_AWARDED'
              ? PotAwardedEventPayload
              : T extends 'PLAYER_TIMEOUT'
                ? PlayerTimeoutEventPayload
                : T extends 'PLAYER_JOINED'
                  ? PlayerJoinedEventPayload
                  : T extends 'PLAYER_LEFT'
                    ? PlayerLeftEventPayload
                    : T extends 'TABLE_STARTED'
                      ? TableStartedEventPayload
                      : T extends 'TABLE_ENDED'
                        ? TableEndedEventPayload
                        : never
): GameEvent {
  return { type, payload } as GameEvent;
}
