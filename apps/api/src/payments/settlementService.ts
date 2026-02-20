/**
 * Settlement service - handles payouts and refunds via Vault
 */

import { getPaymentAdapter } from './paymentService.js';
import * as db from '../db.js';
import { generatePayoutId } from '../utils/crypto.js';

export interface PayoutInput {
  tableId: string;
  agentId: string;
  seatId: number;
  finalStack: number;
  payoutAddress: string;
}

export interface RefundInput {
  tableId: string;
  agentId: string;
  seatId: number;
  depositAmount: number;
  payoutAddress: string;
  reason: string;
}

/**
 * Execute payout for a table winner/participant
 */
export async function executePayout(input: PayoutInput): Promise<{ success: boolean; payoutId?: string; error?: string }> {
  const adapter = getPaymentAdapter();
  if (!adapter) {
    return { success: false, error: 'Payment adapter not available' };
  }

  const payoutId = generatePayoutId();
  
  try {
    // Convert chips to USDC (1 chip = $0.01 USDC)
    const amountUsdc = input.finalStack / 100;

    // Create payout record
    await db.createPayout(
      payoutId,
      input.tableId,
      input.agentId,
      input.seatId,
      'payout',
      amountUsdc,
      input.finalStack
    );

    // Execute payout on-chain
    const result = await adapter.executePayout({
      payoutId,
      tableId: input.tableId,
      agentId: input.agentId,
      seatId: input.seatId,
      amountUsdc,
      payoutAddress: input.payoutAddress,
      finalStack: input.finalStack,
    });

    // Update payout with settlement info
    await db.updatePayoutStatus(
      payoutId,
      'pending_confirmation',
      result.txHash,
      result.eventName,
      result.eventIndex,
      result.confirmationBlock,
      result.batchId
    );

    return { success: true, payoutId };
  } catch (error) {
    // Mark payout as failed
    await db.updatePayoutStatus(
      payoutId,
      'failed',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      error instanceof Error ? error.message : String(error)
    );

    return { success: false, payoutId, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Execute refund for a table participant
 */
export async function executeRefund(input: RefundInput): Promise<{ success: boolean; refundId?: string; error?: string }> {
  const adapter = getPaymentAdapter();
  if (!adapter) {
    return { success: false, error: 'Payment adapter not available' };
  }

  const refundId = generatePayoutId(); // Refunds use same ID space as payouts
  
  try {
    // Create refund record
    await db.createPayout(
      refundId,
      input.tableId,
      input.agentId,
      input.seatId,
      'refund',
      input.depositAmount
    );

    // Execute refund on-chain
    const result = await adapter.executeRefund({
      refundId,
      tableId: input.tableId,
      agentId: input.agentId,
      seatId: input.seatId,
      amountUsdc: input.depositAmount,
      payoutAddress: input.payoutAddress,
      reason: input.reason,
    });

    // Update refund with settlement info
    await db.updatePayoutStatus(
      refundId,
      'pending_confirmation',
      result.txHash,
      result.eventName,
      result.eventIndex,
      result.confirmationBlock,
      result.batchId
    );

    return { success: true, refundId };
  } catch (error) {
    // Mark refund as failed
    await db.updatePayoutStatus(
      refundId,
      'refund_pending_manual',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      error instanceof Error ? error.message : String(error)
    );

    return { success: false, refundId, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Execute payouts for all participants at table end
 */
export async function executeTablePayouts(
  payouts: PayoutInput[]
): Promise<{ successful: number; failed: number; errors: string[] }> {
  let successful = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const payout of payouts) {
    const result = await executePayout(payout);
    if (result.success) {
      successful++;
    } else {
      failed++;
      errors.push(`Payout failed for ${payout.agentId}: ${result.error}`);
    }
  }

  return { successful, failed, errors };
}

/**
 * Refund all participants at a table (admin function)
 */
export async function refundAllAtTable(
  tableIdParam: string,
  reason: string
): Promise<{ successful: number; failed: number; errors: string[] }> {
  let successful = 0;
  let failed = 0;
  const errors: string[] = [];

  // Get all deposits for this table
  const deposits = await db.getDepositsByTable(tableIdParam);

  for (const deposit of deposits) {
    // Only refund settled deposits
    if (deposit.status !== 'settled') continue;

    // TODO: Get agent payout address from agents table
    // For now, use a placeholder
    const agent = await db.getAgentById(deposit.agent_id);
    if (!agent || !agent.payout_address) {
      errors.push(`No payout address for agent ${deposit.agent_id}`);
      failed++;
      continue;
    }

    const result = await executeRefund({
      tableId: tableIdParam,
      agentId: deposit.agent_id,
      seatId: deposit.seat_id,
      depositAmount: deposit.amount_usdc,
      payoutAddress: agent.payout_address,
      reason,
    });

    if (result.success) {
      successful++;
    } else {
      failed++;
      errors.push(`Refund failed for ${deposit.agent_id}: ${result.error}`);
    }
  }

  return { successful, failed, errors };
}

/**
 * Auto-refund for invalid deposit amounts
 */
export async function autoRefundInvalidDeposit(depositId: string): Promise<boolean> {
  const deposit = await db.getDeposit(depositId);
  if (!deposit || deposit.status !== 'invalid_amount') {
    return false;
  }

  // Get agent payout address
  const agent = await db.getAgentById(deposit.agent_id);
  if (!agent || !agent.payout_address) {
    return false;
  }

  const result = await executeRefund({
    tableId: deposit.table_id,
    agentId: deposit.agent_id,
    seatId: deposit.seat_id,
    depositAmount: deposit.amount_usdc, // Actual deposited amount
    payoutAddress: agent.payout_address,
    reason: 'invalid_amount',
  });

  if (result.success) {
    // Update deposit status to refunded
    await db.updateDepositStatus(depositId, 'refunded');
  }

  return result.success;
}

/**
 * Auto-refund for expired late deposits
 */
export async function autoRefundExpiredDeposit(depositId: string): Promise<boolean> {
  const deposit = await db.getDeposit(depositId);
  if (!deposit || deposit.status !== 'expired_late') {
    return false;
  }

  // Only refund if deposit was actually received on-chain
  if (!deposit.vault_tx_hash) {
    return false;
  }

  // Get agent payout address
  const agent = await db.getAgentById(deposit.agent_id);
  if (!agent || !agent.payout_address) {
    return false;
  }

  const result = await executeRefund({
    tableId: deposit.table_id,
    agentId: deposit.agent_id,
    seatId: deposit.seat_id,
    depositAmount: deposit.amount_usdc,
    payoutAddress: agent.payout_address,
    reason: 'expired_late',
  });

  if (result.success) {
    // Update deposit status to refunded
    await db.updateDepositStatus(depositId, 'refunded');
  }

  return result.success;
}
