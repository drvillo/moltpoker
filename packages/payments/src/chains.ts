/**
 * Chain configuration for EVM networks
 */

import { base, baseSepolia, foundry, type Chain } from 'viem/chains';

export function getChainConfig(chainId: number): Chain {
  switch (chainId) {
    case 8453:
      return base;
    case 84532:
      return baseSepolia;
    case 31337:
      return foundry;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

export function getChainName(chainId: number): string {
  switch (chainId) {
    case 8453:
      return 'Base';
    case 84532:
      return 'Base Sepolia';
    case 31337:
      return 'Foundry Local';
    default:
      return `Chain ${chainId}`;
  }
}
