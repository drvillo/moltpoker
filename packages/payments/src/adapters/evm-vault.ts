/**
 * EVM Vault adapter implementation using viem + MoltPokerVault ABI
 */

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  toBytes,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import type { PaymentAdapter } from '../adapter.js'
import type {
  DepositConfirmation,
  DepositInstructions,
  DepositRequest,
  EvmVaultAdapterConfig,
  PayoutRequest,
  RefundRequest,
  SettlementResult,
  VaultEventFilter,
} from '../types.js'
import { getChainConfig } from '../chains.js'
import { MoltPokerVaultAbi } from '../abis/MoltPokerVault.js'

/** USDC uses 6 decimals */
const USDC_DECIMALS = 6
const USDC_UNIT = 10 ** USDC_DECIMALS

function usdcToTokenUnits(amountUsdc: number): bigint {
  return BigInt(Math.floor(amountUsdc * USDC_UNIT))
}

function tokenUnitsToUsdc(units: bigint): number {
  return Number(units) / USDC_UNIT
}

export class EvmVaultAdapter implements PaymentAdapter {
  private publicClient: PublicClient
  private walletClient: WalletClient
  private config: EvmVaultAdapterConfig
  private vaultAddress: Address

  constructor(config: EvmVaultAdapterConfig) {
    this.config = config
    this.vaultAddress = config.vaultAddress as Address
    const chain = getChainConfig(config.chainId)

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    })

    const account = privateKeyToAccount(config.settlerPrivateKey as `0x${string}`)

    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(config.rpcUrl),
    })
  }

  // ---------------------------------------------------------------------------
  // Canonical ID helpers
  // ---------------------------------------------------------------------------

  getTableIdBytes32(tableId: string): `0x${string}` {
    return keccak256(toBytes(`table:${tableId}`))
  }

  getAgentIdBytes32(agentId: string): `0x${string}` {
    return keccak256(toBytes(`agent:${agentId}`))
  }

  // ---------------------------------------------------------------------------
  // Deposit instructions (calldata for frontend / wallet)
  // ---------------------------------------------------------------------------

  async createDepositInstructions(request: DepositRequest): Promise<DepositInstructions> {
    const tableIdBytes32 = this.getTableIdBytes32(request.tableId)
    const agentIdBytes32 = this.getAgentIdBytes32(request.agentId)
    const amountInTokenUnits = usdcToTokenUnits(request.amountUsdc)

    const data = encodeFunctionData({
      abi: MoltPokerVaultAbi,
      functionName: 'deposit',
      args: [tableIdBytes32, agentIdBytes32, amountInTokenUnits],
    })

    const chain = getChainConfig(this.config.chainId)

    return {
      depositId: request.depositId,
      status: 'pending',
      amountUsdc: request.amountUsdc,
      chainId: this.config.chainId,
      chainName: chain.name,
      tokenAddress: this.config.usdcAddress,
      vaultAddress: this.config.vaultAddress,
      vaultCall: {
        to: this.config.vaultAddress,
        data,
        value: '0',
      },
      expiresAt: request.expiresAt.toISOString(),
    }
  }

  // ---------------------------------------------------------------------------
  // Deposit confirmation (read DepositReceived events)
  // ---------------------------------------------------------------------------

  async getDepositConfirmation(depositId: string): Promise<DepositConfirmation | null> {
    // depositId isn't emitted on-chain; the off-chain DB maps depositId to
    // (tableId, agentId). This method is called by the event listener after
    // matching a DepositReceived log, so for now it returns null when called
    // directly. A future version can accept txHash and parse the receipt.
    return null
  }

  // ---------------------------------------------------------------------------
  // Payout settlement
  // ---------------------------------------------------------------------------

  async executePayout(request: PayoutRequest): Promise<SettlementResult> {
    const tableIdBytes32 = this.getTableIdBytes32(request.tableId)
    const agentIdBytes32 = this.getAgentIdBytes32(request.agentId)
    const amountInTokenUnits = usdcToTokenUnits(request.amountUsdc)
    const recipient = request.payoutAddress as Address

    const { request: txRequest } = await this.publicClient.simulateContract({
      address: this.vaultAddress,
      abi: MoltPokerVaultAbi,
      functionName: 'settlePayout',
      args: [tableIdBytes32, agentIdBytes32, recipient, amountInTokenUnits],
      account: this.walletClient.account!,
    })

    const txHash = await this.walletClient.writeContract(txRequest)

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: this.config.confirmationsRequired,
    })

    return {
      txHash,
      eventName: 'TablePayoutSettled',
      eventIndex: 0,
      confirmationBlock: Number(receipt.blockNumber),
    }
  }

  // ---------------------------------------------------------------------------
  // Refund settlement
  // ---------------------------------------------------------------------------

  async executeRefund(request: RefundRequest): Promise<SettlementResult> {
    const tableIdBytes32 = this.getTableIdBytes32(request.tableId)
    const agentIdBytes32 = this.getAgentIdBytes32(request.agentId)
    const amountInTokenUnits = usdcToTokenUnits(request.amountUsdc)
    const recipient = request.payoutAddress as Address

    const { request: txRequest } = await this.publicClient.simulateContract({
      address: this.vaultAddress,
      abi: MoltPokerVaultAbi,
      functionName: 'settleRefund',
      args: [tableIdBytes32, agentIdBytes32, recipient, amountInTokenUnits],
      account: this.walletClient.account!,
    })

    const txHash = await this.walletClient.writeContract(txRequest)

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: this.config.confirmationsRequired,
    })

    return {
      txHash,
      eventName: 'TableRefundSettled',
      eventIndex: 0,
      confirmationBlock: Number(receipt.blockNumber),
    }
  }

  // ---------------------------------------------------------------------------
  // Event subscriptions
  // ---------------------------------------------------------------------------

  subscribeToDepositEvents(
    filter: VaultEventFilter,
    callback: (confirmation: DepositConfirmation) => void
  ): () => void {
    const unwatch = this.publicClient.watchContractEvent({
      address: this.vaultAddress,
      abi: MoltPokerVaultAbi,
      eventName: 'DepositReceived',
      onLogs: (logs) => {
        for (const log of logs) {
          const { tableId, agentId, depositor, amount, timestamp } = log.args as {
            tableId: `0x${string}`
            agentId: `0x${string}`
            depositor: Address
            amount: bigint
            timestamp: bigint
          }

          callback({
            depositId: '', // Resolved by caller via DB lookup of tableId+agentId
            txHash: log.transactionHash ?? '',
            eventName: 'DepositReceived',
            eventIndex: log.logIndex ?? 0,
            confirmationBlock: Number(log.blockNumber ?? 0n),
            actualAmount: tokenUnitsToUsdc(amount),
          })
        }
      },
    })

    return unwatch
  }

  subscribeToSettlementEvents(
    filter: VaultEventFilter,
    callback: (result: SettlementResult) => void
  ): () => void {
    const unwatchPayout = this.publicClient.watchContractEvent({
      address: this.vaultAddress,
      abi: MoltPokerVaultAbi,
      eventName: 'TablePayoutSettled',
      onLogs: (logs) => {
        for (const log of logs) {
          callback({
            txHash: log.transactionHash ?? '',
            eventName: 'TablePayoutSettled',
            eventIndex: log.logIndex ?? 0,
            confirmationBlock: Number(log.blockNumber ?? 0n),
          })
        }
      },
    })

    const unwatchRefund = this.publicClient.watchContractEvent({
      address: this.vaultAddress,
      abi: MoltPokerVaultAbi,
      eventName: 'TableRefundSettled',
      onLogs: (logs) => {
        for (const log of logs) {
          callback({
            txHash: log.transactionHash ?? '',
            eventName: 'TableRefundSettled',
            eventIndex: log.logIndex ?? 0,
            confirmationBlock: Number(log.blockNumber ?? 0n),
          })
        }
      },
    })

    return () => {
      unwatchPayout()
      unwatchRefund()
    }
  }

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    try {
      const blockNumber = await this.publicClient.getBlockNumber()
      return blockNumber > 0n
    } catch {
      return false
    }
  }
}
