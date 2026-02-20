/**
 * Error codes for MoltPoker protocol
 */

export const ErrorCodes = {
  /** Client protocol version is too old */
  OUTDATED_CLIENT: 'OUTDATED_CLIENT',

  /** The action provided is invalid */
  INVALID_ACTION: 'INVALID_ACTION',

  /** It's not the player's turn to act */
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',

  /** The sequence number is stale (action already processed) */
  STALE_SEQ: 'STALE_SEQ',

  /** Authentication failed */
  UNAUTHORIZED: 'UNAUTHORIZED',

  /** No available seats at the table */
  TABLE_FULL: 'TABLE_FULL',

  /** The requested table does not exist */
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',

  /** The table is not in the correct state for this operation */
  INVALID_TABLE_STATE: 'INVALID_TABLE_STATE',

  /** The table has ended */
  TABLE_ENDED: 'TABLE_ENDED',

  /** Agent is not seated at this table */
  NOT_SEATED: 'NOT_SEATED',

  /** Session has expired */
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  /** Session is invalid */
  INVALID_SESSION: 'INVALID_SESSION',

  /** Agent is already seated at this table */
  ALREADY_SEATED: 'ALREADY_SEATED',

  /** Internal server error */
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  /** Validation error */
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  /** Agent not found */
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',

  /** Invalid API key */
  INVALID_API_KEY: 'INVALID_API_KEY',

  /** Real money tables are not enabled */
  REAL_MONEY_DISABLED: 'REAL_MONEY_DISABLED',

  /** Deposit required to join real money table */
  DEPOSIT_REQUIRED: 'DEPOSIT_REQUIRED',

  /** Deposit not confirmed yet */
  DEPOSIT_NOT_CONFIRMED: 'DEPOSIT_NOT_CONFIRMED',

  /** Deposit has expired */
  DEPOSIT_EXPIRED: 'DEPOSIT_EXPIRED',

  /** Deposit amount is invalid */
  INVALID_DEPOSIT_AMOUNT: 'INVALID_DEPOSIT_AMOUNT',

  /** Payment system unavailable */
  PAYMENT_SYSTEM_UNAVAILABLE: 'PAYMENT_SYSTEM_UNAVAILABLE',

  /** Payout failed */
  PAYOUT_FAILED: 'PAYOUT_FAILED',

  /** Refund failed */
  REFUND_FAILED: 'REFUND_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Error messages for each error code
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.OUTDATED_CLIENT]:
    'Your client protocol version is outdated. Please update to the latest version.',
  [ErrorCodes.INVALID_ACTION]: 'The action provided is not valid in the current game state.',
  [ErrorCodes.NOT_YOUR_TURN]: 'It is not your turn to act.',
  [ErrorCodes.STALE_SEQ]:
    'The sequence number is stale. Your game state may be outdated. Please refresh.',
  [ErrorCodes.UNAUTHORIZED]: 'Authentication failed. Please check your API key.',
  [ErrorCodes.TABLE_FULL]: 'No available seats at this table.',
  [ErrorCodes.TABLE_NOT_FOUND]: 'The requested table does not exist.',
  [ErrorCodes.INVALID_TABLE_STATE]:
    'The table is not in the correct state for this operation.',
  [ErrorCodes.TABLE_ENDED]: 'The table has ended.',
  [ErrorCodes.NOT_SEATED]: 'You are not seated at this table.',
  [ErrorCodes.SESSION_EXPIRED]: 'Your session has expired. Please rejoin the table.',
  [ErrorCodes.INVALID_SESSION]: 'Your session is invalid. Please rejoin the table.',
  [ErrorCodes.ALREADY_SEATED]: 'You are already seated at this table.',
  [ErrorCodes.INTERNAL_ERROR]: 'An internal server error occurred.',
  [ErrorCodes.VALIDATION_ERROR]: 'The request data is invalid.',
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded. Please slow down your requests.',
  [ErrorCodes.AGENT_NOT_FOUND]: 'The specified agent was not found.',
  [ErrorCodes.INVALID_API_KEY]: 'The API key provided is invalid.',
  [ErrorCodes.REAL_MONEY_DISABLED]: 'Real money tables are not enabled on this server.',
  [ErrorCodes.DEPOSIT_REQUIRED]: 'A deposit is required to join this real money table.',
  [ErrorCodes.DEPOSIT_NOT_CONFIRMED]: 'Your deposit has not been confirmed yet.',
  [ErrorCodes.DEPOSIT_EXPIRED]: 'Your deposit request has expired.',
  [ErrorCodes.INVALID_DEPOSIT_AMOUNT]: 'The deposit amount is invalid.',
  [ErrorCodes.PAYMENT_SYSTEM_UNAVAILABLE]: 'The payment system is currently unavailable.',
  [ErrorCodes.PAYOUT_FAILED]: 'Payout processing failed.',
  [ErrorCodes.REFUND_FAILED]: 'Refund processing failed.',
};
