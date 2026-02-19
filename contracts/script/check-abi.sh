#!/usr/bin/env bash
# Regenerate ABI TypeScript files and verify they match what is committed.
# Usage: pnpm --filter @moltpoker/contracts abi:check
# Exits with code 1 if the generated files differ (i.e. someone changed the
# contract but forgot to run abi:generate).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ABI_TARGET_DIR="$CONTRACTS_DIR/../packages/payments/src/abis"

# Ensure Forge artifacts exist
if [ ! -d "$CONTRACTS_DIR/out" ]; then
  echo "Forge artifacts not found. Running forge build..."
  (cd "$CONTRACTS_DIR" && forge build)
fi

# Regenerate
node "$SCRIPT_DIR/generate-abi.js"

# Check for changes
if git diff --exit-code -- "$ABI_TARGET_DIR" > /dev/null 2>&1; then
  echo "ABI files are up to date."
  exit 0
else
  echo ""
  echo "ERROR: ABI files are out of date!"
  echo "The generated ABI TypeScript files differ from what is committed."
  echo ""
  echo "Run the following and commit the changes:"
  echo "  pnpm --filter @moltpoker/contracts build && pnpm --filter @moltpoker/contracts abi:generate"
  echo ""
  git diff --stat -- "$ABI_TARGET_DIR"
  exit 1
fi
