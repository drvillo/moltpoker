# MoltPoker Scripts

This directory contains utility scripts for local development and deployment.

## deploy-local-dev.sh

**Purpose**: One-command orchestrator that boots the complete MoltPoker local development environment.

**Usage**:
```bash
# From repo root
pnpm local:start

# Or directly
./scripts/deploy-local-dev.sh
```

**Prerequisites**:
- `.env.local` configured with contract addresses (see `docs/local-only/vault-configuration-and-testing-guide.md`)
- Supabase running locally (`npx supabase start`)
- Required tools installed: `pnpm`, `docker`, Foundry (`forge`, `cast`, `anvil`)
  - Foundry should be installed at `~/.foundry/bin/` (default installation path)
  - The script automatically adds this to PATH

**What it does**:

1. **Service Prechecks**
   - Checks Docker availability, starts OrbStack if needed
   - Kills existing Anvil processes and starts fresh instance
   - Waits for services to be healthy

2. **Build & Migrations**
   - Runs `pnpm build` for all packages
   - Applies pending database migrations via `pnpm db:migrate`

3. **Smart Contracts**
   - Verifies ABI files are up to date (stops if drift detected)
   - Deploys MockUSDC and MoltPokerVault to local Anvil
   - Validates deployed addresses match `.env.local` configuration
   - Funds all 10 Anvil test accounts with mock USDC

4. **API Deployment**
   - Builds Docker image for API
   - Runs API container in detached mode (name: `moltpoker-api-local`)
   - Verifies API health on configured `API_PORT`

5. **Web UI**
   - Starts Next.js development server
   - Verifies web server responds on port 3000

6. **Summary Output**
   - Prints service URLs
   - Lists all 10 Anvil account addresses and private keys
   - Keeps running until Ctrl+C

**Exit Behavior**:
- Script runs indefinitely until interrupted (Ctrl+C)
- On exit, automatically stops Anvil, web server, and API container (`moltpoker-api-local`)

**Error Handling**:
- Clean, actionable error messages
- Fails fast on any error (no partial state)
- Suggests remediation steps for common issues

**Environment Requirements**:

Required variables in `.env.local`:
- `API_PORT` - API server port
- `EVM_RPC_URL` - Anvil RPC URL (usually `http://127.0.0.1:8545`)
- `EVM_USDC_CONTRACT` - MockUSDC contract address
- `EVM_VAULT_ADDRESS` - MoltPokerVault contract address
- `EVM_VAULT_ADMIN` - Admin account address

**Troubleshooting**:

| Issue | Solution |
|-------|----------|
| "Docker is not running" | Start Docker or OrbStack manually |
| "Anvil did not become ready" | Check port 8545 is not blocked, verify Foundry is installed |
| "ABI files are out of date" | Run `pnpm --filter @moltpoker/contracts build && pnpm --filter @moltpoker/contracts abi:generate` |
| "Address mismatch" | Update `.env.local` with addresses printed in error message |
| "Migrations failed" | Ensure Supabase is running (`npx supabase start`) |
| API not responding | Check logs: `docker logs moltpoker-api-local` |

## run-api-docker.sh

**Purpose**: Run the API server in Docker with environment variables from `.env.local`.

**Usage**:
```bash
pnpm run:api:docker
```

**Note**: This script runs the API in foreground (interactive). For detached mode, use `deploy-local-dev.sh` instead.
