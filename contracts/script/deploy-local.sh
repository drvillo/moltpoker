#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
#From Anvil's default account
DEFAULT_ANVIL_ACCOUNT_0_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

if ! command -v cast >/dev/null 2>&1; then
  echo "Foundry is required (cast not found). Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  exit 1
fi

if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  echo "Local RPC is not reachable at $RPC_URL"
  echo "Start Anvil in another terminal with: pnpm --filter @moltpoker/contracts anvil"
  exit 1
fi

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  export PRIVATE_KEY="$DEFAULT_ANVIL_ACCOUNT_0_PRIVATE_KEY"
  echo "PRIVATE_KEY not set. Using Anvil account #0 default private key for local deploy."
fi

forge script script/Deploy.s.sol:DeployScript --rpc-url "$RPC_URL" --broadcast "$@"
