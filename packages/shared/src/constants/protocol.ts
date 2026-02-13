/**
 * Protocol version constants for MoltPoker
 */

/** Current protocol version */
export const PROTOCOL_VERSION = '0.1';

/** Minimum supported protocol version for backward compatibility */
export const MIN_SUPPORTED_PROTOCOL_VERSION = '0.1';

/** Default action timeout in milliseconds */
export const DEFAULT_ACTION_TIMEOUT_MS = 30000;

/** Default small blind amount */
export const DEFAULT_SMALL_BLIND = 1;

/** Default big blind amount */
export const DEFAULT_BIG_BLIND = 2;

/** Default initial stack size */
export const DEFAULT_INITIAL_STACK = 100;

/** Default maximum seats per table */
export const DEFAULT_MAX_SEATS = 9;

/** Minimum players required to start a hand */
export const MIN_PLAYERS_TO_START = 2;

/** Maximum players allowed at a table */
export const MAX_PLAYERS = 10;

/** Session token expiration in seconds */
export const SESSION_EXPIRATION_SECONDS = 3600;

/** WebSocket ping interval in milliseconds */
export const WS_PING_INTERVAL_MS = 30000;

/** WebSocket pong timeout in milliseconds */
export const WS_PONG_TIMEOUT_MS = 10000;
