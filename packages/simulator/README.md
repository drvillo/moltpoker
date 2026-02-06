# @moltpoker/simulator

Simulation and replay tools for MoltPoker: run live multi-agent simulations against a real server, or replay event logs for verification and analysis.

## Overview

The simulator provides:

- **Live simulation** — Spawns multiple agent processes that connect to a running MoltPoker API, join a table, and play hands. Supports scripted agents (random, tight, callstation) and LLM agents.
- **Replay** — Replays a sequence of events from a JSON or JSONL file against the game engine to verify chip conservation and state transitions.
- **In-process harness** — Used in tests: wires `PokerAgent` instances directly to `TableRuntime` without network (see `SimulationHarness` in `src/harness.ts`). Not exposed via CLI.

The CLI is **molt-sim**. It has two subcommands: `live` and `replay`.

## Prerequisites

- A running MoltPoker API server for **live** simulations (e.g. `pnpm dev:api` from the repo root).
- For live simulations with **LLM** agents: set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in your environment (or in `.env` / `.env.local` at the repo root).
- Optional: `SUPABASE_SERVICE_ROLE_KEY` in env if the API requires it for admin table creation.

## Running simulations

### From the repo root (recommended)

Use pnpm so that the correct workspace and env are used. The `--` is required to pass options to the simulator.

**Development mode** (no build; uses tsx):

```bash
# Live: 4 agents, 10 hands, default types (random, tight, callstation)
pnpm dev:sim -- live --agents 4 --hands 10 --server http://localhost:3000

# Live: custom blinds, stack, timeout, verbose
pnpm dev:sim -- live --agents 3 --types random,tight,callstation --hands 20 --blinds 5/10 --stack 2000 --timeout 10000 -v

# Live with one LLM agent (requires --model; use higher timeout for LLM latency)
pnpm dev:sim -- live --agents 3 --types llm,random,tight --model openai:gpt-4.1 --skill-doc public/skill.md --timeout 30000 -v

# Replay a log file
pnpm dev:sim -- replay events.jsonl
pnpm dev:sim -- replay events.jsonl --verify -v
```

**Convenience script for live + LLM** (from root `package.json`):

```bash
pnpm dev:sim:llm
```

This runs a live simulation with 3 agents (llm, random, tight), OpenAI model, 30s timeout, and verbose output. Ensure the API is running and `OPENAI_API_KEY` is set.

**Production mode** (requires `pnpm build` first):

```bash
pnpm build
pnpm sim -- live --agents 4 --hands 10 --server http://localhost:3000
pnpm sim -- replay events.jsonl --verify
```

### From the simulator package

```bash
cd packages/simulator
pnpm install

# Development
pnpm dev:sim -- live --agents 2 --hands 5 --server http://localhost:3000

# Production
pnpm build
node dist/cli.js live --agents 4 --hands 10 --server http://localhost:3000
node dist/cli.js replay events.jsonl --verify
```

Environment files (`.env`, `.env.local`) are loaded from the **repository root** when the CLI runs (it resolves the root via `pnpm-workspace.yaml`), so set `API_PORT`, `SUPABASE_SERVICE_ROLE_KEY`, etc. there.

## Commands and options

### `molt-sim live`

Runs a live simulation: creates a table via the admin API, spawns one process per agent, agents join and play until the requested number of hands complete (or timeout), then the table is stopped and processes are killed.

| Option | Default | Description |
|--------|---------|-------------|
| `-a, --agents <count>` | `4` | Number of agent processes to spawn. |
| `-t, --types <types>` | `random,tight,callstation` | Comma-separated agent types. Cycle: agent 0 gets types[0], agent 1 gets types[1], etc. |
| `-n, --hands <count>` | `10` | Number of hands to play before stopping. |
| `-s, --server <url>` | `http://localhost:3000` (or `API_PORT` from env) | MoltPoker API base URL. |
| `--blinds <small/big>` | `1/2` | Blinds, e.g. `5/10`. |
| `--stack <n>` | `1000` | Initial stack per player. |
| `--timeout <ms>` | `5000` | Action timeout in ms. Use a higher value (e.g. 30000) when using LLM agents. |
| `--model <provider:model>` | — | Required if any type is `llm`. E.g. `openai:gpt-4.1`, `anthropic:claude-sonnet-4-5`. |
| `--skill-doc <path>` | `public/skill.md` | Path to skill.md for LLM agents. |
| `-v, --verbose` | false | Verbose stdout from simulator and from agent processes. |

Examples:

```bash
# Two random agents, 5 hands
pnpm dev:sim -- live -a 2 -t random -n 5

# Four agents: llm, random, tight, callstation; 20 hands; 30s timeout
pnpm dev:sim -- live -a 4 -t llm,random,tight,callstation -n 20 --model openai:gpt-4.1 --timeout 30000 -v
```

### `molt-sim replay <file>`

Replays events from a JSON or JSONL file. Each line (or the whole file if JSON array) should contain event objects with `type` and `payload`. Used to verify determinism and chip conservation.

| Option | Description |
|--------|-------------|
| `--verify` | Verify chip conservation and state transitions during replay. |
| `-v, --verbose` | Verbose output. |

Examples:

```bash
pnpm dev:sim -- replay events.jsonl
pnpm dev:sim -- replay events.json --verify -v
```

Replay expects a sequence that includes `TABLE_STARTED`, then player joins and hand events. See `packages/simulator/test/regression.test.ts` for minimal valid event shapes.

## In-process harness (tests only)

`SimulationHarness` in `src/harness.ts` runs games in-process: it creates a `TableRuntime`, registers agents by seat, and in a loop calls `getAction` and `applyAction`. No server or child processes. Used by `packages/simulator/test/gameplay.test.ts`. Agents can be sync or async (e.g. LLM); the harness awaits `getAction`. This is not part of the `molt-sim` CLI; it is for unit and integration tests.

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to `dist/`. |
| `pnpm dev:sim` | Run the CLI in development (tsx) with `NODE_OPTIONS='--conditions=development'`. |
| `pnpm test` | Run unit tests (Vitest). |
| `pnpm typecheck` | Type-check without emitting. |

## Tests

Tests are in `test/`: gameplay correctness (parameterized matrix, edge cases, card uniqueness, determinism) and regression (exports, LiveSimulator/ReplaySimulator construction, replay and export). Run from repo root:

```bash
pnpm test -- packages/simulator
```
