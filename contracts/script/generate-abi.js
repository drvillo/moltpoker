#!/usr/bin/env node

/**
 * Generate TypeScript ABI files from Forge compilation output.
 * Run from repo root or contracts dir: pnpm --filter @moltpoker/contracts abi:generate
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const contractsDir = join(__dirname, '..')
const repoRoot = join(contractsDir, '..')

const contracts = [
  { name: 'MoltPokerVault', path: 'MoltPokerVault.sol/MoltPokerVault.json' },
  { name: 'MockUSDC', path: 'MockUSDC.sol/MockUSDC.json' },
]

const outDir = join(contractsDir, 'out')
const targetDir = join(repoRoot, 'packages', 'payments', 'src', 'abis')

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true })
}

console.log('Generating ABI files...\n')

for (const contract of contracts) {
  const artifactPath = join(outDir, contract.path)

  if (!existsSync(artifactPath)) {
    console.error(`❌ Artifact not found: ${artifactPath}`)
    console.error('   Run "pnpm --filter @moltpoker/contracts build" first')
    process.exit(1)
  }

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
  const abi = artifact.abi

  const tsContent = `/**
 * ${contract.name} ABI
 * Auto-generated from Forge artifacts
 * DO NOT EDIT MANUALLY
 */

export const ${contract.name}Abi = ${JSON.stringify(abi, null, 2)} as const;

export type ${contract.name}Abi = typeof ${contract.name}Abi;
`

  const targetPath = join(targetDir, `${contract.name}.ts`)
  writeFileSync(targetPath, tsContent)
  console.log(`✓ Generated ${contract.name}.ts`)
}

const indexContent =
  contracts.map((c) => `export * from './${c.name}.js';`).join('\n') + '\n'

writeFileSync(join(targetDir, 'index.ts'), indexContent)
console.log('✓ Generated index.ts\n')

console.log('ABI generation complete!')
