#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
fi

if ! command -v info >/dev/null 2>&1; then
  info() {
    echo "[INFO] $*"
  }
fi

if ! command -v success >/dev/null 2>&1; then
  success() {
    echo "[SUCCESS] $*"
  }
fi

if ! command -v warn >/dev/null 2>&1; then
  warn() {
    echo "[WARN] $*"
  }
fi

if ! command -v error >/dev/null 2>&1; then
  error() {
    echo "[ERROR] $*" >&2
  }
fi

if ! command -v fail >/dev/null 2>&1; then
  fail() {
    error "$*"
    exit 1
  }
fi

if ! command -v normalize_address >/dev/null 2>&1; then
  normalize_address() {
    echo "$1" | tr '[:upper:]' '[:lower:]'
  }
fi

run_local_contracts_stage() {
  local required_input_vars=(
    "REPO_ROOT"
    "EVM_RPC_URL"
    "EVM_USDC_CONTRACT"
    "EVM_VAULT_ADDRESS"
    "EVM_VAULT_ADMIN"
  )

  for var in "${required_input_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
      fail "Missing required variable for contracts stage: $var"
    fi
  done

  if ! command -v cast >/dev/null 2>&1; then
    fail "cast is required for contracts stage"
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    fail "pnpm is required for contracts stage"
  fi

  if ! command -v node >/dev/null 2>&1; then
    fail "node is required for contracts stage"
  fi

  if [ ! -d "$REPO_ROOT/contracts" ]; then
    fail "Contracts directory not found: $REPO_ROOT/contracts"
  fi

  if [ ! -f "$REPO_ROOT/contracts/script/check-abi.sh" ]; then
    fail "ABI check script not found: $REPO_ROOT/contracts/script/check-abi.sh"
  fi

  if [ ! -f "$REPO_ROOT/contracts/script/fund-anvil-usdc.sh" ]; then
    fail "Funding script not found: $REPO_ROOT/contracts/script/fund-anvil-usdc.sh"
  fi

  # Anvil check and restart
  info "Checking Anvil at $EVM_RPC_URL..."
  if cast chain-id --rpc-url "$EVM_RPC_URL" >/dev/null 2>&1; then
    warn "Anvil is already running. Killing existing process(es)..."
    pkill -f "anvil" || true
    sleep 2
  fi

  info "Starting fresh Anvil instance..."
  cd "$REPO_ROOT"
  pnpm --filter @moltpoker/contracts anvil >/dev/null 2>&1 &
  ANVIL_PID=$!
  info "Anvil started (PID: $ANVIL_PID)"

  info "Waiting for Anvil to be ready..."
  for i in {1..30}; do
    if cast chain-id --rpc-url "$EVM_RPC_URL" >/dev/null 2>&1; then
      success "Anvil is ready"
      break
    fi
    sleep 1
    [ $i -eq 30 ] && fail "Anvil did not become ready in time"
  done

  # Capture Anvil accounts
  info "Capturing Anvil default accounts..."
  ANVIL_ACCOUNTS_JSON="$(cast rpc --rpc-url "$EVM_RPC_URL" eth_accounts)"
  ANVIL_ACCOUNTS=()
  while IFS= read -r account; do
    [ -n "$account" ] && ANVIL_ACCOUNTS+=("$account")
  done < <(node -e 'const accounts = JSON.parse(process.argv[1]); for (const a of accounts) console.log(a)' "$ANVIL_ACCOUNTS_JSON")

  if [ "${#ANVIL_ACCOUNTS[@]}" -lt 10 ]; then
    fail "Expected at least 10 Anvil accounts, got ${#ANVIL_ACCOUNTS[@]}"
  fi

  # Default Anvil private keys (deterministic from default mnemonic)
  ANVIL_PRIVATE_KEYS=(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"
    "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"
    "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"
    "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"
    "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"
  )

  success "Captured ${#ANVIL_ACCOUNTS[@]} Anvil accounts"

  # Contracts stage
  info "=== Smart Contracts ==="

  info "Checking ABI consistency..."
  cd "$REPO_ROOT/contracts"
  if ! bash script/check-abi.sh; then
    error "ABI files are out of date!"
    echo ""
    echo "Run the following command and commit the changes:"
    echo "  pnpm --filter @moltpoker/contracts build && pnpm --filter @moltpoker/contracts abi:generate"
    echo ""
    fail "Stopping deployment. Fix ABI mismatch first."
  fi
  success "ABI files are up to date"

  info "Deploying contracts to local Anvil..."
  cd "$REPO_ROOT"
  DEPLOY_OUTPUT=$(pnpm --filter @moltpoker/contracts deploy:local 2>&1)
  echo "$DEPLOY_OUTPUT"

  # Parse deployed addresses
  DEPLOYED_USDC=$(echo "$DEPLOY_OUTPUT" | grep -oE "MockUSDC deployed at: (0x[a-fA-F0-9]{40})" | grep -oE "0x[a-fA-F0-9]{40}" || echo "")
  DEPLOYED_VAULT=$(echo "$DEPLOY_OUTPUT" | grep -oE "MoltPokerVault deployed at: (0x[a-fA-F0-9]{40})" | grep -oE "0x[a-fA-F0-9]{40}" || echo "")
  DEPLOYED_ADMIN=$(echo "$DEPLOY_OUTPUT" | grep -oE "Admin Address: (0x[a-fA-F0-9]{40})" | grep -oE "0x[a-fA-F0-9]{40}" || echo "")

  if [ -z "$DEPLOYED_USDC" ] || [ -z "$DEPLOYED_VAULT" ] || [ -z "$DEPLOYED_ADMIN" ]; then
    fail "Failed to parse deployed contract addresses from output"
  fi

  success "Contracts deployed successfully"
  info "  MockUSDC: $DEPLOYED_USDC"
  info "  Vault: $DEPLOYED_VAULT"
  info "  Admin: $DEPLOYED_ADMIN"

  # Verify addresses match .env.local
  info "Verifying deployed addresses against .env.local..."
  MISMATCH=false

  if [ "$(normalize_address "$EVM_USDC_CONTRACT")" != "$(normalize_address "$DEPLOYED_USDC")" ]; then
    error "EVM_USDC_CONTRACT mismatch!"
    error "  .env.local: $EVM_USDC_CONTRACT"
    error "  Deployed:   $DEPLOYED_USDC"
    MISMATCH=true
  fi

  if [ "$(normalize_address "$EVM_VAULT_ADDRESS")" != "$(normalize_address "$DEPLOYED_VAULT")" ]; then
    error "EVM_VAULT_ADDRESS mismatch!"
    error "  .env.local: $EVM_VAULT_ADDRESS"
    error "  Deployed:   $DEPLOYED_VAULT"
    MISMATCH=true
  fi

  if [ "$(normalize_address "$EVM_VAULT_ADMIN")" != "$(normalize_address "$DEPLOYED_ADMIN")" ]; then
    error "EVM_VAULT_ADMIN mismatch!"
    error "  .env.local: $EVM_VAULT_ADMIN"
    error "  Deployed:   $DEPLOYED_ADMIN"
    MISMATCH=true
  fi

  if [ "$MISMATCH" = true ]; then
    echo ""
    error "Address mismatch detected. Update .env.local with the deployed addresses above."
    fail "Stopping deployment."
  fi

  success "Address verification passed"

  # Fund Anvil accounts
  info "Funding Anvil accounts with mock USDC..."
  cd "$REPO_ROOT"
  bash contracts/script/fund-anvil-usdc.sh "${ANVIL_ACCOUNTS[@]}" || fail "Failed to fund Anvil accounts"
  success "All Anvil accounts funded"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
  ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.local}"

  standalone_cleanup() {
    local exit_code=$?
    if [ -n "${ANVIL_PID:-}" ] && kill -0 "$ANVIL_PID" 2>/dev/null; then
      info "Stopping Anvil (PID: $ANVIL_PID)"
      kill "$ANVIL_PID" 2>/dev/null || true
    fi
    exit $exit_code
  }

  trap standalone_cleanup EXIT INT TERM

  if [ -f "$ENV_FILE" ]; then
    read_env_var() {
      local key="$1"
      local line
      line="$(awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, "", $0); print; exit }' "$ENV_FILE" || true)"
      line="${line%%#*}"
      line="${line%"${line##*[![:space:]]}"}"
      line="${line#"${line%%[![:space:]]*}"}"
      printf '%s' "$line"
    }

    [ -n "${EVM_RPC_URL:-}" ] || EVM_RPC_URL="$(read_env_var "EVM_RPC_URL")"
    [ -n "${EVM_USDC_CONTRACT:-}" ] || EVM_USDC_CONTRACT="$(read_env_var "EVM_USDC_CONTRACT")"
    [ -n "${EVM_VAULT_ADDRESS:-}" ] || EVM_VAULT_ADDRESS="$(read_env_var "EVM_VAULT_ADDRESS")"
    [ -n "${EVM_VAULT_ADMIN:-}" ] || EVM_VAULT_ADMIN="$(read_env_var "EVM_VAULT_ADMIN")"
  else
    warn ".env.local not found at $ENV_FILE. Falling back to environment variables only."
  fi

  run_local_contracts_stage

  KEEP_ANVIL_ALIVE="${KEEP_ANVIL_ALIVE:-1}"
  if [ "$KEEP_ANVIL_ALIVE" = "1" ]; then
    info "Setup complete. Keeping Anvil running. Press Ctrl+C to stop."
    wait "$ANVIL_PID"
  fi
fi
