#!/usr/bin/env bash
# MoltPoker Local Development Environment Orchestrator
# Boots all services and prepares the stack for testing
set -euo pipefail

# Add Foundry tools to PATH
export PATH="$HOME/.foundry/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"
API_CONTAINER_NAME="moltpoker-api-local"

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging helpers
info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

fail() {
  error "$*"
  exit 1
}

normalize_address() {
  echo "$1" | tr '[:upper:]' '[:lower:]'
}

CONTRACTS_STAGE_SCRIPT="$REPO_ROOT/contracts/script/setup-local-chain.sh"
if [ ! -f "$CONTRACTS_STAGE_SCRIPT" ]; then
  fail "Contracts stage script not found: $CONTRACTS_STAGE_SCRIPT"
fi
source "$CONTRACTS_STAGE_SCRIPT"

# Cleanup handler
ANVIL_PID=""
WEB_PID=""
cleanup() {
  local exit_code=$?
  echo ""
  warn "Cleaning up child processes..."
  
  if [ -n "$ANVIL_PID" ] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    info "Stopping Anvil (PID: $ANVIL_PID)"
    kill "$ANVIL_PID" 2>/dev/null || true
  fi
  
  if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
    info "Stopping web server (PID: $WEB_PID)"
    kill "$WEB_PID" 2>/dev/null || true
  fi

  if command -v docker >/dev/null 2>&1 && docker container inspect "$API_CONTAINER_NAME" >/dev/null 2>&1; then
    info "Stopping API container ($API_CONTAINER_NAME)"
    docker stop "$API_CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$API_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  
  exit $exit_code
}

trap cleanup EXIT INT TERM

# Check required commands
check_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "$1 is required but not found. Install it and try again."
  fi
}

info "Checking required commands..."
check_command pnpm
check_command docker
check_command cast
check_command forge

# Load environment file
if [ ! -f "$ENV_FILE" ]; then
  fail ".env.local not found at $ENV_FILE. Create it from .env.example and configure it."
fi

info "Loading environment from .env.local..."
function read_env_var() {
  local key="$1"
  local line
  line="$(awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, "", $0); print; exit }' "$ENV_FILE" || true)"
  line="${line%%#*}"
  line="${line%"${line##*[![:space:]]}"}"
  line="${line#"${line%%[![:space:]]*}"}"
  printf '%s' "$line"
}

API_PORT="$(read_env_var "API_PORT")"
EVM_RPC_URL="$(read_env_var "EVM_RPC_URL")"
EVM_USDC_CONTRACT="$(read_env_var "EVM_USDC_CONTRACT")"
EVM_VAULT_ADDRESS="$(read_env_var "EVM_VAULT_ADDRESS")"
EVM_VAULT_ADMIN="$(read_env_var "EVM_VAULT_ADMIN")"

# Validate required env vars
REQUIRED_VARS=(
  "API_PORT"
  "EVM_RPC_URL"
  "EVM_USDC_CONTRACT"
  "EVM_VAULT_ADDRESS"
  "EVM_VAULT_ADMIN"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    fail "Required environment variable $var is not set in .env.local"
  fi
done

success "Environment loaded and validated"

# Service prechecks
info "=== Service Prechecks ==="

# Docker check
info "Checking Docker..."
if ! docker info >/dev/null 2>&1; then
  warn "Docker is not running. Attempting to start OrbStack..."
  if command -v orbstack >/dev/null 2>&1; then
    orbstack start || fail "Failed to start OrbStack"
    info "Waiting for Docker to be ready..."
    for i in {1..30}; do
      if docker info >/dev/null 2>&1; then
        success "Docker is ready"
        break
      fi
      sleep 1
      [ $i -eq 30 ] && fail "Docker did not become ready in time"
    done
  else
    fail "Docker is not running and OrbStack not found. Start Docker manually."
  fi
else
  success "Docker is running"
fi

run_local_contracts_stage

# Build and migrations
info "=== Build and Migrations ==="

info "Building project..."
cd "$REPO_ROOT"
pnpm build || fail "Build failed"
success "Build completed"

info "Running database migrations..."
pnpm db:migrate || fail "Migrations failed. Ensure Supabase is running (npx supabase start)"
success "Migrations completed"


# API Docker deploy
info "=== API Docker Deployment ==="

info "Building API Docker image..."
cd "$REPO_ROOT"
docker build -f apps/api/Dockerfile -t moltpoker-api . || fail "Docker build failed"
success "Docker image built"

info "Stopping existing moltpoker-api-local container if running..."
docker stop "$API_CONTAINER_NAME" 2>/dev/null || true
docker rm "$API_CONTAINER_NAME" 2>/dev/null || true

info "Starting API container in detached mode..."
docker run -d \
  --name "$API_CONTAINER_NAME" \
  -p "${API_PORT}:${API_PORT}" \
  --env-file "$ENV_FILE" \
  moltpoker-api || fail "Failed to start API container"

success "API container started"

info "Verifying API is listening on port $API_PORT..."
for i in {1..30}; do
  if curl -f -s "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
    success "API is healthy and responding"
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    warn "API did not respond to health check within 30 seconds"
    info "Check logs with: docker logs $API_CONTAINER_NAME"
  fi
done

# Start web UI server
info "=== Starting Web UI ==="

info "Starting Next.js development server..."
cd "$REPO_ROOT"
pnpm dev:web >/dev/null 2>&1 &
WEB_PID=$!
info "Web server started (PID: $WEB_PID)"

info "Waiting for web server to be ready..."
for i in {1..30}; do
  if curl -f -s "http://localhost:3000" >/dev/null 2>&1; then
    success "Web server is ready at http://localhost:3000"
    break
  fi
  sleep 1
  [ $i -eq 30 ] && warn "Web server did not respond within 30 seconds"
done

# Final summary
echo ""
echo "============================================"
success "Local development environment is ready!"
echo "============================================"
echo ""
info "Services:"
echo "  Anvil RPC:    $EVM_RPC_URL"
echo "  API Server:   http://localhost:${API_PORT}"
echo "  Web UI:       http://localhost:3000"
echo ""
info "Smart Contracts:"
echo "  MockUSDC:     $DEPLOYED_USDC"
echo "  Vault:        $DEPLOYED_VAULT"
echo "  Admin:        $DEPLOYED_ADMIN"
echo ""
info "Anvil Test Accounts (pre-funded with mock USDC):"
echo ""
for i in {0..9}; do
  echo "  Account #$i:"
  echo "    Address:     ${ANVIL_ACCOUNTS[$i]}"
  echo "    Private Key: ${ANVIL_PRIVATE_KEYS[$i]}"
  echo ""
done

echo "============================================"
info "Ready for testing. Press Ctrl+C to stop all services."
echo "============================================"
echo ""

# Keep script running
wait
