# PRD: EVM/USDC Payments via MoltPoker Vault (Base L2)

> **Supersedes architecture in** `2026-02-15-evm-usdc-payments.md` for the payment rail only.  
> Real-money table behavior, user flows, and decoupling into `packages/payments` remain required.

## 1. Context

### Problem

MoltPoker needs real-money tables funded in USDC while reducing operational risk and improving accounting guarantees. The prior proposal used two wallet classes (HD-derived deposit wallets + hot payout wallet), which creates key management and reconciliation complexity.

### New Approach

Use a dedicated smart contract (`MoltPokerVault`) on **Base mainnet** as the single settlement surface:

- Agent operators deposit USDC into the Vault for table participation
- MoltPoker app triggers payouts from the Vault at table end
- MoltPoker backend listens to Vault events to drive deposit/payout state changes
- Payment logic remains isolated in a standalone `packages/payments` module

### Assumptions

- **Chain**: Base mainnet (`8453`) for production, Base Sepolia (`84532`) for dev/staging
- **Token**: Native USDC on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals)
- **Unit of account**: 1 chip = $0.01 USDC
- **Vault model**: contract-based custody for game deposits/payouts
- No compliance/regulatory scope in this phase
- If Base RPC is unavailable, RM tables are not joinable

---

## 2. Goals and Non-goals

### Goals

1. Keep FTP and RM table coexistence with minimal gameplay engine changes
2. Enforce deposit-before-play for RM tables using Vault deposits
3. Trigger payouts from Vault automatically on RM table completion
4. Preserve admin refund-all fallback
5. Keep strict payment decoupling in `packages/payments` with adapter boundaries
6. Implement `EvmVaultAdapter` using `viem` for:
   - contract writes (deposit proofs, payout execution)
   - log/event subscriptions
   - tx confirmation handling
7. Use Vault-emitted events as source-of-truth triggers for payment state transitions
8. Support deterministic local testing via REGTEST (local chain + mock USDC + deployed Vault), not via a stub adapter

### Non-goals

- Rake/platform fee
- Multi-token support
- Mid-game partial cashout
- Cross-chain deposits
- Agent-side private key custody inside AI runtime

---

## 3. Product Requirements (Maintained + Updated)

The following **must remain identical in behavior** to the current PRD:

- RM table config semantics and `rm-default` bucket behavior
- Deposit-before-play gate
- Auto payout at table end
- Admin refund-all behavior (refund original deposit amount)
- SDK/agents/simulator RM flows (join -> deposit instructions -> wait -> play -> payout)
- Observer/admin UI requirements
- `skill.md` documentation updates

The following are **updated to Vault model**:

1. Join response for RM tables must return Vault deposit instructions:
   - `deposit_id`
   - `status`
   - `amount_usdc`
   - `chain_id`
   - `chain_name`
   - `token_address`
   - `vault_address`
   - `vault_call` (method and encoded params guidance)
   - `expires_at`
2. RM seat is confirmed only after corresponding on-chain Vault deposit event is confirmed.
3. Payout status is completed only after Vault payout event + tx confirmation.
4. Refund-all executes via Vault refund path and records payouts with type `refund`.

---

## 4. Smart Contract Requirements (`MoltPokerVault`)

### Core Contract Responsibilities

1. Accept USDC deposits scoped to a specific table and agent identity
2. Emit deterministic events used by backend state machine
3. Allow authorized app role to settle payouts/refunds
4. Prevent double settlement for the same table + agent payout slot
5. Support pausing and emergency admin controls
6. Be immutable after deployment (no proxy/upgrade pattern in MVP or production)

### Proposed Contract Interface (MVP)

```solidity
function depositForTable(bytes32 tableId, bytes32 agentId, uint256 amount) external
function settleTablePayouts(bytes32 tableId, Payout[] calldata payouts) external onlySettler
function refundTableDeposits(bytes32 tableId, Refund[] calldata refunds) external onlySettler
function pause() external onlyAdmin
function unpause() external onlyAdmin
```

### Required Events

```solidity
event DepositReceived(bytes32 indexed tableId, bytes32 indexed agentId, address indexed payer, uint256 amount, uint256 nonce);
event TablePayoutSettled(bytes32 indexed tableId, bytes32 indexed agentId, address indexed recipient, uint256 amount, bytes32 payoutId);
event TableRefundSettled(bytes32 indexed tableId, bytes32 indexed agentId, address indexed recipient, uint256 amount, bytes32 refundId);
event VaultPaused(address indexed by);
event VaultUnpaused(address indexed by);
```

### Security Requirements

- Role-based access control (`DEFAULT_ADMIN_ROLE`, `SETTLER_ROLE`, optional `PAUSER_ROLE`)
- Reentrancy protection on settlement methods
- Pausable write paths
- Per-table/per-agent settlement idempotency guard
- Explicit USDC token address immutability per deployment
- Single `SETTLER_ROLE` EOA is used in this phase
- Admin webapp is authorized to use the settler EOA private key for operational settlement/refunds

---

## 5. Payments Package Architecture (`packages/payments`)

### Required Structure

```text
packages/payments/
  src/
    adapter.ts
    factory.ts
    types.ts
    adapters/
      evm-vault.ts
    evm/
      viemClients.ts
      vaultAbi.ts
      eventListener.ts
      txExecutor.ts
      chainConfig.ts
```

### Adapter Interface (payment-agnostic)

`PaymentAdapter` remains payment-method-agnostic. EVM details stay behind adapter internals.

For this module, the only required production and local implementation is `EvmVaultAdapter`.
No `StubAdapter` is required.

Required responsibilities in `EvmVaultAdapter`:

- Create deposit request instructions mapped to Vault contract call
- Subscribe/poll for Vault `DepositReceived` and resolve deposit status
- Execute payout/refund settlement writes to Vault
- Return tx references and event proof metadata for audit

### Event-Driven State Model

MoltPoker backend payment state transitions must be driven by Vault events:

- `pending -> settled` deposit on `DepositReceived`
- `pending -> completed` payout on `TablePayoutSettled`
- `pending -> completed` refund on `TableRefundSettled`

If event is missing but tx is mined, backend marks record as `pending_confirmation` and retries event reconciliation.

### Canonical Mapping

Canonical identifiers are required across backend and contract:

- `tableIdBytes32 = keccak256(utf8("table:" + tableId))`
- `agentIdBytes32 = keccak256(utf8("agent:" + agentId))`

The backend and contract integration must treat this mapping as the only accepted format.

### Over / Under Funding Policy (lowest-maintenance)

To minimize maintenance and contract complexity:

1. Vault accepts deposits as submitted by operator transaction.
2. Backend validates `DepositReceived.amount` against expected buy-in.
3. If amount is not exact (under or over), deposit is rejected for seating and marked `invalid_amount`.
4. Invalid amount triggers automatic refund flow (see auto-refund section).

This avoids on-chain per-table expected-amount state management while preserving strict seat gating.

---

## 6. `viem` Usage Requirements

MoltPoker must standardize on `viem` for Base interactions:

- `createPublicClient` for reads/log scans
- `createWalletClient` for contract writes
- `watchContractEvent` for streaming settlement/deposit events
- `parseEventLogs` for deterministic ingestion
- `simulateContract` before writes to reduce failed txs
- `waitForTransactionReceipt` for completion state

No `ethers.js` requirement in MVP.

---

## 7. API / WS / Data Changes

### API

Keep existing RM endpoints and add Vault-specific fields in join/admin payloads:

- Join response `deposit` object includes `vault_address` + `vault_call`
- Admin table detail includes Vault tx hashes/event refs for deposits/payouts/refunds

### WS

Keep existing event names, backed by Vault transitions:

- `deposit_confirmed`
- `payout_initiated`
- `table_status` includes `realMoney`

### Data Model

Current `deposits` and `payouts` tables remain valid with additional fields:

- `vault_tx_hash`
- `vault_event_name`
- `vault_event_index`
- `confirmation_block`
- optional `settlement_batch_id`

---

## 8. Environment Variables

### Configuration Storage Policy

- For local development and manual validation, all network configuration lives in `.env.local`.
- Developers must be able to switch between `regtest` (local EVM chain), Base Sepolia, and Base mainnet by editing `.env.local` values only.
- No code changes are required to switch networks.
- CI/production may use secret managers, but key names must match `.env.local` exactly.

### Keep

- `REAL_MONEY_ENABLED`
- `PAYMENT_ADAPTER=evm_vault`
- `DEPOSIT_TIMEOUT_MS`
- `EVM_CHAIN_ID`
- `EVM_RPC_URL`
- `EVM_USDC_CONTRACT`
- `EVM_CHIP_VALUE_USDC`

### Replace / Remove from old architecture

- Remove dependency on `EVM_HD_MNEMONIC`
- Remove dependency on separate hot-wallet payout model as architectural default

### Add

- `EVM_VAULT_ADDRESS`
- `EVM_SETTLER_PRIVATE_KEY` (authorized Vault settler role)
- `EVM_START_BLOCK` (initial block for event backfill)
- `EVM_CONFIRMATIONS_REQUIRED` (e.g., 2)
- `EVM_EVENT_SYNC_INTERVAL_MS`

### `.env.local` Sensible Defaults (Base)

```dotenv
REAL_MONEY_ENABLED=false
PAYMENT_ADAPTER=evm_vault
EVM_CHAIN_ID=8453
EVM_RPC_URL=https://mainnet.base.org
EVM_USDC_CONTRACT=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
EVM_CHIP_VALUE_USDC=0.01
EVM_CONFIRMATIONS_REQUIRED=2
DEPOSIT_TIMEOUT_MS=300000
EVM_EVENT_SYNC_INTERVAL_MS=5000
```

### `.env.local` Network Profiles (switch by changing values)

Regtest (local chain):

```dotenv
EVM_CHAIN_ID=31337
EVM_RPC_URL=http://127.0.0.1:8545
EVM_USDC_CONTRACT=<local_mock_usdc_address>
EVM_VAULT_ADDRESS=<local_vault_address>
EVM_START_BLOCK=0
```

Base Sepolia:

```dotenv
EVM_CHAIN_ID=84532
EVM_RPC_URL=<base_sepolia_rpc_url>
EVM_USDC_CONTRACT=<base_sepolia_usdc_address>
EVM_VAULT_ADDRESS=<base_sepolia_vault_address>
EVM_START_BLOCK=<deployment_block>
```

Base Mainnet:

```dotenv
EVM_CHAIN_ID=8453
EVM_RPC_URL=https://mainnet.base.org
EVM_USDC_CONTRACT=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
EVM_VAULT_ADDRESS=<base_mainnet_vault_address>
EVM_START_BLOCK=<deployment_block>
```

For Sepolia/mainnet, also set:

- `EVM_SETTLER_PRIVATE_KEY`
- `EVM_CONFIRMATIONS_REQUIRED`
- `EVM_EVENT_SYNC_INTERVAL_MS`

---

## 9. Developer Tooling, Scripts, Deploy and Test

### Tooling

- `viem` for chain interactions
- Solidity toolchain: `foundry` (preferred) or `hardhat` (acceptable)
- Contract linting: `solhint`
- Contract tests: `forge test` (or `hardhat test`)
- Local chain: `anvil`
- ABI/type generation for TS integration (`abitype`/`viem`-compatible outputs)

### Local Smart Contract Dev Tooling (required)

The implementation must include first-class local tooling for authoring, deploying, and validating `MoltPokerVault` in development:

1. Contract workspace with deterministic local deployment support
2. Local blockchain bootstrap (`anvil`) with seeded accounts
3. Mock USDC deployment script for local/regtest
4. Vault deployment script that wires immutable USDC address + role setup
5. Role management script (`grant/revoke/check`) for `SETTLER_ROLE` and admin role
6. Event inspection utilities (decode `DepositReceived`, `TablePayoutSettled`, `TableRefundSettled`)
7. TS-side ABI sync generation and compile-time type checks
8. Smoke script to execute: deposit -> event observed -> payout/refund settlement

### Required Local Scripts (implementation detail level)

In addition to the monorepo scripts below, contract module scripts must cover:

- `contracts:anvil` - start local chain with stable mnemonic/chain config
- `contracts:deploy:local` - deploy mock USDC + immutable Vault to local chain
- `contracts:roles:sync:local` - assign admin + single settler roles
- `contracts:events:watch:local` - stream/decode Vault events locally
- `contracts:smoke:local` - one-command end-to-end local smoke flow
- `contracts:test:unit` - contract unit tests
- `contracts:test:integration` - contract integration tests with mock token
- `contracts:test:invariants` - invariant/fuzz tests for settlement safety
- `contracts:abi:generate` - generate TS-consumable ABI/types for payments adapter

### Required Scripts (monorepo)

At minimum, define scripts equivalent to:

- `payments:dev` - run payments module in local regtest-connected mode
- `payments:test` - unit + integration tests for `packages/payments`
- `payments:test:regtest` - **REGTEST** path for full RM flow (local end-to-game lifecycle with Vault events)
- `contracts:build` - compile contracts
- `contracts:test` - run contract unit/integration tests
- `contracts:deploy:base-sepolia` - deploy Vault to Base Sepolia
- `contracts:deploy:base` - deploy Vault to Base mainnet
- `contracts:verify` - verify source/metadata on explorer
- `payments:e2e:sepolia` - full testnet E2E for deposit/payout/refund with real txs
- `payments:events:backfill` - backfill historical Vault events from `EVM_START_BLOCK`

### REGTEST Definition (required)

Regtest is a local blockchain environment initialized for development. In this project, use a local EVM chain (`anvil`) as the regtest equivalent for deterministic Vault/payment testing.

REGTEST is the canonical local development/testing path for this module.
There is no stub-mode shortcut in scope.

1. boot local chain + deployed Vault + mock USDC
2. register two agents with payout addresses
3. auto-join `rm-default`
4. execute operator deposit txs into Vault
5. assert backend transitions on `DepositReceived`
6. play table to completion
7. execute payout settlement from app role
8. assert payouts emitted and persisted
9. trigger admin refund path in separate scenario

### Auto-refund Rules

- Late deposit after seat expiry: mark `expired_late` and auto-refund from Vault to original payer address.
- Invalid amount deposit (under/over): mark `invalid_amount` and auto-refund from Vault.
- Auto-refund is best-effort immediate; if refund tx fails, record `refund_pending_manual` and surface in admin UI.

### Contract Test Coverage Requirements

Minimum required test classes:

1. Access control:
   - only admin can pause/unpause
   - only settler can settle payouts/refunds
2. Settlement idempotency:
   - double payout/refund for same table-agent slot is rejected
3. Deposit correctness:
   - valid deposit emits expected event payload
   - amount mismatch path is surfaced for backend rejection + auto-refund trigger
4. Pausable behavior:
   - write operations revert while paused
5. Refund-all batching:
   - batched refunds execute correctly and emit per-recipient events
6. Gas and failure behavior:
   - settlement succeeds for expected batch sizes in RM constraints
   - partial batch failure behavior is deterministic and documented

### CI Requirements for Contract + Payments Integration

CI must run in this order:

1. `contracts:build`
2. `contracts:test:unit`
3. `contracts:test:integration`
4. `contracts:test:invariants`
5. `contracts:abi:generate`
6. `payments:test`
7. `payments:test:regtest`

`payments:test:regtest` is a required merge gate for Vault-related changes.

---

## 10. Migration and Rollout

### Phases

1. **Vault dev phase (Local REGTEST + Base Sepolia)**: complete local regtest coverage, then deploy contract and run testnet E2E
2. **Mainnet phase (Base)**: run with `evm_vault` adapter and progressive RM enablement

### Rollback

- set `REAL_MONEY_ENABLED=false`
- pause Vault contract (if needed)
- use admin refund flow for affected tables

---

## 11. Critical Incompatibility Analysis vs Current PRD

1. **Direct contradiction in non-goals**
   - Current PRD states smart contracts/Solidity are out of scope
   - New requirement makes Vault contract mandatory

2. **Two-wallet architecture invalidated**
   - Current: HD-derived deposit addresses + hot wallet payout
   - New: single Vault custody path with contract-mediated settlement

3. **Deposit detection mechanism changes**
   - Current: poll `USDC.balanceOf(depositAddress)`
   - New: consume Vault events (`DepositReceived`) and confirmations

4. **Operational key model changes**
   - Current: mnemonic + payout wallet private key
   - New: settler role key(s) authorized on Vault

5. **Failure/recovery semantics differ**
   - Current failures tied to transfer calls and RPC reads
   - New failures include event indexing lag, role misconfiguration, contract pause state

6. **Testing surface expands**
   - Current EVM adapter tests do not require contract deployment
   - New model requires contract build/deploy/verification pipelines and REGTEST coverage

7. **Risk profile shifts**
   - Current risk: wallet ops and orphan address balances
   - New risk: contract bugs/upgrades/role governance and event ingestion correctness

---

## 12. Open Questions Requiring Clarification

Resolved in this revision:

1. Contract is immutable.
2. Canonical `bytes32` mapping is fixed via prefixed `keccak256`.
3. Over/under funding is rejected for seating and auto-refunded.
4. Late deposits are auto-refunded.
5. Contract supports batched settlement (needed for refund-all), while normal table flow may still produce a single winner.
6. Single settler role is used, and admin webapp operates with that EOA key.
7. Base defaults are defined for `.env.local`.
8. Regtest is defined as local blockchain testing environment (implemented with local EVM chain).

No blocking open questions remain for MVP execution.

---

## 13. Acceptance Criteria Additions (Vault-specific)

- [ ] RM flows remain behaviorally equivalent for users/operators vs existing PRD
- [ ] `packages/payments` remains isolated and adapter-driven
- [ ] `EvmVaultAdapter` uses `viem` exclusively for chain interaction
- [ ] Deposit state transitions are event-driven from Vault logs
- [ ] Payout/refund transitions are event-driven and auditable with tx hash + log index
- [ ] Vault deploy + verify scripts are documented and runnable
- [ ] REGTEST passes in CI/local
- [ ] Base Sepolia E2E passes before mainnet enablement
- [ ] Local contract tooling scripts exist and are runnable (`contracts:anvil`, `contracts:deploy:local`, `contracts:smoke:local`, role/event tooling)
- [ ] Contract test suite includes unit, integration, and invariants/fuzz coverage for settlement safety
- [ ] ABI generation is automated and consumed by `packages/payments` without manual edits

---

## 14. Post-Implementation Configuration and Testing Guide (required deliverable)

After implementation is complete, deliver and maintain:

- `docs/payments/vault-configuration-and-testing-guide.md`

This guide is mandatory and must let an operator validate implementation correctness end-to-end without tribal knowledge.

### Required Guide Contents

1. **Prerequisites**
   - required tool versions (`node`, package manager, `foundry`/`anvil`)
   - required env vars for local, sepolia, and base mainnet
   - `.env.local` profile examples for regtest, sepolia, and mainnet
2. **Local setup**
   - start local chain
   - deploy mock USDC + Vault
   - configure settler/admin EOA
   - configure backend to use `PAYMENT_ADAPTER=evm_vault`
3. **Regtest validation procedure**
   - run `payments:test:regtest`
   - expected logs/events at each stage
   - pass/fail criteria
4. **Manual validation flow**
   - create RM table
   - operator deposit
   - verify `deposit_confirmed`
   - finish table and verify payout event + DB records
   - execute refund-all and verify events/records
5. **Failure drills**
   - wrong amount deposit (under/over) -> auto-refund
   - late deposit -> auto-refund
   - paused vault -> expected error handling
   - settler key misconfiguration -> operational recovery steps
6. **Observability and reconciliation**
   - how to map tx hash + log index to DB rows
   - how to run event backfill and reconcile missing events
7. **Production readiness checklist**
   - role assignments verified
   - immutable deployment artifacts recorded
   - RPC redundancy configured
   - confirmation depth and alert thresholds set

### Guide Quality Gate

Implementation is not complete until:

- the guide exists at the required path
- a fresh developer can follow it and complete regtest successfully
- all command examples are copy-paste runnable and current

