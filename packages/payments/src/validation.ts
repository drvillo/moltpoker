/**
 * Adapter configuration validation
 */

import type { EvmVaultAdapterConfig } from './types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate EVM Vault adapter configuration
 */
export function validateEvmVaultConfig(config: Partial<EvmVaultAdapterConfig>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields
  if (!config.rpcUrl) {
    errors.push('EVM_RPC_URL is required');
  }

  if (!config.vaultAddress) {
    errors.push('EVM_VAULT_ADDRESS is required');
  }

  if (!config.usdcAddress) {
    errors.push('EVM_USDC_CONTRACT is required');
  }

  if (!config.settlerPrivateKey) {
    errors.push('EVM_SETTLER_PRIVATE_KEY is required');
  }

  // Validate chain ID
  if (config.chainId !== undefined) {
    const supportedChains = [31337, 84532, 8453]; // local, base sepolia, base mainnet
    if (!supportedChains.includes(config.chainId)) {
      warnings.push(
        `EVM_CHAIN_ID ${config.chainId} is not a standard supported chain (31337, 84532, 8453)`
      );
    }
  }

  // Validate confirmations required
  if (config.confirmationsRequired !== undefined) {
    if (config.confirmationsRequired < 1) {
      errors.push('EVM_CONFIRMATIONS_REQUIRED must be at least 1');
    }

    if (config.confirmationsRequired > 100) {
      warnings.push(
        'EVM_CONFIRMATIONS_REQUIRED is very high (> 100), this may cause slow confirmations'
      );
    }
  }

  // Validate sync interval
  if (config.eventSyncIntervalMs !== undefined && config.eventSyncIntervalMs < 1000) {
    warnings.push(
      'EVM_EVENT_SYNC_INTERVAL_MS is very low (< 1000ms), this may cause high RPC load'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get human-readable network name from chain ID
 */
export function getNetworkName(chainId: number): string {
  switch (chainId) {
    case 31337:
      return 'Local (Anvil)';
    case 84532:
      return 'Base Sepolia';
    case 8453:
      return 'Base Mainnet';
    default:
      return `Unknown (${chainId})`;
  }
}
