/**
 * Configuration validation for payment system
 * Delegates adapter-specific validation to payments package
 */

import { validateAdapterConfig, type PaymentAdapterType } from '@moltpoker/payments';
import { config } from '../config.js';

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate payment system configuration
 * Validates API-level concerns then delegates adapter-specific validation to payments package
 */
export function validatePaymentConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.realMoneyEnabled) {
    return { valid: true, errors, warnings };
  }

  // API-level validation: deposit timeout
  if (config.depositTimeoutMs < 60000) {
    warnings.push('DEPOSIT_TIMEOUT_MS is very low (< 1 minute), users may not have enough time to complete deposits');
  }

  // Validate payment adapter type is known
  const supportedAdapters = ['evm_vault'];
  if (!supportedAdapters.includes(config.paymentAdapter)) {
    errors.push(`PAYMENT_ADAPTER '${config.paymentAdapter}' is not supported (must be one of: ${supportedAdapters.join(', ')})`);
    return { valid: false, errors, warnings };
  }

  // Delegate adapter-specific validation to payments package
  try {
    const adapterValidation = validateAdapterConfig(
      config.paymentAdapter as PaymentAdapterType,
      {} // No overrides from API config - adapter uses env config
    );
    
    errors.push(...adapterValidation.errors);
    warnings.push(...adapterValidation.warnings);
  } catch (error) {
    errors.push(`Failed to validate adapter config: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
