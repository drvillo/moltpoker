/**
 * Load .env.local from repo root and expose EVM config from process.env.
 * Used when the adapter is created without full config (e.g. scripts or tests).
 */

import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root
  while (dir !== root) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return process.cwd()
}

let loaded = false

export function loadEnvLocal(): void {
  if (loaded) return
  const repoRoot = findRepoRoot(__dirname)
  const envLocal = path.join(repoRoot, '.env.local')
  dotenv.config({ path: path.join(repoRoot, '.env') })
  dotenv.config({ path: envLocal, override: true })
  loaded = true
}

export interface EvmEnvConfig {
  chainId: number
  rpcUrl: string
  vaultAddress: string
  usdcAddress: string
  settlerPrivateKey: string
  startBlock?: number
  confirmationsRequired: number
  eventSyncIntervalMs: number
}

export function getEvmConfigFromEnv(): EvmEnvConfig {
  loadEnvLocal()
  return {
    chainId: parseInt(process.env.EVM_CHAIN_ID ?? '31337', 10),
    rpcUrl: process.env.EVM_RPC_URL ?? 'http://127.0.0.1:8545',
    vaultAddress: process.env.EVM_VAULT_ADDRESS ?? '',
    usdcAddress: process.env.EVM_USDC_CONTRACT ?? '',
    settlerPrivateKey: process.env.EVM_SETTLER_PRIVATE_KEY ?? '',
    startBlock: process.env.EVM_START_BLOCK ? parseInt(process.env.EVM_START_BLOCK, 10) : undefined,
    confirmationsRequired: parseInt(process.env.EVM_CONFIRMATIONS_REQUIRED ?? '1', 10),
    eventSyncIntervalMs: parseInt(process.env.EVM_EVENT_SYNC_INTERVAL_MS ?? '5000', 10),
  }
}
