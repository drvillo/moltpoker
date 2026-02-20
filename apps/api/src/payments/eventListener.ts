/**
 * Event listener service for Vault events
 * Polls for deposit and settlement events and updates database state
 */

import { getPaymentAdapter } from './paymentService.js';
import * as db from '../db.js';
import { config } from '../config.js';

let eventListenerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

/**
 * Start the event listener service
 */
export function startEventListener(log?: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }) {
  if (!config.realMoneyEnabled) {
    return;
  }

  const adapter = getPaymentAdapter();
  if (!adapter) {
    log?.error('Cannot start event listener: payment adapter not initialized');
    return;
  }

  // Subscribe to deposit events
  const unsubscribeDeposits = adapter.subscribeToDepositEvents({}, async (confirmation) => {
    try {
      const deposit = await db.getDeposit(confirmation.depositId);
      if (!deposit) {
        log?.info(`Received deposit event for unknown deposit: ${confirmation.depositId}`);
        return;
      }

      // Validate amount
      const expectedAmount = deposit.expected_amount_usdc;
      if (confirmation.actualAmount !== expectedAmount) {
        // Mark as invalid amount
        await db.updateDepositStatus(
          confirmation.depositId,
          'invalid_amount',
          confirmation.txHash,
          confirmation.eventName,
          confirmation.eventIndex,
          confirmation.confirmationBlock,
          confirmation.actualAmount
        );
        log?.info(`Deposit ${confirmation.depositId} marked as invalid_amount: expected ${expectedAmount}, got ${confirmation.actualAmount}`);
        
        // TODO: Trigger auto-refund
        return;
      }

      // Update deposit status to settled
      await db.updateDepositStatus(
        confirmation.depositId,
        'settled',
        confirmation.txHash,
        confirmation.eventName,
        confirmation.eventIndex,
        confirmation.confirmationBlock,
        confirmation.actualAmount
      );

      log?.info(`Deposit ${confirmation.depositId} confirmed: ${confirmation.actualAmount} USDC`);
    } catch (error) {
      log?.error('Error processing deposit event:', error);
    }
  });

  // Subscribe to settlement events (payouts and refunds)
  const unsubscribeSettlements = adapter.subscribeToSettlementEvents({}, async (result) => {
    try {
      // Find pending payouts matching this tx
      const pendingPayouts = await db.listPendingPayouts();
      
      for (const payout of pendingPayouts) {
        // Update payout status to completed
        await db.updatePayoutStatus(
          payout.id,
          'completed',
          result.txHash,
          result.eventName,
          result.eventIndex,
          result.confirmationBlock,
          result.batchId
        );

        log?.info(`Payout ${payout.id} completed: ${payout.amount_usdc} USDC to ${payout.agent_id}`);
      }
    } catch (error) {
      log?.error('Error processing settlement event:', error);
    }
  });

  // Start periodic reconciliation for pending confirmations
  eventListenerInterval = setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      await reconcilePendingConfirmations(log);
      await handleExpiredDeposits(log);
    } catch (error) {
      log?.error('Error in periodic reconciliation:', error);
    } finally {
      isProcessing = false;
    }
  }, config.paymentEventSyncIntervalMs);

  log?.info(`Event listener started (polling every ${config.paymentEventSyncIntervalMs}ms)`);

  return () => {
    unsubscribeDeposits();
    unsubscribeSettlements();
    if (eventListenerInterval) {
      clearInterval(eventListenerInterval);
      eventListenerInterval = null;
    }
  };
}

/**
 * Stop the event listener service
 */
export function stopEventListener() {
  if (eventListenerInterval) {
    clearInterval(eventListenerInterval);
    eventListenerInterval = null;
  }
}

/**
 * Reconcile deposits/payouts in pending_confirmation state
 */
async function reconcilePendingConfirmations(log?: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }) {
  const adapter = getPaymentAdapter();
  if (!adapter) return;

  // Check pending confirmation deposits
  const pendingDeposits = await db.listPendingConfirmationDeposits();
  for (const deposit of pendingDeposits) {
    try {
      const confirmation = await adapter.getDepositConfirmation(deposit.id);
      if (confirmation) {
        // Validate amount
        const expectedAmount = deposit.expected_amount_usdc;
        if (confirmation.actualAmount !== expectedAmount) {
          await db.updateDepositStatus(
            deposit.id,
            'invalid_amount',
            confirmation.txHash,
            confirmation.eventName,
            confirmation.eventIndex,
            confirmation.confirmationBlock,
            confirmation.actualAmount
          );
          log?.info(`Deposit ${deposit.id} reconciled as invalid_amount`);
        } else {
          await db.updateDepositStatus(
            deposit.id,
            'settled',
            confirmation.txHash,
            confirmation.eventName,
            confirmation.eventIndex,
            confirmation.confirmationBlock,
            confirmation.actualAmount
          );
          log?.info(`Deposit ${deposit.id} reconciled as settled`);
        }
      }
    } catch (error) {
      log?.error(`Error reconciling deposit ${deposit.id}:`, error);
    }
  }

  // Check pending confirmation payouts
  const pendingPayouts = await db.listPendingConfirmationPayouts();
  for (const payout of pendingPayouts) {
    try {
      // TODO: Implement payout confirmation lookup
      // For now, leave in pending_confirmation state
    } catch (error) {
      log?.error(`Error reconciling payout ${payout.id}:`, error);
    }
  }
}

/**
 * Handle expired deposits (auto-refund)
 */
async function handleExpiredDeposits(log?: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }) {
  const expiredDeposits = await db.listExpiredDeposits();
  
  for (const deposit of expiredDeposits) {
    try {
      // Mark as expired_late
      await db.updateDepositStatus(deposit.id, 'expired_late');
      log?.info(`Deposit ${deposit.id} marked as expired_late`);
      
      // TODO: If deposit has been received on-chain, trigger auto-refund
    } catch (error) {
      log?.error(`Error handling expired deposit ${deposit.id}:`, error);
    }
  }
}
