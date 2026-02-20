#!/usr/bin/env bash
# Run the MoltPoker API Docker image with env vars from .env.local.
# Usage: ./scripts/run-api-docker.sh
#
# Prerequisites:
#   - docker build -f apps/api/Dockerfile -t moltpoker-api .
#   - .env.local at repo root with required variables (see .env.example)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env.local not found at $ENV_FILE"
  echo "Copy .env.example to .env.local and fill in your values."
  exit 1
fi

cd "$REPO_ROOT"

# Port mapping from API_PORT in .env.local only (default 8080)
CONTAINER_PORT=$(grep -E '^API_PORT=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '\r' | tr -d ' ')
CONTAINER_PORT=${CONTAINER_PORT:-8080}

docker run --rm -it \
  -p "${CONTAINER_PORT}:${CONTAINER_PORT}" \
  --env-file "$ENV_FILE" \
  moltpoker-api
