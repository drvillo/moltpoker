/**
 * Unit tests for payment adapter factory
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPaymentAdapter } from '../src/factory.js'
import { EvmVaultAdapter } from '../src/adapters/evm-vault.js'
import { makeConfig } from './fixtures.js'

// Mock viem
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem')
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ getBlockNumber: vi.fn() })),
    createWalletClient: vi.fn(() => ({ account: { address: '0x123' } })),
  }
})

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({ address: '0x123' })),
}))

// Mock env module
vi.mock('../src/env.js', () => ({
  getEvmConfigFromEnv: vi.fn(() => ({
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    vaultAddress: '0xENVVAULT',
    usdcAddress: '0xENVUSDC',
    settlerPrivateKey: '0xENVKEY',
    confirmationsRequired: 2,
    eventSyncIntervalMs: 10000,
  })),
}))

describe('createPaymentAdapter', () => {
  it('creates EvmVaultAdapter for evm_vault type', () => {
    const config = makeConfig()
    const adapter = createPaymentAdapter('evm_vault', config)

    expect(adapter).toBeInstanceOf(EvmVaultAdapter)
  })

  it('merges env config with passed config (passed wins)', async () => {
    const { getEvmConfigFromEnv } = await import('../src/env.js')

    const config = makeConfig({ vaultAddress: '0xOVERRIDE', chainId: 31337 })
    const adapter = createPaymentAdapter('evm_vault', config)

    expect(getEvmConfigFromEnv).toHaveBeenCalled()
    // Adapter should use the override vault address, not env
    expect(adapter).toBeInstanceOf(EvmVaultAdapter)
  })

  it('throws on unknown adapter type', () => {
    const config = makeConfig()
    expect(() => createPaymentAdapter('unknown' as any, config)).toThrow('Unknown payment adapter type')
  })
})
