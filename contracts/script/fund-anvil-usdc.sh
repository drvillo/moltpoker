#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.local}"

DEFAULT_RPC_URL="http://127.0.0.1:8545"
DEFAULT_MINTER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

USDC_DECIMALS=6
MINT_AMOUNT_UNITS=$((100000 * 10 ** USDC_DECIMALS))
TRANSFER_AMOUNT_UNITS=$((1000 * 10 ** USDC_DECIMALS))

function print_usage() {
  echo "Usage: bash contracts/script/fund-anvil-usdc.sh <address1> [address2 ... addressN]"
  echo ""
  echo "For each input address:"
  echo "  1) Mint 100000 mock USDC"
  echo "  2) Send 1000 mock USDC to every Anvil test account"
}

function validate_address() {
  local address="$1"
  if [[ ! "$address" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "Invalid Ethereum address: $address"
    return 1
  fi
}

function contains_address() {
  local needle
  needle="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  shift
  local candidate
  for candidate in "$@"; do
    local normalized_candidate
    normalized_candidate="$(echo "$candidate" | tr '[:upper:]' '[:lower:]')"
    if [[ "$normalized_candidate" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

if ! command -v cast >/dev/null 2>&1; then
  echo "Foundry is required (cast not found). Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  exit 1
fi

if [ "$#" -lt 1 ]; then
  print_usage
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "Env file not found at $ENV_FILE"
  exit 1
fi

RPC_URL="${RPC_URL:-${EVM_RPC_URL:-$DEFAULT_RPC_URL}}"
USDC_CONTRACT="${EVM_USDC_CONTRACT:-}"
MINTER_PRIVATE_KEY="${MINTER_PRIVATE_KEY:-${EVM_SETTLER_PRIVATE_KEY:-$DEFAULT_MINTER_PRIVATE_KEY}}"

if [ -z "$USDC_CONTRACT" ]; then
  echo "EVM_USDC_CONTRACT is missing. Set it in $ENV_FILE"
  exit 1
fi

if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  echo "RPC is not reachable at $RPC_URL"
  echo "Start Anvil in another terminal with: pnpm --filter @moltpoker/contracts anvil"
  exit 1
fi

ANVIL_ACCOUNTS_JSON="$(cast rpc --rpc-url "$RPC_URL" eth_accounts)"
ANVIL_ACCOUNTS=()
while IFS= read -r account; do
  [ -n "$account" ] && ANVIL_ACCOUNTS+=("$account")
done < <(node -e 'const accounts = JSON.parse(process.argv[1]); for (const a of accounts) console.log(a)' "$ANVIL_ACCOUNTS_JSON")

if [ "${#ANVIL_ACCOUNTS[@]}" -eq 0 ]; then
  echo "No accounts returned by eth_accounts from $RPC_URL"
  exit 1
fi

echo "USDC contract: $USDC_CONTRACT"
echo "RPC URL: $RPC_URL"
echo "Anvil test accounts found: ${#ANVIL_ACCOUNTS[@]}"
echo ""

for source_address in "$@"; do
  validate_address "$source_address"

  if ! contains_address "$source_address" "${ANVIL_ACCOUNTS[@]}"; then
    echo "Address is not unlocked in Anvil: $source_address"
    echo "Pass only accounts returned by eth_accounts on $RPC_URL"
    exit 1
  fi

  echo "Minting 100000 USDC to $source_address"
  cast send \
    "$USDC_CONTRACT" \
    "mint(address,uint256)" \
    "$source_address" \
    "$MINT_AMOUNT_UNITS" \
    --rpc-url "$RPC_URL" \
    --private-key "$MINTER_PRIVATE_KEY" >/dev/null

  echo "Sending 1000 USDC from $source_address to all Anvil test accounts"
  for recipient_address in "${ANVIL_ACCOUNTS[@]}"; do
    cast send \
      "$USDC_CONTRACT" \
      "transfer(address,uint256)" \
      "$recipient_address" \
      "$TRANSFER_AMOUNT_UNITS" \
      --rpc-url "$RPC_URL" \
      --from "$source_address" \
      --unlocked >/dev/null
  done

  echo "Done for $source_address"
  echo ""
done

echo "Completed."
