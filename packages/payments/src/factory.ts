/**
 * Payment adapter factory
 * Resolves adapter-specific config from env, merges overrides, validates, and instantiates adapter.
 */

import type { PaymentAdapter } from './adapter.js'
import type { EvmVaultAdapterConfig } from './types.js'
import { EvmVaultAdapter } from './adapters/evm-vault.js'
import { getEvmConfigFromEnv } from './env.js'
import { validateEvmVaultConfig, type ValidationResult } from './validation.js'

export type PaymentAdapterType = 'evm_vault'

/**
 * Create a payment adapter instance
 * @param type - Adapter type identifier
 * @param overrides - Optional config overrides (merged with env config)
 * @returns PaymentAdapter instance
 * @throws Error if adapter type is unknown or config is invalid
 */
export function createPaymentAdapter(
  type: PaymentAdapterType,
  overrides?: Partial<EvmVaultAdapterConfig>
): PaymentAdapter {
  switch (type) {
    case 'evm_vault': {
      const envConfig = getEvmConfigFromEnv()
      const merged: EvmVaultAdapterConfig = {
        ...envConfig,
        ...overrides,
      }
      
      // Validate merged config
      const validation = validateEvmVaultConfig(merged)
      if (!validation.valid) {
        throw new Error(
          `Invalid EVM Vault adapter config:\n${validation.errors.join('\n')}`
        )
      }
      
      return new EvmVaultAdapter(merged)
    }
    default:
      throw new Error(`Unknown payment adapter type: ${type}`)
  }
}

/**
 * Validate adapter configuration without instantiating
 * @param type - Adapter type identifier
 * @param overrides - Optional config overrides
 * @returns ValidationResult with errors and warnings
 */
export function validateAdapterConfig(
  type: PaymentAdapterType,
  overrides?: Partial<EvmVaultAdapterConfig>
): ValidationResult {
  switch (type) {
    case 'evm_vault': {
      const envConfig = getEvmConfigFromEnv()
      const merged: EvmVaultAdapterConfig = {
        ...envConfig,
        ...overrides,
      }
      return validateEvmVaultConfig(merged)
    }
    default:
      return {
        valid: false,
        errors: [`Unknown payment adapter type: ${type}`],
        warnings: [],
      }
  }
}
