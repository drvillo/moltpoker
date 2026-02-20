/**
 * Payment-related constants for MoltPoker
 */

/** Payment adapter types */
export const PaymentAdapterType = {
  EVM_VAULT: 'evm_vault',
} as const;

export type PaymentAdapterTypeValue = (typeof PaymentAdapterType)[keyof typeof PaymentAdapterType];

/** Deposit statuses */
export const DepositStatus = {
  PENDING: 'pending',
  SETTLED: 'settled',
  EXPIRED_LATE: 'expired_late',
  INVALID_AMOUNT: 'invalid_amount',
  PENDING_CONFIRMATION: 'pending_confirmation',
  REFUNDED: 'refunded',
} as const;

export type DepositStatusValue = (typeof DepositStatus)[keyof typeof DepositStatus];

/** Payout statuses */
export const PayoutStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PENDING_CONFIRMATION: 'pending_confirmation',
} as const;

export type PayoutStatusValue = (typeof PayoutStatus)[keyof typeof PayoutStatus];

/** Refund statuses */
export const RefundStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PENDING_MANUAL: 'refund_pending_manual',
} as const;

export type RefundStatusValue = (typeof RefundStatus)[keyof typeof RefundStatus];

/** Settlement types */
export const SettlementType = {
  PAYOUT: 'payout',
  REFUND: 'refund',
} as const;

export type SettlementTypeValue = (typeof SettlementType)[keyof typeof SettlementType];
