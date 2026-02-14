# PRD: Heads-Up Poker LLM Benchmark (CRN + TrueSkill)

## 1. Context

### Problem

There is no structured way to compare the poker-playing ability of different LLM agents (or scripted baselines) against each other. Running ad-hoc games produces noisy results dominated by card variance and position advantage, making it impossible to confidently rank models.

### Why now

The platform already has a working poker engine (`TableRuntime`), multiple agent implementations (`PokerAgent` interface), and an in-process simulation harness. All the building blocks exist to build a statistically rigorous benchmarking system with minimal new infrastructure.

### Assumptions

- The `PokerAgent` interface from `@moltpoker/agents` can be used as-is without modification. All agents that implement this interface (random, tight, callStation, llm) are supported. The `AutonomousAgent` (which does not implement `PokerAgent`) is deferred to a future extension.
- The `TableRuntime` from `@moltpoker/poker` is the authoritative game engine and supports deterministic replay via seed-based shuffling (`seedrandom`).
- The `SimulationHarness` from `@moltpoker/simulator` demonstrates the correct pattern for in-process agent-to-runtime wiring.
- Head-to-head (2-player) is the only format for the initial release. Multi-player benchmarking is out of scope.
- The `openskill` npm package provides a suitable TypeScript-native implementation of Weng-Lin (TrueSkill-family) rating models.

---

## 2. Goals

### Goals

- **Statistically rigorous comparison**: Use CRN (Common Random Numbers) with seat-swap to cancel card luck and position bias, producing low-variance match results.
- **Adaptive efficiency**: Use OpenSkill ratings + uncertainty-driven matchmaking to converge on a stable leaderboard with significantly fewer total games than round-robin.
- **Deterministic reproducibility**: Same config + same seed pool = identical outcomes for a fixed model version.
- **Zero modification to existing packages**: Build entirely on top of `@moltpoker/poker`, `@moltpoker/agents`, and `@moltpoker/shared` without changing them.
- **Easy invocation**: Single CLI command to configure and run a benchmark, with sensible defaults.
- **Machine-readable results**: JSON output with leaderboard, match history, and convergence data.

### Non-goals

- Multi-player (3+) benchmarking (head-to-head only).
- Live/network-based benchmarking (in-process only for MVP).
- Autonomous agent support (requires live server; deferred).
- Web-based results viewer (JSON + CLI output for MVP).
- Real-time streaming of results during benchmark execution (batch-mode only).
- Cost estimation / dry-run mode for LLM API calls.

---

## 3. Users & Use Cases

### Personas

1. **Platform developer**: Wants to validate that changes to the poker engine or agent prompts don't regress performance.
2. **LLM researcher**: Wants to compare different models (GPT-4.1 vs Claude Sonnet vs Gemini) at poker decision-making.
3. **Agent author**: Wants to test a new strategy/agent against established baselines (random, tight, callStation).

### User Stories

- As a **platform developer**, I want to run `pnpm dev:bench` with a config file and get a ranked leaderboard of agents so I can verify relative performance after code changes.
- As an **LLM researcher**, I want to benchmark 5 LLM models with a fixed seed pool and get reproducible `(mu, sigma)` ratings so I can publish rigorous comparisons.
- As an **agent author**, I want to add my custom `PokerAgent` to the benchmark config and see where it ranks against built-in baselines.

---

## 4. Functional Requirements

### FR-1: Model Registry (must)

1. A `ParticipantConfig` interface that associates an `id`, `displayName`, agent type/config, and optional initial rating.
2. Support for built-in agent types: `random`, `tight`, `callstation`, `llm`.
3. Support for custom agents via a factory function pattern (user provides a `() => PokerAgent`).
4. LLM agents must accept model specifier (e.g., `openai:gpt-4.1`) and optional config (temperature, skill doc path).

### FR-2: Match Runner — In-Process Game Engine Adapter (must)

5. A `GameRunner` that creates a `TableRuntime` instance, wires two `PokerAgent` instances, and runs a configurable number of hands.
6. Accepts: `playerA`, `playerB`, `seed`, `seatAssignment` (A-first or B-first), `gameConfig` (blinds, stacks, hand limit), `limits` (action timeout, max retries).
7. Returns: `GameResult` with per-player net chips, per-player stack trajectory, action count, error/timeout events, and the seed used.
8. Follows the `SimulationHarness` pattern: retry invalid actions up to N times, then force-fold and log error.
9. Each game is a multi-hand session (e.g., 50-100 hands per seed) to produce meaningful chip differentials.

### FR-3: Match Aggregator — CRN Series (must)

10. For each seed in a match, run exactly 2 games: A-first and B-first (seat swap).
11. Aggregate net chips across the paired games to produce a position-neutral result per seed.
12. Aggregate across all seeds in the match to produce a single `MatchResult`.
13. `MatchResult` includes: `scoreA`, `scoreB`, `winner` (A/B/draw), per-seed breakdown, total hands played, errors.
14. Winner determination: primary metric is `matchWinloss` (who has more aggregate net chips). Draw threshold configurable (default: 0 — strict inequality).

### FR-4: Rating Service — OpenSkill (must)

15. Initialize `(mu, sigma)` per participant using configurable defaults (mu0=25, sigma0=25/3).
16. After each match, update ratings for both participants based on the match result (win/loss).
17. Expose `getLeaderboard()` returning participants sorted by `mu` descending, with `sigma`, match count, win/loss record.
18. Expose `predictWinProb(A, B)` for use by the scheduler.

### FR-5: Scheduler — Adaptive Matchmaking (must)

19. Default policy: `uncertainty_overlap` — prefer pairs with high combined uncertainty (`sigmaA + sigmaB`) and close skill means (`|muA - muB|`).
20. Configurable exploration parameter (0-1) to balance exploitation (close pairs) vs exploration (uncertain pairs).
21. Avoid immediate rematches (configurable window).
22. Framework for adding alternative policies (thompson, adjacent_pairs) in future.

### FR-6: Stop Conditions (must)

23. `adjacent_confidence`: stop when for each adjacent pair in leaderboard, `P(higher > lower) >= confidence_threshold`.
24. `budget`: stop when max matches, max games, max hands, or max duration exceeded.
25. `topk_stable`: stop when top-K rankings unchanged for N consecutive iterations.
26. Multiple conditions can be combined (first to trigger stops the run).

### FR-7: Reporting & Artifacts (must)

27. Final leaderboard JSON: `{ participants: [{ id, name, mu, sigma, matches, wins, losses }] }`.
28. Match history JSON: `{ matches: [{ id, participantA, participantB, seeds, result, ratingDelta }] }`.
29. Summary to stdout: formatted leaderboard table, total games/hands, convergence reason, duration.
30. All output written to configurable `outputDir`.

### FR-8: CLI Entry Point (must)

31. `molt-bench` binary (or `pnpm dev:bench`) that accepts a config file path or inline flags.
32. Sensible defaults: 2 scripted agents (random, tight), 10 seeds per match, 50 hands per game, stop after 20 matches or 95% adjacent confidence.
33. `--config <path>` for full YAML/JSON config.
34. `--participants <types>` shorthand (e.g., `--participants random,tight,callstation`).
35. `--seeds <count>` and `--hands <count>` for quick overrides.

### FR-9: Seed Pool Management (must)

36. Generate deterministic seed pool from a master seed (e.g., `masterSeed + index`).
37. Optionally load seeds from a file for exact reproducibility across runs.
38. Save used seed list to output dir for reproducibility.

### FR-10: Configuration Schema (should)

39. Full `BenchmarkConfig` schema validated with Zod, covering all subsystems.
40. Sensible defaults for all optional fields.
41. Config snapshot saved to output dir alongside results.

---

## 5. User Experience

### Key Flows

**Quick benchmark (CLI shorthand):**
```bash
pnpm dev:bench -- --participants random,tight,callstation --seeds 10 --hands 50
```
→ Runs adaptive benchmark, prints leaderboard to stdout, writes JSON to `./benchmark-results/`.

**Full config benchmark:**
```bash
pnpm dev:bench -- --config benchmark.config.json
```
→ Loads full config with LLM participants, custom stop conditions, and output settings.

**Reproducible re-run:**
```bash
pnpm dev:bench -- --config benchmark-results/2026-02-13T10-00-00/config.json
```
→ Replays exact same benchmark from saved config + seed list.

### Edge Cases

- **LLM API failure during game**: Action retry up to configured limit, then force-fold. Error logged in match result. Rating update still occurs (loss for erroring agent reflects unreliability).
- **All agents identical (e.g., 3x random)**: Ratings converge to similar mu with overlapping sigma. Stop condition triggers on adjacent_confidence since differences are within noise.
- **Single participant**: Error on startup — minimum 2 participants required.
- **Extremely long games (infinite check-check loops)**: Max hands per game prevents runaway. Max turns per hand can be configured.

### Error States

- Invalid config → Zod validation error with clear message, exit 1.
- Missing LLM API key → Error at agent creation time, before benchmark starts.
- All agents error out in a game → Game recorded as draw with errors flagged.
- Disk full / output write fails → Warning logged, benchmark continues (results in memory).

---

## 6. Technical Considerations

### Proposed Approach (High Level)

Create a new `packages/benchmark` package with the following internal structure:

```
packages/benchmark/
├── src/
│   ├── index.ts              # Public API exports
│   ├── cli.ts                # Commander-based CLI entry point
│   ├── config.ts             # BenchmarkConfig Zod schema + defaults
│   ├── registry.ts           # Participant registry + agent factory
│   ├── runner.ts             # GameRunner (single game execution)
│   ├── match.ts              # MatchRunner (CRN series aggregation)
│   ├── rating.ts             # OpenSkill rating service wrapper
│   ├── scheduler.ts          # Adaptive matchmaking scheduler
│   ├── stop.ts               # Stop condition evaluators
│   ├── report.ts             # Result formatting + file output
│   ├── seeds.ts              # Seed pool generation + management
│   └── types.ts              # Shared interfaces and types
├── package.json
└── tsconfig.json
```

**Key design decisions:**

1. **In-process execution**: Games run via direct `TableRuntime` + `PokerAgent` wiring (like `SimulationHarness`), not over the network. This gives determinism, speed, and no server dependency.

2. **No changes to existing packages**: The benchmark imports and uses `TableRuntime`, `PokerAgent`, and existing agent constructors. The `PokerAgent` interface already supports async agents (returns `Promise<PlayerAction>`), so LLM agents work without modification.

3. **CRN implementation**: For each seed, instantiate two `TableRuntime` instances with the same seed. In game 1, agent A sits at seat 0 (button) and B at seat 1. In game 2, B sits at seat 0 and A at seat 1. Same cards are dealt because same seed → same shuffle.

4. **Rating model**: Use `openskill` with Plackett-Luce model. Binary win/loss updates after each match. The library handles mu/sigma calculation.

5. **Scheduler**: Score each possible pair by `(sigmaA + sigmaB) * exploration + (1 - |muA - muB| / maxSpread) * (1 - exploration)`. Pick the highest-scoring pair, avoiding recent rematches.

### Data / Schema Changes

None. No database changes. All data is in-memory during execution and written to JSON files on completion.

### API Changes / Contracts

None. This is a standalone CLI tool. No API surface changes.

### Security / Permissions

- LLM API keys must be available as environment variables (same as existing agent runner).
- No new auth requirements.
- Seed files are read-only; output files are written to a configurable directory.

### Performance / Scalability

- **Scripted agents**: A single match (10 seeds × 50 hands × 2 seat-swaps = 1,000 hands) runs in <1 second.
- **LLM agents**: Bottleneck is API latency. A single hand may take 5-30 seconds per player action. A 50-hand game could take 10-30 minutes. Matches are sequential (no parallelism in MVP).
- **Memory**: Negligible for scripted agents. LLM agents maintain conversation context but it's bounded by the agent's own context management.
- **Future**: Game-level parallelism is possible since each `TableRuntime` is independent. CRN pairs are independent. Match-level parallelism is also possible when participants don't overlap.

### Observability

- JSONL log file per benchmark run with all match results and rating updates.
- Console output with progress indicators (current match, iteration, rating snapshots).
- Error counts per agent in final report.

---

## 7. Rollout Plan

### Feature Flagging

Not applicable — this is a new standalone package with no impact on existing functionality.

### Migration / Backfill

None required.

### Staged Rollout

1. **Phase 1 (this PR)**: Core benchmark harness with scripted agents, CRN, OpenSkill, CLI.
2. **Phase 2**: LLM agent integration testing, cost tracking, convergence visualization.
3. **Phase 3**: Autonomous agent support (live server mode), parallel game execution.
4. **Phase 4**: Web-based results viewer, historical comparison across runs.

### Rollback Plan

Delete the `packages/benchmark` directory. No other packages are modified.

---

## 8. Analytics & Success Metrics

### KPIs

- **Convergence efficiency**: Number of total games needed to reach 95% adjacent confidence, compared to full round-robin.
- **Reproducibility**: Re-running with same config + seeds produces identical leaderboard.
- **Ranking accuracy**: Known-stronger agents (tight > random) consistently ranked higher.

### Guardrail Metrics

- **Error rate**: <5% of games should end in force-fold due to agent errors (for scripted agents: 0%).
- **Chip conservation**: Total chips in the system must be conserved across all hands (validation check).
- **Rating convergence**: Sigma should decrease monotonically for each participant (on average).

---

## 9. Testing Plan

### Unit Tests

- **Seed generation**: Verify deterministic seed pool from master seed.
- **GameRunner**: Run a game with two random agents, verify net chips sum to zero, verify deterministic replay with same seed.
- **CRN aggregation**: Verify seat-swap produces symmetric results with same seed.
- **Rating service**: Verify OpenSkill update produces expected mu/sigma changes for win/loss.
- **Scheduler**: Verify uncertainty_overlap policy selects the most uncertain pair.
- **Stop conditions**: Verify each condition type triggers at the correct threshold.
- **Config validation**: Verify Zod schema rejects invalid configs with clear messages.

### Integration Tests

- **End-to-end scripted**: Run a full benchmark with random + tight + callStation (3 participants), verify tight consistently ranks above random.
- **Deterministic replay**: Run same config twice, verify identical results.
- **Budget stop**: Run with budget cap, verify it stops at the right limit.
- **Error handling**: Agent that always throws → verify force-fold, logging, and rating update.

### Acceptance Criteria Checklist

- [ ] `pnpm dev:bench -- --participants random,tight` produces a leaderboard with tight ranked above random.
- [ ] Same config + same master seed → identical match results and final ratings.
- [ ] Scheduler concentrates games on close/uncertain pairs (measure via match distribution).
- [ ] Stop condition fires automatically with reason logged.
- [ ] All results written to output directory as valid JSON.
- [ ] Benchmark completes without modifying any existing package.
- [ ] `pnpm build` succeeds for the new package.
- [ ] `pnpm test` passes all new tests.

---

## 10. Milestones

### Milestone 1: Foundation (Core Types + Config)

- `types.ts`: All interfaces (`ParticipantConfig`, `GameResult`, `MatchResult`, `BenchmarkConfig`, etc.)
- `config.ts`: Zod schema with defaults
- `seeds.ts`: Seed pool generation
- `package.json` + `tsconfig.json` setup

### Milestone 2: Game Execution

- `registry.ts`: Participant registry + agent factory
- `runner.ts`: Single game runner (adapted from `SimulationHarness`)
- `match.ts`: CRN match runner (seed × seat-swap aggregation)

### Milestone 3: Rating + Scheduling

- `rating.ts`: OpenSkill wrapper
- `scheduler.ts`: Uncertainty-overlap matchmaking
- `stop.ts`: Stop condition evaluators

### Milestone 4: Orchestration + CLI

- `index.ts`: Main benchmark orchestrator (the loop)
- `cli.ts`: Commander CLI
- `report.ts`: Result formatting + file output
- Root scripts: `dev:bench`, `bench`

### Milestone 5: Testing + Polish

- Unit tests for all components
- Integration test (end-to-end scripted benchmark)
- Documentation in README

### Dependencies

- `openskill` npm package (new dependency)
- `commander` (already used in agents/simulator packages)
- `zod` (already used throughout)
- `seedrandom` (already used by `@moltpoker/poker`)

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM agents too slow for meaningful benchmarks | Medium | Medium | Default config uses scripted agents; LLM mode documented as slow |
| OpenSkill ratings don't converge for very similar agents | Low | Medium | Adjacent confidence stop condition handles this gracefully |
| CRN doesn't fully cancel variance in short sessions | Medium | Low | Configurable hands-per-game; recommend >= 50 for LLM, >= 200 for scripted |
| Memory issues with many concurrent LLM agent contexts | Low | Low | Sequential match execution; only 2 agents active at a time |

### Open Questions

- Should we support "score-based" rating updates (using net chip differential as a score) in addition to binary win/loss? This would provide more signal per match but requires a different OpenSkill model.
- What is the optimal default for hands-per-game? 50 for LLM (cost), 200 for scripted (variance reduction)?
- Should the benchmark support "warm-up" hands that don't count toward the match result (to let LLM agents calibrate)?
