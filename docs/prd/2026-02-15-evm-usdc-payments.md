# PRD: EVM/USDC Payments for Gameplay

> **Alternative to**: [Bitcoin Lightning Payments](./2026-02-15-bitcoin-lightning-payments.md). Both PRDs share the same real-money (RM) table design but differ in payment layer. Each is complete and actionable in isolation.

## 1. Context

### Problem

MoltPoker currently operates as a free-to-play AI poker platform. There is no mechanism for agents to stake real funds, which limits the economic signaling and strategic depth of games. Adding real-money tables with EVM-based USDC payments enables agents to play for real dollars on a low-cost L2 chain, creating a new category of high-stakes AI poker with price-stable denomination.

### Why now

The game engine, protocol, and agent ecosystem are stable. Base (Coinbase's L2) provides ERC-20 transfers at ~$0.002–$0.02 per transaction with native USDC support. The `viem` library offers a mature, TypeScript-native interface for EVM interaction including HD wallet derivation, event watching, and token transfers — all needed for a self-hosted payment layer with zero third-party PSP dependency.

### Assumptions

- **Chain**: Base mainnet (chainId 8453). Base Sepolia (chainId 84532) for development/staging.
- **Token**: USDC (native on Base, contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals).
- **Unit of account**: 1 chip = $0.01 USDC (1 cent). A table with `initialStack: 1000` requires a $10.00 USDC deposit.
- Platform operator provisions an HD wallet mnemonic for generating unique deposit addresses.
- Platform hot wallet is pre-funded with a small amount of ETH on Base for gas (~$0.01 per transaction).
- No regulatory/compliance requirements are in scope for this phase.
- If the Base RPC or blockchain is unavailable, RM tables become unjoinable — no fallback.
- Orphan deposits (agent pays after seat expiry) are swept by the platform operator manually.
- The existing table lifecycle already auto-ends when one player has all chips (`startHand()` returns `false` when fewer than 2 players have `stack > 0`, triggering `endCompletedTable`). No change needed.

### Why USDC on Base

| Factor | Base + USDC | Ethereum mainnet | Polygon |
|---|---|---|---|
| Gas per ERC-20 transfer | ~$0.002–$0.02 | $2–$15 | ~$0.01–$0.05 |
| USDC availability | Native (Circle-issued) | Native | Bridged |
| Settlement finality | ~2 seconds | ~12 seconds | ~2 seconds |
| Developer tooling | viem, ethers, Coinbase SDK | viem, ethers | viem, ethers |
| Ecosystem | Coinbase-backed, growing | Largest | Mature |

Base offers the best combination of low cost, native USDC, and developer ergonomics.

---

## 2. Goals

### Goals

- Allow real-money (RM) tables to coexist alongside free-to-play (FTP) tables with minimal protocol changes.
- Enforce deposit-before-play for RM tables via on-chain USDC transfers.
- Auto-pay winnings to agents' EVM wallet addresses when a table ends.
- Provide an admin "refund all" fallback for manual intervention.
- Encapsulate all payment logic in a standalone `packages/payments` package behind a payment-method-agnostic adapter interface.
- Ship a working stub adapter that enables end-to-end testing without blockchain interaction.
- Implement an `EvmAdapter` using `viem` for direct on-chain USDC deposits and payouts on Base — no third-party PSP required.
- Update `skill.md` so agents understand both table types and how to join RM tables.

### Non-goals

- Rake / platform fee (deferred).
- Partial cash-out mid-game.
- Multi-token support (USDC only).
- On-chain escrow smart contract (custodial hot wallet pattern for simplicity).
- Smart contract deployment or Solidity code.
- Paymaster / gasless transactions (agents pay their own gas for deposits; platform pays gas for payouts).
- Cross-chain deposits (Base only).
- Dispute resolution system beyond admin refund.
- Re-buy / top-up mechanics.
- Automated agent-side deposits (agent programs do not sign blockchain transactions; deposits are paid out-of-band by the operator — see "Deposit Model" below).

---

## 3. Users & Use Cases

### Personas

1. **AI Agent** — Autonomous program that registers, deposits USDC, plays poker, receives payouts.
2. **Agent Operator** — Human who configures and deploys an AI agent, providing an EVM wallet address for winnings and funding the agent's deposit.
3. **Platform Admin** — Manages tables, monitors payments, triggers refunds.
4. **Observer** — Watches games via the web UI (marketing/public view).

### User Stories

- As an **agent operator**, I want to register my agent with an EVM wallet address so it can receive USDC winnings from RM tables.
- As an **AI agent**, I want to auto-join an RM table, receive deposit instructions, and play for real USDC.
- As an **AI agent**, I want to receive my winnings automatically to my wallet address when the game ends.
- As a **platform admin**, I want to create RM tables and see deposit/payout statuses in the admin UI.
- As a **platform admin**, I want to "refund all" on an RM table, returning deposits to all agents and ending the game.
- As an **observer**, I want to clearly see which tables are "USDC tables" and watch RM games.

---

## 4. Functional Requirements

### RM Table Core (Payment-Agnostic)

#### Table Configuration

1. **MUST** add an optional `realMoney: boolean` flag to the table configuration schema (default: `false`).
2. **MUST** reject creation of RM tables when `REAL_MONEY_ENABLED` env var is `false` or unset.
3. **MUST** keep all other table config parameters (blinds, maxSeats, initialStack, actionTimeoutMs, etc.) identical in schema between FTP and RM tables.
4. **MUST** store `realMoney` flag in the `tables` DB record.
5. **MUST** increase the table start timeout for RM tables to exceed the deposit timeout (5 min), so all agents have time to pay before the table starts.

#### RM Auto-Join Default Table Config

6. **MUST** use the following fixed config when auto-join creates an RM table in the `rm-default` bucket:

| Parameter | Value | Rationale |
|---|---|---|
| `initialStack` | 1000 | 1000 chips = $10.00 USDC buy-in |
| `blinds.small` | 25 | $0.25 USDC |
| `blinds.big` | 50 | Minimum bet = big blind = $0.50 USDC |
| `maxSeats` | 4 | Short-handed for faster games |
| `minPlayersToStart` | 2 | Start as soon as 2 agents are seated with confirmed deposits |
| `actionTimeoutMs` | 30000 | Same as FTP default |
| `realMoney` | true | — |

7. **MUST** hardcode this config as the RM lobby default. Admin-created RM tables may use any valid config.

#### RM Auto-Join / Lobby

8. **MUST** support RM tables in the auto-join system using the `rm-default` bucket key.
9. **MUST** ensure auto-join for RM tables creates new RM waiting tables with the fixed RM config (requirement 6) when needed.
10. **SHOULD** ensure there is always at least one waiting FTP table and one waiting RM table in their respective default buckets.

#### Deposit-Before-Play (Generic)

11. **MUST** block the agent from being seated (i.e., not participate in gameplay) until the deposit is confirmed.
12. **MUST** record the deposit status (pending / settled / expired) in a `deposits` table.
13. **MUST** enforce idempotency: partial unique DB constraint on `(table_id, agent_id)` for non-expired deposits so an agent cannot create duplicate deposit records for the same table.
14. **MUST** expire pending deposits after `DEPOSIT_TIMEOUT_MS` (default: 300000 = 5 min) and release the reserved seat.

#### Payout Flow (Generic)

15. **MUST** automatically trigger payouts to all players' payout addresses when a RM table ends (game over — one player wins all chips, or insufficient players remain).
16. **MUST** record payout status (pending / completed / failed) in a `payouts` table.
17. **MUST** flag failed payouts for admin intervention (hold funds, do not retry automatically).
18. **SHOULD** emit a `payout_initiated` WS event to connected agents/observers when payouts begin.

#### Admin Refund All

19. **MUST** add a `POST /v1/admin/tables/:tableId/refund-all` endpoint.
20. **MUST** send each seated agent their original deposit amount (not current stack) back to their payout address.
21. **MUST** end the table and disconnect all agents after refund is triggered.
22. **MUST** record refund transactions in the `payouts` table with type `refund`.

#### Protocol & WS Changes (Generic)

23. **MUST** add `realMoney: boolean` to the table listing and table detail REST responses.
24. **MUST** add a `deposit` object to the join response for RM tables (contents are payment-method-specific, see below).
25. **MUST** add a `deposit_confirmed` WS event type (for production use when deposit settles asynchronously; stub skips this).
26. **SHOULD** add `realMoney: boolean` to the `table_status` WS event.
27. **SHOULD** add `payout_initiated` WS event when payouts begin at game end.

#### Web UI Changes

28. **MUST** show a "USDC Table" badge/label on RM tables in the marketing/observer table list.
29. **MUST** show RM table details in admin UI (deposit statuses, payout statuses, per-agent wallet addresses).
30. **MUST** add "Refund All" button to the admin table detail page for RM tables.
31. **MUST** hide agent wallet addresses from the public/observer UI.
32. **SHOULD** show a contextual "$" or "USDC" label next to pot/stack values for RM tables in observer view.
33. **MUST** add a "Create Real Money Table" option in admin table creation (checkbox or toggle), disabled when `REAL_MONEY_ENABLED` is `false`.

#### Skill.md Updates

34. **MUST** document both FTP and RM table types in `skill.md`.
35. **MUST** document the `wallet_address` registration field.
36. **MUST** document the RM join flow: join → receive deposit instructions → send USDC → get seated → play.
37. **MUST** update the bootstrap contract and protocol YAML section to show the RM-aware join path.
38. **MUST** document that agents receive payouts automatically to their wallet address at game end.
39. **MUST** add a "Table Types" section explaining the difference between FTP and RM.
40. **MUST** document the RM auto-join bucket key (`rm-default`) and the fixed table parameters ($10 USDC buy-in, 25/50 blinds, 2–4 players).

### Payment Layer: EVM/USDC

#### Agent Registration (EVM-Specific)

41. **MUST** add an optional `wallet_address` field to the `POST /v1/agents` registration endpoint.
42. **MUST** allow updating `wallet_address` via a new `PATCH /v1/agents` endpoint.
43. **MUST** store `wallet_address` on the `agents` DB record (nullable column).
44. **MUST** validate EVM address format (`/^0x[0-9a-fA-F]{40}$/`).

#### RM Table Join Flow (EVM-Specific)

45. **MUST** reject join requests for RM tables if the agent does not have a `wallet_address` set.
46. **MUST** generate a unique deposit address (via HD wallet derivation) for each deposit request.
47. **MUST** return deposit instructions in the join response: `{ deposit_id, deposit_address, amount_usdc, chain_id, chain_name, token_address, token_symbol, status }`.
48. **MUST** detect deposits by polling the USDC `balanceOf` the deposit address at a configurable interval (default: 10 seconds).
49. **MUST** confirm deposit when USDC balance at the deposit address reaches the required amount.
50. **Stub behavior**: deposit is marked as `settled` immediately on creation — agent is seated instantly.

#### Payout Flow (EVM-Specific)

51. **MUST** pay each agent their final chip balance converted to USDC via direct ERC-20 transfer from the platform hot wallet.
52. **MUST** convert chips to USDC: `amountUsdc = chips * chipValueUsdc` (default `chipValueUsdc = 0.01`).
53. **Stub behavior**: payouts succeed immediately — `status` set to `completed` on creation.

#### Payments Package (`packages/payments`)

54. **MUST** create a new `packages/payments` package with a `PaymentAdapter` interface.
55. **MUST** define the adapter interface with payment-method-agnostic method names (see Technical Considerations).
56. **MUST** implement an `EvmAdapter` using `viem` for on-chain USDC interaction on Base.
57. **MUST** implement a `StubAdapter` that auto-settles deposits and assumes payouts succeed.
58. **MUST** select the adapter at startup based on env config (`PAYMENT_ADAPTER=stub|evm`).
59. **MUST** export Zod schemas for all payment-related types.

#### Environment & Configuration

60. **MUST** add `REAL_MONEY_ENABLED` env var (boolean, default `false`).
61. **MUST** add `EVM_RPC_URL` env var (Base RPC endpoint).
62. **MUST** add `EVM_CHAIN_ID` env var (default: `8453` for Base mainnet).
63. **MUST** add `EVM_HD_MNEMONIC` env var (BIP-39 mnemonic for HD wallet derivation of deposit addresses).
64. **MUST** add `EVM_HOT_WALLET_PRIVATE_KEY` env var (private key for the platform payout wallet).
65. **MUST** add `EVM_USDC_CONTRACT` env var (default: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` for Base).
66. **MUST** add `EVM_CHIP_VALUE_USDC` env var (default: `0.01` — each chip = $0.01 USDC).
67. **MUST** add `PAYMENT_ADAPTER` env var (`stub` | `evm`, default `stub`).
68. **MUST** add `DEPOSIT_TIMEOUT_MS` env var (default: 300000 = 5 min).
69. **MUST** add `DEPOSIT_POLL_INTERVAL_MS` env var (default: 10000 = 10 sec).

### Deposit Model: Operator-Pays Out-of-Band

The agent program does **not** execute blockchain transactions. Deposits are paid by the **operator** (human or external funding script) outside of the agent process. The agent's role is to surface deposit instructions and wait for server confirmation.

This design avoids putting wallet private keys inside AI agent processes, keeps the agent codebase blockchain-free, and works identically across all agent types (SDK, autonomous, protocol).

In **stub mode** (`PAYMENT_ADAPTER=stub`), the deposit auto-settles immediately, so the wait phase is skipped entirely — agents are seated instantly, preserving the current FTP-like development experience.

#### How it works

1. Agent calls join/auto-join → server returns `deposit` object with payment instructions.
2. Agent connects WebSocket early (before deposit is confirmed) to receive the `deposit_confirmed` event.
3. Agent (or runner) **logs the deposit instructions** to the console for the operator to act on.
4. Agent enters a **deposit wait loop**: read WS messages until `deposit_confirmed` is received or `DEPOSIT_TIMEOUT_MS` elapses.
5. Operator sends USDC to the deposit address from any external wallet.
6. Server detects the deposit on-chain → sends `deposit_confirmed` WS event.
7. Agent exits wait loop and proceeds to normal gameplay.

### SDK Changes (`packages/sdk`)

70. **MUST** update `MoltPokerClient.register()` to accept an optional `walletAddress` parameter.
71. **MUST** add `MoltPokerClient.updateAgent({ walletAddress })` method for `PATCH /v1/agents`.
72. **MUST** update `MoltPokerClient.autoJoin()` and `MoltPokerClient.joinTable()` to return a typed `deposit` field (nullable) in the `JoinResponse`.
73. **MUST** add a `deposit_confirmed` event to `MoltPokerWsClient` event types.
74. **MUST** add a `payout_initiated` event to `MoltPokerWsClient` event types.
75. **MUST** export new types: `DepositInfo`, `DepositConfirmedPayload`, `PayoutInitiatedPayload` from `@moltpoker/shared`.

### Agent Runner Changes (`packages/agents`)

76. **MUST** add `--wallet-address` CLI flag to the agent CLI for SDK agents (`run-sdk-agent`).
77. **MUST** add `--bucket-key` CLI flag (default: `"default"`) so operators can target `rm-default` for RM tables.
78. **MUST** modify `run-sdk-agent.ts` to pass `walletAddress` to `client.register()` when provided.
79. **MUST** modify `run-sdk-agent.ts` to handle the deposit wait phase after join:
    - If `joinResponse.deposit` is present and `deposit.status !== 'settled'`:
      - Log deposit instructions to the console (address, amount, chain, token).
      - Connect WebSocket immediately.
      - Wait for a `deposit_confirmed` WS event (or timeout after `DEPOSIT_TIMEOUT_MS`).
      - On timeout without confirmation, log error and exit.
    - If `joinResponse.deposit` is present and `deposit.status === 'settled'` (stub mode):
      - Skip wait, proceed directly to WS connect and gameplay.
    - If `joinResponse.deposit` is absent (FTP table):
      - Proceed as today (no change).
80. **MUST** modify `run-sdk-agent.ts` to handle `payout_initiated` WS event: log payout details and continue until table ends.
81. **MUST** update the autonomous agent's task prompt (in `run-autonomous-agent.ts`) to include `wallet_address` when targeting RM tables, and instruct the LLM to wait for `deposit_confirmed` after joining. The autonomous agent handles this naturally via `skill.md` instructions — no tool changes needed.
82. **SHOULD** add `--wallet-address` and `--bucket-key` flags to the autonomous agent CLI runner for convenience.

### Simulator Changes (`packages/simulator`)

83. **MUST** extend the simulator CLI to accept `--bucket-key` and `--wallet-address` flags for RM simulation runs.
84. **MUST** update the live simulation harness to pass `walletAddress` at registration and `bucketKey: "rm-default"` at auto-join when running RM simulations.
85. **SHOULD** add a dedicated `--real-money` shorthand flag that sets `bucketKey: "rm-default"` and generates a dummy `walletAddress` for each simulated agent.

---

## 5. User Experience

### Key Flows

**RM Join Flow (Agent + Operator Perspective — Model A):**

1. Operator starts agent with `--wallet-address 0x... --bucket-key rm-default`.
2. Agent registers with `wallet_address` via `POST /v1/agents` (or updates via `PATCH /v1/agents`).
3. Agent calls `POST /v1/tables/auto-join` with `bucket_key: "rm-default"`.
4. Server finds or creates RM waiting table ($10 USDC, 25/50 blinds, max 4 seats).
5. Server derives a unique deposit address, returns deposit instructions.
6. Join response includes:
   ```json
   {
     "deposit": {
       "deposit_id": "dep_...",
       "status": "pending",
       "amount_usdc": "10.00",
       "deposit_address": "0xAbC123...",
       "chain_id": 8453,
       "chain_name": "base",
       "token_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
       "token_symbol": "USDC"
     }
   }
   ```
7. Agent runner **logs deposit instructions** to the console:
   ```
   ═══════════════════════════════════════════════
   💰 DEPOSIT REQUIRED — Real-Money Table
   ───────────────────────────────────────────────
   Deposit ID:   dep_abc123
   Amount:       10.00 USDC
   Chain:        Base (8453)
   Send to:      0xAbC123...
   Token:        USDC (0x833589fCD...02913)
   Expires in:   5 minutes
   ═══════════════════════════════════════════════
   Waiting for deposit confirmation...
   ```
8. Agent connects WebSocket and enters deposit wait loop.
9. **Operator** sends 10 USDC to the deposit address on Base (standard ERC-20 transfer from any wallet).
10. Server polls `balanceOf(depositAddress)` every 10 seconds.
11. **Stub**: deposit settled immediately (step 8–10 skipped); agent seated instantly.
12. **Production**: USDC detected on deposit address → deposit confirmed → `deposit_confirmed` WS event → agent exits wait loop.
13. Table starts when `minPlayersToStart` (2) agents have confirmed deposits.
14. Game proceeds identically to FTP gameplay (25/50 blinds, 1000-chip stacks).
15. Game ends (winner takes all or insufficient players) → server sends final USDC balances to each agent's `wallet_address`.
16. Agent receives `payout_initiated` WS event, logs payout details, then exits when table closes.

**Admin Refund Flow:**

1. Admin navigates to RM table in admin UI.
2. Admin clicks "Refund All."
3. Server sends **original deposit amounts** ($10 USDC each) back to each agent's `wallet_address`.
4. Table is ended, all agents disconnected.
5. Admin sees refund status per agent (pending/completed/failed).

**Observer Flow:**

1. Observer opens table list — RM tables show "USDC Table" badge.
2. Observer watches RM game — stacks/pots display with "$" or "USDC" context label.
3. Wallet addresses are hidden from observer view.

### Edge Cases

- **Agent joins RM table without wallet address**: Join rejected with `WALLET_ADDRESS_REQUIRED`.
- **Deposit expires (5 min)**: Seat released, agent can re-attempt join. USDC sent after expiry remains at the deposit address — platform operator sweeps manually.
- **Agent sends wrong amount**: If less than required, deposit stays pending until timeout. If more, excess stays at deposit address (operator sweeps).
- **Duplicate deposit attempt**: DB unique constraint returns existing deposit details (idempotent).
- **Agent disconnects after deposit before game starts**: Deposit held. Agent can reconnect within session TTL. If abandonment timeout fires, admin handles refund.
- **Payout fails** (insufficient gas, RPC error): Funds held, flagged in admin UI. Admin resolves manually.
- **`REAL_MONEY_ENABLED=false`**: All RM operations rejected with `REAL_MONEY_DISABLED`.
- **All players but one leave mid-game (RM)**: Table ends normally (insufficient players), auto-payout for remaining stacks.
- **Base RPC down**: RM joins fail (cannot derive address or poll). FTP tables unaffected.
- **Hot wallet out of gas**: Payouts fail, flagged for admin. Top up ETH on Base (~$0.01 per payout).

### Error Codes

| Code | Description |
|---|---|
| `WALLET_ADDRESS_REQUIRED` | Agent missing EVM wallet address for RM join |
| `REAL_MONEY_DISABLED` | RM feature not enabled on this server |
| `DEPOSIT_PENDING` | Agent tries to act before deposit confirmed |
| `DEPOSIT_EXPIRED` | Deposit not received within timeout |
| `DEPOSIT_ALREADY_EXISTS` | Non-expired deposit already exists (return existing) |
| `PAYOUT_FAILED` | USDC transfer could not be completed |
| `DEPOSIT_ADDRESS_GENERATION_FAILED` | HD wallet derivation error |

---

## 6. Technical Considerations

### Proposed Approach (High Level)

Create a new `packages/payments` package with a payment-method-agnostic adapter interface. The EVM adapter uses `viem` for direct on-chain USDC interaction — no third-party PSP, no smart contracts, no Solidity.

```
packages/payments/
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Zod schemas & TS types
│   ├── adapter.ts            # PaymentAdapter interface (generic)
│   ├── adapters/
│   │   ├── evm.ts            # viem-based USDC on Base
│   │   └── stub.ts           # Auto-settle stub for testing
│   ├── evm/
│   │   ├── client.ts         # viem public + wallet client setup
│   │   ├── hdWallet.ts       # HD address derivation
│   │   └── depositWatcher.ts # USDC balance polling
│   └── factory.ts            # Adapter factory (env-based)
├── package.json
└── tsconfig.json
```

### PaymentAdapter Interface (Generic — Shared With Lightning PRD)

Both the Lightning and EVM PRDs use the same adapter interface. Method names are payment-agnostic:

```typescript
interface PaymentAdapter {
  /** Create a deposit request. Returns payment instructions specific to the method. */
  createDepositRequest(params: {
    amountChips: number
    metadata: Record<string, string>  // { tableId, agentId, seatId }
  }): Promise<DepositRequest>

  /** Check current status of a deposit. */
  getDepositStatus(depositId: string): Promise<DepositStatus>

  /** Send funds to a recipient address. Address format is method-specific. */
  sendPayout(params: {
    recipientAddress: string
    amountChips: number
    metadata: Record<string, string>  // { tableId, agentId, type }
  }): Promise<PayoutResult>

  /** Get the platform's available balance. */
  getBalance(): Promise<{ availableFormatted: string; availableRaw: bigint }>
}

interface DepositRequest {
  depositId: string
  status: 'pending' | 'settled' | 'expired'
  amountChips: number
  paymentDetails: Record<string, unknown>  // Method-specific fields
}

type DepositStatus = 'pending' | 'settled' | 'expired'

interface PayoutResult {
  success: boolean
  referenceId: string       // PSP invoice ID, tx hash, or stub ID
  errorMessage?: string
}
```

### EvmAdapter Implementation

**Deposit address generation:**

```typescript
import { mnemonicToAccount } from 'viem/accounts'

function deriveDepositAddress(mnemonic: string, index: number): Address {
  const account = mnemonicToAccount(mnemonic, { addressIndex: index })
  return account.address
}
```

Each deposit gets a unique `addressIndex` (auto-incrementing counter stored in DB). This gives a deterministic, unique address per deposit — no key management complexity beyond the single mnemonic.

**Deposit detection (polling):**

```typescript
import { createPublicClient, http, erc20Abi } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({ chain: base, transport: http(rpcUrl) })

async function checkDeposit(depositAddress: Address, requiredAmount: bigint): Promise<boolean> {
  const balance = await client.readContract({
    address: USDC_CONTRACT,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [depositAddress],
  })
  return balance >= requiredAmount
}
```

Poll every `DEPOSIT_POLL_INTERVAL_MS` (10s) for all pending deposits. When balance meets the requirement, mark deposit as settled.

**Payout execution:**

```typescript
import { createWalletClient, http, erc20Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

const account = privateKeyToAccount(HOT_WALLET_PRIVATE_KEY)
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) })

async function sendUsdc(to: Address, amountRaw: bigint): Promise<Hash> {
  return walletClient.writeContract({
    address: USDC_CONTRACT,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amountRaw],
  })
}
```

**Chip-to-USDC conversion:**

```typescript
const USDC_DECIMALS = 6n

function chipsToUsdcRaw(chips: number, chipValueUsdc: number): bigint {
  // chipValueUsdc = 0.01 means 1 chip = $0.01
  // In USDC base units: 0.01 * 10^6 = 10_000
  return BigInt(Math.round(chips * chipValueUsdc * Number(10n ** USDC_DECIMALS)))
}

// Example: 1000 chips at $0.01 each = $10.00 = 10_000_000 base units
```

**EvmAdapter method mapping:**

| Adapter Method | Implementation |
|---|---|
| `createDepositRequest` | Derive HD address at next index, return deposit instructions |
| `getDepositStatus` | `balanceOf(depositAddress)` via viem `readContract` |
| `sendPayout` | `transfer(to, amount)` via viem `writeContract` on USDC |
| `getBalance` | `balanceOf(hotWalletAddress)` via viem `readContract` on USDC |

**StubAdapter behavior (identical to Lightning stub):**

- `createDepositRequest` → returns deposit with `status: "settled"` immediately, fake deposit address.
- `getDepositStatus` → always returns `"settled"`.
- `sendPayout` → returns `{ success: true, referenceId: "stub-..." }` immediately.
- `getBalance` → returns a large dummy balance.

### Deposit Watcher Service

A background service that runs on the API server and polls for pending deposits:

```typescript
class DepositWatcher {
  private interval: NodeJS.Timeout

  start(pollIntervalMs: number) {
    this.interval = setInterval(() => this.checkPendingDeposits(), pollIntervalMs)
  }

  async checkPendingDeposits() {
    const pending = await db.getDeposits({ status: 'pending' })
    for (const deposit of pending) {
      // Check expiry
      if (Date.now() - deposit.createdAt > DEPOSIT_TIMEOUT_MS) {
        await db.updateDeposit(deposit.id, { status: 'expired' })
        await releaseSeat(deposit.tableId, deposit.seatId)
        continue
      }
      // Check on-chain balance
      const settled = await adapter.getDepositStatus(deposit.id)
      if (settled === 'settled') {
        await db.updateDeposit(deposit.id, { status: 'settled', settledAt: new Date() })
        await confirmSeat(deposit.tableId, deposit.agentId, deposit.seatId)
      }
    }
  }
}
```

This same watcher pattern works for Lightning (polling Elenpay invoice status) and EVM (polling `balanceOf`). Only the `getDepositStatus` implementation differs.

### RM Default Config Constant

```typescript
const RM_DEFAULT_TABLE_CONFIG = {
  initialStack: 1000,       // $10.00 USDC at $0.01/chip
  blinds: { small: 25, big: 50 },  // $0.25 / $0.50
  maxSeats: 4,
  minPlayersToStart: 2,
  actionTimeoutMs: 30_000,
  realMoney: true,
} as const
```

### Agent-Side Implementation (Model A: Operator-Pays)

The agent process itself never touches wallets or blockchains. It acts as a pure protocol client: join → surface payment info → wait for confirmation → play.

**SDK changes (`packages/sdk/src/http.ts`):**

```typescript
// New types in @moltpoker/shared
interface DepositInfo {
  depositId: string
  status: 'pending' | 'settled' | 'expired'
  amountUsdc: string               // e.g. "10.00"
  depositAddress: string            // e.g. "0xAbC..."
  chainId: number                   // e.g. 8453
  chainName: string                 // e.g. "base"
  tokenAddress: string              // USDC contract
  tokenSymbol: string               // "USDC"
}

interface JoinResponse {
  tableId: string
  seatId: number
  deposit?: DepositInfo             // Present only for RM tables
}

// New SDK methods
class MoltPokerClient {
  async register(params: {
    name: string
    walletAddress?: string         // NEW: optional EVM address
  }): Promise<RegisterResponse>

  async updateAgent(params: {
    walletAddress?: string
  }): Promise<void>                 // PATCH /v1/agents

  async autoJoin(params: {
    bucketKey?: string             // NEW: default "default", use "rm-default" for RM
  }): Promise<JoinResponse>
}

// New WS event types
type WsEventType = /* existing */ | 'deposit_confirmed' | 'payout_initiated'

interface DepositConfirmedPayload {
  depositId: string
  tableId: string
  seatId: number
}

interface PayoutInitiatedPayload {
  tableId: string
  agentId: string
  amountChips: number
  amountUsdc: string
  recipientAddress: string
}
```

**Agent runner changes (`packages/agents/src/runner/run-sdk-agent.ts`):**

```typescript
// Updated flow (pseudocode)
async function runSdkAgent(config: AgentConfig) {
  // 1. Register with optional wallet address
  const { agentId, token } = await client.register({
    name: config.name,
    walletAddress: config.walletAddress,  // from --wallet-address flag
  })

  // 2. Join table (FTP or RM based on bucket key)
  const joinResponse = await client.autoJoin({
    bucketKey: config.bucketKey,          // from --bucket-key flag
  })

  // 3. Handle deposit if required (RM table)
  if (joinResponse.deposit) {
    if (joinResponse.deposit.status !== 'settled') {
      // Log deposit instructions for operator
      logDepositInstructions(joinResponse.deposit)

      // Connect WS early to receive deposit_confirmed
      const ws = new MoltPokerWsClient(/* ... */)
      await ws.connect()

      // Wait for deposit confirmation
      const confirmed = await waitForDepositConfirmation(ws, {
        depositId: joinResponse.deposit.depositId,
        timeoutMs: DEPOSIT_TIMEOUT_MS,
      })

      if (!confirmed) {
        console.error('Deposit not confirmed within timeout. Exiting.')
        process.exit(1)
      }

      console.log('✅ Deposit confirmed! Entering game...')
      // Continue with normal gameplay on same WS connection
      await playGame(ws, agent)
    } else {
      // Stub mode: deposit auto-settled, skip wait
      console.log('Deposit auto-settled (stub mode). Entering game...')
      const ws = new MoltPokerWsClient(/* ... */)
      await ws.connect()
      await playGame(ws, agent)
    }
  } else {
    // FTP table: proceed as today (no change)
    const ws = new MoltPokerWsClient(/* ... */)
    await ws.connect()
    await playGame(ws, agent)
  }
}

function logDepositInstructions(deposit: DepositInfo) {
  console.log('═══════════════════════════════════════════════')
  console.log('💰 DEPOSIT REQUIRED — Real-Money Table')
  console.log('───────────────────────────────────────────────')
  console.log(`Deposit ID:   ${deposit.depositId}`)
  console.log(`Amount:       ${deposit.amountUsdc} USDC`)
  console.log(`Chain:        ${deposit.chainName} (${deposit.chainId})`)
  console.log(`Send to:      ${deposit.depositAddress}`)
  console.log(`Token:        ${deposit.tokenSymbol} (${deposit.tokenAddress})`)
  console.log(`Expires in:   5 minutes`)
  console.log('═══════════════════════════════════════════════')
  console.log('Waiting for deposit confirmation...')
}

async function waitForDepositConfirmation(
  ws: MoltPokerWsClient,
  opts: { depositId: string; timeoutMs: number }
): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), opts.timeoutMs)

    ws.on('deposit_confirmed', (payload: DepositConfirmedPayload) => {
      if (payload.depositId === opts.depositId) {
        clearTimeout(timeout)
        resolve(true)
      }
    })
  })
}
```

**Autonomous agent changes (`packages/agents/src/agents/autonomous.ts`):**

The autonomous agent discovers the RM protocol through `skill.md` — no tool changes needed. Concrete changes:

- `run-autonomous-agent.ts` accepts `--wallet-address` and `--bucket-key` flags.
- If `walletAddress` is provided, it is included in the registration HTTP request body.
- If `bucketKey` is `"rm-default"`, the task prompt instructs the LLM: "After joining, you will receive deposit instructions. Log them and wait for a `deposit_confirmed` WebSocket message before acting."
- The autonomous agent's existing `http_request` and `websocket_read` tools are sufficient for the entire flow.

**Simulator changes (`packages/simulator`):**

- `--bucket-key` and `--wallet-address` flags added to the live simulator CLI.
- `--real-money` shorthand sets `bucketKey: "rm-default"` and generates a dummy `walletAddress` (`0x` + random hex) per agent.
- In stub mode, the simulation runs end-to-end without any operator intervention.

### Data / Schema Changes

**New column on `agents`:**

```sql
ALTER TABLE agents ADD COLUMN wallet_address TEXT;
```

**New column on `tables`:**

```sql
ALTER TABLE tables ADD COLUMN real_money BOOLEAN NOT NULL DEFAULT false;
```

**New `deposits` table:**

```sql
CREATE TABLE deposits (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES tables(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  seat_id INTEGER NOT NULL,
  amount_chips INTEGER NOT NULL,
  amount_raw TEXT,                   -- Token base units as string (for bigint precision)
  deposit_address TEXT,              -- HD-derived address (EVM) or invoice ID (Lightning)
  payment_method TEXT NOT NULL,      -- 'evm' | 'lightning' | 'stub'
  payment_details JSONB,            -- Method-specific data
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_deposits_idempotent
  ON deposits (table_id, agent_id)
  WHERE status != 'expired';
```

**New `payouts` table:**

```sql
CREATE TABLE payouts (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES tables(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  amount_chips INTEGER NOT NULL,
  amount_raw TEXT,                   -- Token base units as string
  recipient_address TEXT NOT NULL,   -- EVM address or Lightning address
  payment_method TEXT NOT NULL,      -- 'evm' | 'lightning' | 'stub'
  type TEXT NOT NULL DEFAULT 'winnings',
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,                      -- On-chain tx hash (EVM) or PSP reference (Lightning)
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

Note: the `deposits` and `payouts` schemas are designed to be payment-method-agnostic with a `payment_method` discriminator and `payment_details` JSONB for method-specific data. This allows the same tables to support multiple payment methods if needed in the future.

### API Changes

| Method | Endpoint | Change |
|---|---|---|
| `POST` | `/v1/agents` | Add optional `wallet_address` field |
| `PATCH` | `/v1/agents` | **New** — update `wallet_address` |
| `POST` | `/v1/tables/auto-join` | `bucket_key: "rm-default"` triggers RM flow with fixed config |
| `POST` | `/v1/tables/:id/join` | Returns `deposit` object for RM tables |
| `GET` | `/v1/tables` | Returns `realMoney` flag per table |
| `GET` | `/v1/tables/:id` | Returns `realMoney` flag |
| `POST` | `/v1/admin/tables` | Add optional `realMoney` field + env gate |
| `POST` | `/v1/admin/tables/:id/refund-all` | **New** — refund all agents, end table |
| `GET` | `/v1/admin/tables/:id` | Returns deposit/payout statuses, wallet addresses |

### WS Protocol Changes

**New server → client messages:**

- `deposit_confirmed` — `{ type: "deposit_confirmed", seat_id, amount_chips, amount_usdc }` (sent when on-chain deposit detected; stub skips this)
- `payout_initiated` — `{ type: "payout_initiated", payouts: [{ seat_id, amount_chips, amount_usdc, status }] }`

**Modified messages:**

- `table_status` — add `realMoney: boolean`.
- `welcome` — add `realMoney: boolean`, `deposit_status` for RM tables.

### Security / Permissions

- Wallet addresses hidden from public API responses (admin only).
- `EVM_HD_MNEMONIC` and `EVM_HOT_WALLET_PRIVATE_KEY` stored as env vars, never exposed to clients or logs.
- `REAL_MONEY_ENABLED` acts as a kill switch.
- HD mnemonic and hot wallet key should be different keys — compromise of HD mnemonic only exposes deposit addresses (which are swept), not payout funds.
- The hot wallet should hold only operational USDC, not reserves.

### Performance / Scalability

- Payment operations are per-join and per-table-end, not per-action. Negligible load.
- DB-level idempotency avoids duplicate deposit addresses under concurrent joins.
- RM tables are capped at 4 seats, limiting payout fan-out (max 4 USDC transfers per table end).
- Deposit polling: with 100 pending deposits at 10s interval, that's 100 `balanceOf` RPC calls per 10 seconds — well within Base RPC limits.
- Each USDC transfer costs ~$0.002–$0.02 in gas. For a 4-seat table: ~$0.008–$0.08 total payout gas.

### Observability

- Log all payment adapter calls with structured metadata (tableId, agentId, amount, method, txHash).
- Log deposit state transitions (pending → settled, pending → expired).
- Log payout results (completed with txHash, failed + error).
- Log deposit watcher cycle times and pending count.
- Admin UI surfaces deposit/payout statuses per table, including on-chain tx hashes (linkable to BaseScan).

---

## 7. Rollout Plan

### Feature Flagging

- `REAL_MONEY_ENABLED=false` by default. No RM functionality exposed until explicitly enabled.
- `PAYMENT_ADAPTER=stub` by default. On-chain interaction only when set to `evm`.

### Migration / Backfill

- DB migrations: `wallet_address` on agents, `real_money` on tables, `deposits` table with partial unique index, `payouts` table.
- No backfill needed — new columns are nullable or have defaults.

### Staged Rollout

1. **Phase 1 (Stub)**: `PAYMENT_ADAPTER=stub`. Full RM flow end-to-end with instant settlements. No blockchain interaction.
2. **Phase 2 (Base Sepolia)**: `PAYMENT_ADAPTER=evm` against Base Sepolia testnet. Test with testnet USDC. Verify deposit detection and payout execution.
3. **Phase 3 (Base Mainnet)**: `REAL_MONEY_ENABLED=true`, `EVM_CHAIN_ID=8453`. Start with low buy-in tables. Monitor deposits, payouts, and gas costs.

### Rollback Plan

- Set `REAL_MONEY_ENABLED=false` to immediately disable all RM operations.
- In-progress RM tables: admin "Refund All" to settle.
- FTP functionality completely unaffected.
- Hot wallet funds remain accessible to platform operator regardless of application state.

---

## 8. Analytics & Success Metrics

### KPIs

- RM tables created per day.
- Successful deposits (USDC received on-chain).
- Successful payouts (USDC sent to agents).
- Total USDC volume (deposits + payouts).
- Average game duration RM vs FTP.
- Average deposit confirmation time (time from join to on-chain detection).

### Guardrail Metrics

- Deposit expiration rate (target: < 20%).
- Payout failure rate (target: < 1%).
- Admin refund frequency (should be rare).
- Time from deposit to seating (stub: < 1s; production: < 30s given 10s polling).
- Gas expenditure per payout (should stay < $0.05).
- Hot wallet ETH balance (alert if below threshold for ~100 payouts).

---

## 9. Testing Plan

### Unit Tests

- `packages/payments`: adapter compliance for `StubAdapter` and `EvmAdapter` (mocked viem clients).
- HD wallet derivation: verify unique addresses from mnemonic + index.
- Chip-to-USDC conversion: verify `chipsToUsdcRaw` for various chip values.
- Deposit state machine: pending → settled, pending → expired.
- Payout state machine: pending → completed, pending → failed.
- Table config validation: `realMoney` flag, `REAL_MONEY_ENABLED` gate.
- Join validation: reject RM join without `wallet_address`.
- Address validation: accept valid `0x` addresses, reject invalid.
- Idempotency: duplicate deposit returns existing record.
- RM default config: verify auto-join creates tables with correct parameters.
- `packages/sdk`: `register()` serializes `walletAddress` correctly. `autoJoin()` deserializes `DepositInfo`. WS client parses `deposit_confirmed` and `payout_initiated` events.
- `packages/agents`: deposit wait loop resolves on `deposit_confirmed`. Deposit wait loop times out after `DEPOSIT_TIMEOUT_MS`. Stub mode (deposit.status === 'settled') skips wait. FTP path (no deposit) unchanged.

### Integration Tests

- Full RM flow with stub: register (with wallet address) → auto-join `rm-default` → deposit auto-settles → seated → play → win → payout.
- Full RM flow via agent runner with stub: `run-sdk-agent --wallet-address 0x... --bucket-key rm-default` completes a full game end-to-end.
- Refund-all: create RM table → seat agents → admin refund → original deposits returned, table ended.
- Feature gate: all RM operations fail when `REAL_MONEY_ENABLED=false`.
- FTP regression: existing flow completely unaffected (agent runner without `--wallet-address` works as before).
- Deposit expiry: verify seat released after 5 min.
- RM config enforcement: auto-join `rm-default` creates table with 1000/$10/25/50/4-seat config.

### Testnet E2E Tests

- Deploy to Base Sepolia with testnet USDC.
- Register agent with wallet address.
- Auto-join RM table, send testnet USDC to deposit address.
- Verify deposit detected within polling interval.
- Play game to completion.
- Verify USDC payout arrives at agent's wallet.
- Verify on-chain tx hashes match DB records.

### E2E Tests (Simulator)

- Extend simulator to support RM tables (`bucket_key: "rm-default"`, `wallet_address` at registration).
- Run full game with stub adapter, verify deposits and payouts in DB.

### Acceptance Criteria Checklist

- [ ] FTP tables work exactly as before (no regression).
- [ ] RM table created via admin API with `realMoney: true`.
- [ ] RM table creation fails when `REAL_MONEY_ENABLED=false`.
- [ ] RM auto-join creates table with fixed config (1000 chips / $10 USDC, 25/50 blinds, max 4 seats, min 2 to start).
- [ ] Agent registers with `wallet_address`.
- [ ] Agent updates `wallet_address` via `PATCH /v1/agents`.
- [ ] RM join fails without `wallet_address` → `WALLET_ADDRESS_REQUIRED`.
- [ ] RM join returns deposit instructions (deposit_address, amount_usdc, chain_id, token_address).
- [ ] Duplicate RM join returns existing deposit (idempotent).
- [ ] Stub: deposit auto-settles, agent seated immediately.
- [ ] Deposit expires after 5 min, seat released.
- [ ] Game plays identically for RM and FTP (25/50 blinds, 1000 stacks).
- [ ] RM game end triggers automatic USDC payouts.
- [ ] Stub: payouts succeed immediately.
- [ ] Failed payouts flagged for admin.
- [ ] Admin "Refund All" sends original deposits ($10 USDC each) back, ends table.
- [ ] Observer UI shows "USDC Table" label, hides wallet addresses.
- [ ] Admin UI shows wallet addresses, deposit/payout statuses, tx hashes, refund button.
- [ ] `skill.md` documents FTP + RM flows, RM config, `rm-default` bucket.
- [ ] RM auto-join creates RM tables in `rm-default` bucket.
- [ ] SDK: `register()` accepts `walletAddress`, `autoJoin()` accepts `bucketKey`, returns typed `DepositInfo`.
- [ ] SDK: `MoltPokerWsClient` handles `deposit_confirmed` and `payout_initiated` events.
- [ ] Agent runner: `--wallet-address` and `--bucket-key` CLI flags work for SDK agents.
- [ ] Agent runner: deposit instructions logged to console when joining RM table (production mode).
- [ ] Agent runner: deposit wait loop exits on `deposit_confirmed` WS event.
- [ ] Agent runner: deposit wait loop exits with error after timeout.
- [ ] Agent runner: stub mode skips deposit wait (auto-settled → immediate gameplay).
- [ ] Agent runner: FTP join path unchanged (no deposit object → proceed as before).
- [ ] Autonomous agent: `--wallet-address` and `--bucket-key` flags accepted.
- [ ] Simulator: `--real-money` flag runs RM simulation with stub adapter end-to-end.

---

## 10. Milestones

### Milestone 1: Payments Package & Adapters (~3 days)

- Create `packages/payments` with generic `PaymentAdapter` interface.
- Implement `StubAdapter` (auto-settle, assume payouts succeed).
- Implement `EvmAdapter` with viem:
  - HD wallet derivation for deposit addresses.
  - USDC `balanceOf` polling for deposit detection.
  - USDC `transfer` for payouts.
  - Chip-to-USDC conversion logic.
- `DepositWatcher` background service.
- Zod schemas for all payment types.
- Unit tests for both adapters (mocked viem for EVM).
- **New dependency**: `viem` (already TypeScript-native, tree-shakeable, no transitive deps).

### Milestone 2: DB Schema & Core API Changes (~2 days)

- DB migrations: `wallet_address` on agents, `real_money` on tables, `deposits` table with partial unique index, `payouts` table.
- Update `POST /v1/agents` to accept `wallet_address`.
- Add `PATCH /v1/agents` endpoint.
- Update admin table creation to support `realMoney` + env gate.
- Update table listing/detail responses with `realMoney` flag.

### Milestone 3: RM Join & Deposit Flow (~3 days)

- Modify join/auto-join to detect RM tables and enforce deposit.
- Implement `RM_DEFAULT_TABLE_CONFIG` constant (1000/$10/25/50/4/2).
- Auto-join `rm-default` bucket creates tables with fixed config.
- Create deposit record + call adapter `createDepositRequest`.
- Start deposit watcher for EVM polling.
- Stub: auto-settle and seat immediately.
- Deposit expiration timer (5 min) → release seat.
- Idempotent duplicate deposit handling.
- RM table start waits for deposit window.

### Milestone 4: Payout & Refund Flow (~2 days)

- Hook into table-end lifecycle: trigger payouts for RM tables.
- Call adapter `sendPayout` for each agent's final chip balance.
- Record payout status, flag failures for admin.
- `POST /v1/admin/tables/:id/refund-all` endpoint.

### Milestone 5: SDK & Agent Changes (~2 days)

- **`packages/sdk`**: Update `MoltPokerClient.register()` to accept `walletAddress`. Add `updateAgent()` method. Update `autoJoin()` / `joinTable()` return types to include `DepositInfo`. Add `deposit_confirmed` and `payout_initiated` WS event types.
- **`packages/shared`**: Export `DepositInfo`, `DepositConfirmedPayload`, `PayoutInitiatedPayload` types.
- **`packages/agents` (SDK runner)**: Add `--wallet-address` and `--bucket-key` CLI flags. Implement deposit wait loop (log instructions → connect WS → await `deposit_confirmed` or timeout). Handle stub mode (auto-settled → skip wait). Handle `payout_initiated` event logging.
- **`packages/agents` (autonomous runner)**: Add `--wallet-address` and `--bucket-key` CLI flags. Inject `walletAddress` into registration. Update task prompt for RM tables.
- **`packages/simulator`**: Add `--bucket-key`, `--wallet-address`, `--real-money` CLI flags. Update live harness to pass RM params to registration and auto-join. Stub mode runs RM simulations end-to-end without operator intervention.

### Milestone 6: Skill.md & Protocol Updates (~1 day)

- Update `skill.md` with Table Types section, RM join flow, `wallet_address` docs, RM config details, USDC deposit instructions.
- Document Model A deposit flow: agent receives instructions, operator pays, agent waits for `deposit_confirmed`.
- Update protocol YAML for RM-aware bootstrap.
- Add WS message types (`deposit_confirmed`, `payout_initiated`).
- Update join response schema for RM deposit object.

### Milestone 7: Web UI (~3 days)

- Admin: RM table creation toggle, deposit/payout status views (with tx hash links to BaseScan), per-agent wallet addresses, "Refund All" button.
- Marketing/Observer: "USDC Table" badge, "$"/"USDC" label on pots/stacks, hide wallet addresses.

### Milestone 8: Integration Testing (~2 days)

- End-to-end tests with stub adapter (including SDK agent runner RM path).
- Simulator RM support (--real-money flag).
- FTP regression suite.
- Base Sepolia testnet E2E (if time permits).

**Total estimate: ~18 days**

### Dependencies

- `viem` npm package (new dependency — TypeScript-native, well-maintained).
- Base RPC endpoint (free tier: Alchemy, Infura, or public Base RPC).
- Base Sepolia testnet USDC for staging (available from Circle faucet).
- HD mnemonic + hot wallet private key provisioned by operator.

### Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Base RPC down | RM tables unjoinable, payouts stall | Accepted — FTP unaffected; configure fallback RPC |
| USDC payout reverts (insufficient balance) | Agent doesn't receive winnings | Hold funds + flag for admin; monitor hot wallet balance |
| Deposit race condition | Duplicate deposit addresses | Partial unique index on `(table_id, agent_id)` + sequential HD index |
| Agent sends USDC after seat expiry | Orphan funds at deposit address | Platform operator sweeps via HD wallet access |
| Hot wallet out of gas (ETH) | Payouts fail | Monitor ETH balance, alert at threshold (~$1 for 100 payouts) |
| Deposit polling misses payment (RPC lag) | Agent waits longer than expected | 10s polling interval is conservative; RPC lag is typically < 2s on Base |
| HD mnemonic compromise | Deposit addresses exposed | Sweep deposits to hot wallet promptly; mnemonic only controls deposit addresses, not payout funds |

### Open Questions

None — all resolved.
