/**
 * Payment service - manages payment adapter and deposit/payout operations
 */

import { createPaymentAdapter, type PaymentAdapter, type PaymentAdapterType } from '@moltpoker/payments';
import { config } from '../config.js';
import * as db from '../db.js';
import { generateDepositId } from '../utils/crypto.js';

let paymentAdapter: PaymentAdapter | null = null;

export function initializePaymentAdapter(): PaymentAdapter | null {
  if (!config.realMoneyEnabled) {
    return null;
  }

  if (paymentAdapter) {
    return paymentAdapter;
  }

  try {
    // Factory resolves adapter config from env - no need to pass EVM-specific fields
    paymentAdapter = createPaymentAdapter(
      config.paymentAdapter as PaymentAdapterType
      // Optional overrides could be passed here if needed
    );

    return paymentAdapter;
  } catch (error) {
    console.error('Failed to initialize payment adapter:', error);
    return null;
  }
}

export function getPaymentAdapter(): PaymentAdapter | null {
  return paymentAdapter;
}

export async function createDepositForTable(
  tableId: string,
  agentId: string,
  seatId: number,
  amountUsdc: number
): Promise<{ depositId: string; instructions: any } | null> {
  const adapter = getPaymentAdapter();
  if (!adapter) {
    return null;
  }

  const depositId = generateDepositId();
  const expiresAt = new Date(Date.now() + config.depositTimeoutMs);

  // Generate deposit instructions first to get adapter-specific metadata
  const instructions = await adapter.createDepositInstructions({
    depositId,
    tableId,
    agentId,
    seatId,
    amountUsdc,
    expiresAt,
  });

  // Extract adapter-specific metadata from instructions
  // This decouples the API from knowing about chain/vault/token specifics
  const chainId = instructions.chainId;
  const tokenAddress = instructions.tokenAddress;
  const vaultAddress = instructions.vaultAddress;

  // Create deposit record in database
  await db.createDeposit(
    depositId,
    tableId,
    agentId,
    seatId,
    0, // actual amount will be updated when confirmed
    amountUsdc, // expected amount
    chainId,
    tokenAddress,
    vaultAddress,
    expiresAt
  );

  return { depositId, instructions };
}

export async function checkPaymentSystemHealth(): Promise<boolean> {
  const adapter = getPaymentAdapter();
  if (!adapter) {
    return false;
  }

  try {
    return await adapter.healthCheck();
  } catch (error) {
    console.error('Payment system health check failed:', error);
    return false;
  }
}
