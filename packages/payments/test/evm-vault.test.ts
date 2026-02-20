/**
 * Unit tests for EvmVaultAdapter
 * Mocks viem clients to test adapter logic without real RPC calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { keccak256, toBytes, encodeFunctionData } from 'viem'
import { EvmVaultAdapter } from '../src/adapters/evm-vault.js'
import { MoltPokerVaultAbi } from '../src/abis/MoltPokerVault.js'
import { makeConfig, makeDepositRequest, makePayoutRequest, makeRefundRequest, mockPublicClient, mockWalletClient } from './fixtures.js'

// Mock viem module
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem')
  return {
    ...actual,
    createPublicClient: vi.fn(),
    createWalletClient: vi.fn(),
  }
})

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  })),
}))

describe('EvmVaultAdapter', () => {
  let adapter: EvmVaultAdapter
  let publicClient: ReturnType<typeof mockPublicClient>
  let walletClient: ReturnType<typeof mockWalletClient>

  beforeEach(async () => {
    const { createPublicClient, createWalletClient } = await import('viem')
    
    publicClient = mockPublicClient()
    walletClient = mockWalletClient()

    vi.mocked(createPublicClient).mockReturnValue(publicClient as any)
    vi.mocked(createWalletClient).mockReturnValue(walletClient as any)

    adapter = new EvmVaultAdapter(makeConfig())
  })

  describe('canonical ID helpers', () => {
    it('getTableIdBytes32 produces keccak256(utf8("table:" + id))', () => {
      const tableId = 'test-table-1'
      const result = adapter.getTableIdBytes32(tableId)
      const expected = keccak256(toBytes(`table:${tableId}`))
      expect(result).toBe(expected)
    })

    it('getAgentIdBytes32 produces keccak256(utf8("agent:" + id))', () => {
      const agentId = 'agent-1'
      const result = adapter.getAgentIdBytes32(agentId)
      const expected = keccak256(toBytes(`agent:${agentId}`))
      expect(result).toBe(expected)
    })

    it('canonical IDs are deterministic', () => {
      const tableId = 'my-table'
      const result1 = adapter.getTableIdBytes32(tableId)
      const result2 = adapter.getTableIdBytes32(tableId)
      expect(result1).toBe(result2)
    })
  })

  describe('createDepositInstructions', () => {
    it('returns correct vault call data with ABI-encoded deposit', async () => {
      const request = makeDepositRequest({ amountUsdc: 10.5 })
      const result = await adapter.createDepositInstructions(request)

      expect(result.depositId).toBe(request.depositId)
      expect(result.status).toBe('pending')
      expect(result.amountUsdc).toBe(10.5)
      expect(result.chainId).toBe(31337)
      expect(result.chainName).toBe('Foundry')
      expect(result.vaultCall.to).toBe('0x5FbDB2315678afecb367f032d93F642f64180aa3')
      expect(result.vaultCall.value).toBe('0')
      expect(result.vaultCall.data).toBeDefined()
      expect(typeof result.expiresAt).toBe('string')
    })

    it('encodes deposit function with correct selector', async () => {
      const request = makeDepositRequest({ tableId: 'tbl_test', agentId: 'agt_test', amountUsdc: 10.0 })
      const result = await adapter.createDepositInstructions(request)

      const tableIdBytes32 = adapter.getTableIdBytes32('tbl_test')
      const agentIdBytes32 = adapter.getAgentIdBytes32('agt_test')
      const amountInTokenUnits = BigInt(10_000_000)

      const expectedData = encodeFunctionData({
        abi: MoltPokerVaultAbi,
        functionName: 'deposit',
        args: [tableIdBytes32, agentIdBytes32, amountInTokenUnits],
      })

      expect(result.vaultCall.data).toBe(expectedData)
    })

    it('converts USDC to token units correctly (6 decimals)', async () => {
      const request = makeDepositRequest({ amountUsdc: 10.5 })
      const result = await adapter.createDepositInstructions(request)

      // 10.5 USDC = 10_500_000 token units (0xa037a0 in hex)
      // The amount should be in the encoded calldata
      const expectedData = encodeFunctionData({
        abi: MoltPokerVaultAbi,
        functionName: 'deposit',
        args: [
          adapter.getTableIdBytes32(request.tableId),
          adapter.getAgentIdBytes32(request.agentId),
          10_500_000n,
        ],
      })
      expect(result.vaultCall.data).toBe(expectedData)
    })
  })

  describe('executePayout', () => {
    it('happy path: simulate -> write -> wait -> return result', async () => {
      const request = makePayoutRequest()

      publicClient.simulateContract.mockResolvedValue({
        request: { /* mock tx request */ },
      } as any)

      walletClient.writeContract.mockResolvedValue('0xabcdef' as any)

      publicClient.waitForTransactionReceipt.mockResolvedValue({
        blockNumber: 12345n,
        transactionHash: '0xabcdef',
      } as any)

      const result = await adapter.executePayout(request)

      expect(result.txHash).toBe('0xabcdef')
      expect(result.eventName).toBe('TablePayoutSettled')
      expect(result.confirmationBlock).toBe(12345)
      expect(publicClient.simulateContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'settlePayout',
        })
      )
    })

    it('simulateContract revert propagates error', async () => {
      const request = makePayoutRequest()
      publicClient.simulateContract.mockRejectedValue(new Error('Revert: AlreadySettled'))

      await expect(adapter.executePayout(request)).rejects.toThrow('AlreadySettled')
    })

    it('writeContract failure propagates error', async () => {
      const request = makePayoutRequest()
      publicClient.simulateContract.mockResolvedValue({ request: {} } as any)
      walletClient.writeContract.mockRejectedValue(new Error('Insufficient funds'))

      await expect(adapter.executePayout(request)).rejects.toThrow('Insufficient funds')
    })
  })

  describe('executeRefund', () => {
    it('happy path: calls settleRefund and returns correct event name', async () => {
      const request = makeRefundRequest()

      publicClient.simulateContract.mockResolvedValue({ request: {} } as any)
      walletClient.writeContract.mockResolvedValue('0x123456' as any)
      publicClient.waitForTransactionReceipt.mockResolvedValue({
        blockNumber: 99n,
        transactionHash: '0x123456',
      } as any)

      const result = await adapter.executeRefund(request)

      expect(result.txHash).toBe('0x123456')
      expect(result.eventName).toBe('TableRefundSettled')
      expect(result.confirmationBlock).toBe(99)
      expect(publicClient.simulateContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'settleRefund',
        })
      )
    })

    it('propagates errors from simulation', async () => {
      const request = makeRefundRequest()
      publicClient.simulateContract.mockRejectedValue(new Error('Unauthorized'))

      await expect(adapter.executeRefund(request)).rejects.toThrow('Unauthorized')
    })
  })

  describe('subscribeToDepositEvents', () => {
    it('calls watchContractEvent with correct params', () => {
      const callback = vi.fn()
      const unwatch = vi.fn()

      publicClient.watchContractEvent.mockReturnValue(unwatch)

      const result = adapter.subscribeToDepositEvents({}, callback)

      expect(publicClient.watchContractEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
          abi: MoltPokerVaultAbi,
          eventName: 'DepositReceived',
        })
      )

      expect(result).toBe(unwatch)
    })

    it('converts token units to USDC in callback', () => {
      const callback = vi.fn()
      publicClient.watchContractEvent.mockImplementation((config: any) => {
        // Simulate event firing
        const mockLog = {
          args: {
            tableId: '0xaabbcc',
            agentId: '0xddeeff',
            depositor: '0x123',
            amount: 10_500_000n, // 10.5 USDC
            timestamp: 1234567890n,
          },
          transactionHash: '0xtxhash',
          logIndex: 5,
          blockNumber: 100n,
        }
        config.onLogs([mockLog])
        return vi.fn()
      })

      adapter.subscribeToDepositEvents({}, callback)

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          actualAmount: 10.5,
          txHash: '0xtxhash',
          eventName: 'DepositReceived',
          eventIndex: 5,
          confirmationBlock: 100,
        })
      )
    })
  })

  describe('subscribeToSettlementEvents', () => {
    it('watches both TablePayoutSettled and TableRefundSettled', () => {
      const callback = vi.fn()
      const unwatchPayout = vi.fn()
      const unwatchRefund = vi.fn()

      publicClient.watchContractEvent
        .mockReturnValueOnce(unwatchPayout)
        .mockReturnValueOnce(unwatchRefund)

      const unsubscribe = adapter.subscribeToSettlementEvents({}, callback)

      expect(publicClient.watchContractEvent).toHaveBeenCalledTimes(2)
      expect(publicClient.watchContractEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'TablePayoutSettled' })
      )
      expect(publicClient.watchContractEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'TableRefundSettled' })
      )

      unsubscribe()
      expect(unwatchPayout).toHaveBeenCalled()
      expect(unwatchRefund).toHaveBeenCalled()
    })

    it('callback receives settlement events correctly', () => {
      const callback = vi.fn()

      publicClient.watchContractEvent.mockImplementation((config: any) => {
        if (config.eventName === 'TablePayoutSettled') {
          const mockLog = {
            transactionHash: '0xpayout',
            logIndex: 3,
            blockNumber: 200n,
          }
          config.onLogs([mockLog])
        }
        return vi.fn()
      })

      adapter.subscribeToSettlementEvents({}, callback)

      expect(callback).toHaveBeenCalledWith({
        txHash: '0xpayout',
        eventName: 'TablePayoutSettled',
        eventIndex: 3,
        confirmationBlock: 200,
      })
    })
  })

  describe('healthCheck', () => {
    it('returns true when getBlockNumber succeeds', async () => {
      publicClient.getBlockNumber.mockResolvedValue(12345n)

      const result = await adapter.healthCheck()

      expect(result).toBe(true)
    })

    it('returns false when getBlockNumber throws', async () => {
      publicClient.getBlockNumber.mockRejectedValue(new Error('Network error'))

      const result = await adapter.healthCheck()

      expect(result).toBe(false)
    })

    it('returns false when block number is 0', async () => {
      publicClient.getBlockNumber.mockResolvedValue(0n)

      const result = await adapter.healthCheck()

      expect(result).toBe(false)
    })
  })

  describe('USDC conversion edge cases', () => {
    it('converts 0 USDC to 0 token units', async () => {
      const request = makeDepositRequest({ amountUsdc: 0 })
      const result = await adapter.createDepositInstructions(request)

      // Encoded args should contain 0
      const expectedData = encodeFunctionData({
        abi: MoltPokerVaultAbi,
        functionName: 'deposit',
        args: [adapter.getTableIdBytes32(request.tableId), adapter.getAgentIdBytes32(request.agentId), 0n],
      })
      expect(result.vaultCall.data).toBe(expectedData)
    })

    it('converts 0.01 USDC (1 chip) to 10_000 token units', async () => {
      const request = makeDepositRequest({ amountUsdc: 0.01 })
      const result = await adapter.createDepositInstructions(request)

      const expectedData = encodeFunctionData({
        abi: MoltPokerVaultAbi,
        functionName: 'deposit',
        args: [adapter.getTableIdBytes32(request.tableId), adapter.getAgentIdBytes32(request.agentId), 10_000n],
      })
      expect(result.vaultCall.data).toBe(expectedData)
    })

    it('converts large USDC amounts correctly', async () => {
      const request = makeDepositRequest({ amountUsdc: 999999.99 })
      const result = await adapter.createDepositInstructions(request)

      const expectedData = encodeFunctionData({
        abi: MoltPokerVaultAbi,
        functionName: 'deposit',
        args: [
          adapter.getTableIdBytes32(request.tableId),
          adapter.getAgentIdBytes32(request.agentId),
          999_999_990_000n,
        ],
      })
      expect(result.vaultCall.data).toBe(expectedData)
    })

    it('tokenUnitsToUsdc converts bigint back to float', () => {
      const callback = vi.fn()
      publicClient.watchContractEvent.mockImplementation((config: any) => {
        const mockLog = {
          args: { amount: 10_000_000n },
          transactionHash: '0x1',
          logIndex: 0,
          blockNumber: 1n,
        }
        config.onLogs([mockLog])
        return vi.fn()
      })

      adapter.subscribeToDepositEvents({}, callback)

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ actualAmount: 10.0 })
      )
    })
  })
})
