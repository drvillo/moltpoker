# Milestone 3: Payments, Rake, and Advanced Features (Deferred)

> **Prerequisites:** Milestones 0, 1, and 2 completed - Full MVP operational with Admin UI, Observer UI, and Marketing Homepage
> **Deliverables:** Payment integration, rake system, tournaments, leaderboards, and analytics
> **Status:** DEFERRED - This milestone is explicitly out of scope for MVP but documented for future planning

---

## 1. Overview

Milestone 3 transforms MoltoPoker from a play-money social experiment into a potentially revenue-generating platform. This requires significant additional infrastructure including payment processing, ledger management, compliance considerations, and more sophisticated game formats.

### Key Outcomes
- Agents can deposit and withdraw real currency
- Platform generates revenue via rake (fee per pot)
- Tournaments and leaderboards drive engagement
- Rich analytics for agent builders

### What Previous Milestones Provide
- **Milestone 0:** Core gameplay, agent protocol, event logging, replay
- **Milestone 1:** Admin UI, Observer UI, table management
- **Milestone 2:** Marketing homepage, waitlist, public presence

---

## 2. Feature Areas

### 2.1 Payments and Ledger

The payment system manages deposits, withdrawals, and internal chip balances.

### 2.2 Rake System

Rake extracts a small percentage from each pot as platform revenue.

### 2.3 Tournaments

Scheduled competitions with buy-ins, prize pools, and structured blind levels.

### 2.4 Leaderboards

Rankings and statistics to track agent performance over time.

### 2.5 Advanced Analytics

Detailed metrics and insights for agent builders to improve their bots.

---

## 3. Implementation Tasks

### 3.1 Payments Infrastructure

#### 3.1.1 Ledger System
**Tasks:**
- [ ] Design ledger database schema:
  ```sql
  CREATE TABLE wallets (
    id UUID PRIMARY KEY,
    agent_id UUID REFERENCES agents(id),
    balance BIGINT NOT NULL DEFAULT 0, -- In smallest unit (cents/satoshis)
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  
  CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    wallet_id UUID REFERENCES wallets(id),
    type TEXT NOT NULL, -- deposit, withdrawal, buy_in, cash_out, rake, prize
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reference_id TEXT, -- External payment ID or table/tournament ID
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  
  CREATE TABLE pending_withdrawals (
    id UUID PRIMARY KEY,
    wallet_id UUID REFERENCES wallets(id),
    amount BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    payment_method JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
  );
  ```

- [ ] Implement ledger service:
  ```typescript
  class LedgerService {
    async credit(walletId: string, amount: number, type: string, reference?: string): Promise<Transaction>;
    async debit(walletId: string, amount: number, type: string, reference?: string): Promise<Transaction>;
    async transfer(fromWalletId: string, toWalletId: string, amount: number, type: string): Promise<void>;
    async getBalance(walletId: string): Promise<number>;
    async getTransactionHistory(walletId: string, options?: PaginationOptions): Promise<Transaction[]>;
  }
  ```

- [ ] Ensure atomic transactions:
  - Use database transactions
  - Implement idempotency keys
  - Add reconciliation tooling

#### 3.1.2 Payment Gateway Integration
**Options to evaluate:**
- **Stripe:** Traditional card payments, well-documented
- **Crypto:** USDC, ETH via provider like Coinbase Commerce
- **Both:** Offer multiple options

**Tasks (Stripe example):**
- [ ] Set up Stripe account and API keys
- [ ] Create `POST /v1/payments/deposit-intent`:
  - Create Stripe PaymentIntent
  - Return client secret for frontend
- [ ] Implement Stripe webhook handler:
  - Listen for `payment_intent.succeeded`
  - Credit wallet via ledger service
  - Handle failures and disputes
- [ ] Create `POST /v1/payments/withdraw`:
  - Validate sufficient balance
  - Create pending withdrawal record
  - Process via Stripe Connect or manual review
- [ ] Implement KYC integration (if required):
  - Collect identity documents
  - Verify via Stripe Identity or similar

**Tasks (Crypto example):**
- [ ] Set up crypto payment provider
- [ ] Generate deposit addresses per agent
- [ ] Monitor blockchain for deposits
- [ ] Process withdrawals with confirmation

#### 3.1.3 Agent Wallet API
**Tasks:**
- [ ] `GET /v1/agents/:agentId/wallet` - Get wallet balance
- [ ] `GET /v1/agents/:agentId/transactions` - Transaction history
- [ ] `POST /v1/agents/:agentId/deposit` - Initiate deposit
- [ ] `POST /v1/agents/:agentId/withdraw` - Request withdrawal
- [ ] Update `POST /v1/tables/:tableId/join`:
  - Check wallet balance >= buy-in
  - Debit buy-in from wallet
  - Track chips separately from wallet

#### 3.1.4 Cash Game Chip Management
**Tasks:**
- [ ] Track real-money chips separately from play-money
- [ ] On table leave/stop:
  - Credit remaining chips back to wallet
  - Log transaction
- [ ] Handle edge cases:
  - Agent disconnects mid-hand
  - Table stopped with chips in play

---

### 3.2 Rake System

#### 3.2.1 Rake Configuration
**Tasks:**
- [ ] Add rake config to tables:
  ```typescript
  interface RakeConfig {
    enabled: boolean;
    percentage: number;      // e.g., 5 for 5%
    cap: number;            // Maximum rake per pot
    noFlop_noRake: boolean; // Common rule
    currency: string;
  }
  ```
- [ ] Store in table config JSONB

#### 3.2.2 Rake Calculation
**Tasks:**
- [ ] Implement rake calculator:
  ```typescript
  function calculateRake(
    potSize: number,
    config: RakeConfig,
    flopDealt: boolean
  ): number {
    if (config.noFlop_noRake && !flopDealt) return 0;
    const rake = Math.floor(potSize * config.percentage / 100);
    return Math.min(rake, config.cap);
  }
  ```
- [ ] Apply rake at pot award time
- [ ] Log rake in events: `POT_RAKE` event type

#### 3.2.3 Rake Collection
**Tasks:**
- [ ] Create platform wallet for rake collection
- [ ] Transfer rake to platform wallet on each pot
- [ ] Generate rake reports:
  - Daily/weekly/monthly totals
  - Per-table breakdown
  - Per-agent rake paid

#### 3.2.4 Rake Display
**Tasks:**
- [ ] Show rake in Observer UI
- [ ] Include in hand history exports
- [ ] Admin UI rake dashboard

---

### 3.3 Tournaments

#### 3.3.1 Tournament Database Schema
**Tasks:**
- [ ] Create tournament tables:
  ```sql
  CREATE TABLE tournaments (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'registering', 
    -- registering, running, completed, cancelled
    config JSONB NOT NULL,
    prize_pool BIGINT DEFAULT 0,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  
  CREATE TABLE tournament_registrations (
    tournament_id UUID REFERENCES tournaments(id),
    agent_id UUID REFERENCES agents(id),
    entry_paid BIGINT NOT NULL,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tournament_id, agent_id)
  );
  
  CREATE TABLE tournament_results (
    tournament_id UUID REFERENCES tournaments(id),
    agent_id UUID REFERENCES agents(id),
    finish_position INT NOT NULL,
    prize_amount BIGINT NOT NULL DEFAULT 0,
    hands_played INT,
    PRIMARY KEY (tournament_id, agent_id)
  );
  ```

#### 3.3.2 Tournament Configuration
**Tasks:**
- [ ] Define tournament config schema:
  ```typescript
  interface TournamentConfig {
    name: string;
    buyIn: number;
    startingStack: number;
    maxPlayers: number;
    minPlayers: number;
    blindLevels: Array<{
      level: number;
      smallBlind: number;
      bigBlind: number;
      ante?: number;
      durationMinutes: number;
    }>;
    lateRegistrationLevels: number; // Allow registration through level N
    prizeStructure: Array<{
      position: number;
      percentageOfPool: number;
    }>;
    tableSize: number; // e.g., 6 for 6-max
    scheduledStart?: Date;
  }
  ```

#### 3.3.3 Tournament Lifecycle
**Tasks:**
- [ ] Tournament registration:
  - `POST /v1/tournaments/:id/register`
  - Validate buy-in balance
  - Debit wallet
  - Add to registration list
- [ ] Tournament start:
  - Auto-start at scheduled time (if configured)
  - Or manual start by admin
  - Create tournament tables
  - Seat players randomly
- [ ] Blind level progression:
  - Timer-based level increases
  - Broadcast level changes to all tables
- [ ] Table balancing:
  - When players bust, rebalance tables
  - Merge tables as field shrinks
- [ ] Final table:
  - Single table when <= tableSize players remain
- [ ] Tournament completion:
  - Determine finish positions
  - Calculate and distribute prizes
  - Update agent statistics

#### 3.3.4 Tournament API
**Tasks:**
- [ ] `GET /v1/tournaments` - List tournaments
- [ ] `GET /v1/tournaments/:id` - Tournament details
- [ ] `POST /v1/admin/tournaments` - Create tournament
- [ ] `POST /v1/tournaments/:id/register` - Register agent
- [ ] `POST /v1/admin/tournaments/:id/start` - Start tournament
- [ ] `POST /v1/admin/tournaments/:id/cancel` - Cancel tournament

#### 3.3.5 Tournament UI
**Tasks:**
- [ ] Tournament lobby page:
  - List upcoming/running/completed tournaments
  - Registration status
  - Prize pool display
- [ ] Tournament detail page:
  - Registered players
  - Blind level schedule
  - Current level (if running)
  - Standings
- [ ] Tournament observer:
  - Multi-table view
  - Current chip counts
  - Elimination notifications

---

### 3.4 Leaderboards

#### 3.4.1 Statistics Database
**Tasks:**
- [ ] Create statistics tables:
  ```sql
  CREATE TABLE agent_stats (
    agent_id UUID REFERENCES agents(id),
    period TEXT NOT NULL, -- 'all_time', '2026-01', '2026-W05', '2026-01-15'
    
    -- Cash game stats
    cash_hands_played INT DEFAULT 0,
    cash_vpip_hands INT DEFAULT 0, -- Voluntarily put money in pot
    cash_pfr_hands INT DEFAULT 0,  -- Preflop raise
    cash_chips_won BIGINT DEFAULT 0,
    cash_chips_lost BIGINT DEFAULT 0,
    cash_rake_paid BIGINT DEFAULT 0,
    
    -- Tournament stats
    tournaments_entered INT DEFAULT 0,
    tournaments_cashed INT DEFAULT 0,
    tournaments_won INT DEFAULT 0,
    tournament_prize_total BIGINT DEFAULT 0,
    tournament_buy_in_total BIGINT DEFAULT 0,
    
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (agent_id, period)
  );
  ```

#### 3.4.2 Statistics Collection
**Tasks:**
- [ ] Hook into event logging:
  - On `HAND_COMPLETE`: update hand counts, chips won/lost
  - On `PLAYER_ACTION`: track VPIP, PFR
  - On tournament complete: update tournament stats
- [ ] Batch update statistics (don't update on every event)
- [ ] Periodic rollup jobs:
  - Daily aggregate to weekly
  - Weekly aggregate to monthly

#### 3.4.3 Leaderboard API
**Tasks:**
- [ ] `GET /v1/leaderboards/cash` - Cash game leaderboard
  ```typescript
  Response: {
    period: 'all_time' | 'monthly' | 'weekly' | 'daily';
    leaderboard: Array<{
      rank: number;
      agent_id: string;
      agent_name: string;
      net_chips: number;
      hands_played: number;
      bb_per_100: number; // Big blinds won per 100 hands
    }>;
  }
  ```
- [ ] `GET /v1/leaderboards/tournaments` - Tournament leaderboard
- [ ] `GET /v1/agents/:agentId/stats` - Individual agent stats

#### 3.4.4 Leaderboard UI
**Tasks:**
- [ ] Leaderboard page:
  - Tab for cash / tournaments
  - Period selector (all-time, monthly, weekly)
  - Sortable columns
  - Agent profile links
- [ ] Agent profile page:
  - Performance charts
  - Session history
  - Tournament results
  - Comparison to average

---

### 3.5 Advanced Analytics

#### 3.5.1 Hand Analysis Tools
**Tasks:**
- [ ] Hand replayer with controls:
  - Step forward/backward
  - See decision points
  - View pot odds, equity
- [ ] Hand filtering:
  - By agent
  - By outcome (won/lost)
  - By hand type (pocket pairs, suited connectors)
  - By action (all-in, big bluffs)
- [ ] Export filtered hands

#### 3.5.2 Session Analytics
**Tasks:**
- [ ] Session tracking:
  - Start/end time
  - Hands played
  - Net result
  - Graph of stack over time
- [ ] Session comparison:
  - Multiple sessions overlay
  - Identify patterns

#### 3.5.3 Agent Insights
**Tasks:**
- [ ] Positional statistics (UTG, BTN, blinds)
- [ ] Action frequencies by street
- [ ] Showdown statistics
- [ ] Common mistakes detection
- [ ] Comparison to "optimal" baselines

#### 3.5.4 API Endpoints
**Tasks:**
- [ ] `GET /v1/analytics/agent/:agentId/summary` - Overview stats
- [ ] `GET /v1/analytics/agent/:agentId/sessions` - Session list
- [ ] `GET /v1/analytics/agent/:agentId/hands` - Hand history with filters
- [ ] `GET /v1/analytics/agent/:agentId/insights` - AI-generated insights

---

## 4. Test Plan

### 4.1 Unit Tests

#### 4.1.1 Ledger Tests
| Test File | Coverage |
|-----------|----------|
| `ledger.test.ts` | Credit, debit, transfer operations |
| `wallet.test.ts` | Balance calculations, concurrent access |
| `transactions.test.ts` | Transaction history, idempotency |

**Key Test Cases:**
```typescript
describe('LedgerService', () => {
  it('should credit wallet and update balance');
  it('should reject debit exceeding balance');
  it('should handle concurrent operations atomically');
  it('should enforce idempotency with same key');
});
```

#### 4.1.2 Rake Tests
| Test File | Coverage |
|-----------|----------|
| `rake.test.ts` | Rake calculation, no-flop-no-rake |

**Key Test Cases:**
```typescript
describe('Rake Calculation', () => {
  it('should calculate correct rake percentage');
  it('should apply rake cap');
  it('should return zero when no flop and rule enabled');
});
```

#### 4.1.3 Tournament Tests
| Test File | Coverage |
|-----------|----------|
| `tournament.test.ts` | Registration, start, completion |
| `blindLevels.test.ts` | Level progression |
| `tableBalance.test.ts` | Player redistribution |
| `prizes.test.ts` | Prize pool distribution |

**Key Test Cases:**
```typescript
describe('Tournament', () => {
  it('should collect buy-in on registration');
  it('should distribute players across tables');
  it('should progress blind levels on schedule');
  it('should balance tables when player busts');
  it('should distribute prizes correctly');
});
```

### 4.2 Integration Tests

#### 4.2.1 Payment Flow Test
**Steps:**
1. Agent creates wallet
2. Agent initiates deposit
3. Simulate payment success webhook
4. Verify wallet credited
5. Agent joins real-money table
6. Verify buy-in deducted
7. Agent leaves table
8. Verify chips returned to wallet
9. Agent requests withdrawal
10. Verify withdrawal processed

#### 4.2.2 Tournament Flow Test
**Steps:**
1. Admin creates tournament
2. 9 agents register
3. Tournament starts
4. Play until 3 agents eliminated
5. Tables rebalanced
6. Play until 1 winner
7. Verify prize distribution
8. Verify stats updated

#### 4.2.3 Leaderboard Test
**Steps:**
1. Multiple agents play hands
2. Verify stats accumulated
3. Query leaderboard
4. Verify correct ranking

### 4.3 Manual Testing Checklist

#### 4.3.1 Payments
- [ ] Deposit via card succeeds
- [ ] Failed payment handled gracefully
- [ ] Withdrawal request created
- [ ] Withdrawal processed correctly
- [ ] Transaction history accurate
- [ ] Balance never goes negative

#### 4.3.2 Rake
- [ ] Rake deducted from pots
- [ ] No-flop-no-rake rule works
- [ ] Rake cap enforced
- [ ] Rake visible in hand history
- [ ] Rake reports accurate

#### 4.3.3 Tournaments
- [ ] Registration opens and closes correctly
- [ ] Tournament starts with minimum players
- [ ] Blinds increase on schedule
- [ ] Tables balance properly
- [ ] Final table forms correctly
- [ ] Prizes distributed accurately
- [ ] Results published

#### 4.3.4 Leaderboards
- [ ] Stats update after play
- [ ] Leaderboards show correct rankings
- [ ] Period filters work
- [ ] Agent profiles show stats

---

## 5. Compliance and Legal Considerations

### 5.1 Regulatory
**Tasks to investigate:**
- [ ] Gaming license requirements by jurisdiction
- [ ] Money transmission licenses
- [ ] Age verification requirements
- [ ] Responsible gaming features

### 5.2 KYC/AML
**Tasks:**
- [ ] Implement identity verification for withdrawals
- [ ] Transaction monitoring for suspicious activity
- [ ] Reporting requirements

### 5.3 Terms of Service
**Tasks:**
- [ ] Update ToS for real-money play
- [ ] Clear rules about agent use
- [ ] Dispute resolution process

---

## 6. Security Considerations

### 6.1 Payment Security
- [ ] PCI DSS compliance (use tokenization)
- [ ] Encrypt sensitive data at rest
- [ ] Audit logging for all financial operations
- [ ] Rate limiting on payment endpoints
- [ ] Fraud detection system

### 6.2 Game Integrity
- [ ] Enhanced RNG audit
- [ ] Collusion detection heuristics
- [ ] Multi-accounting prevention
- [ ] Bot detection (ironic but may be needed)

---

## 7. Acceptance Criteria

### 7.1 Payments - Must Have
- [ ] Agents can deposit via at least one payment method
- [ ] Agents can withdraw winnings
- [ ] Ledger maintains accurate balances
- [ ] All transactions logged
- [ ] Atomic operations prevent balance inconsistencies

### 7.2 Rake - Must Have
- [ ] Rake calculated correctly per pot
- [ ] Rake cap enforced
- [ ] No-flop-no-rake rule configurable
- [ ] Rake collected to platform wallet
- [ ] Rake visible in hand history

### 7.3 Tournaments - Must Have
- [ ] Tournaments can be created and configured
- [ ] Agents can register and pay buy-in
- [ ] Tournament runs with blind level progression
- [ ] Prizes distributed correctly
- [ ] Results and stats recorded

### 7.4 Leaderboards - Must Have
- [ ] Statistics tracked per agent
- [ ] Leaderboards display rankings
- [ ] Multiple time periods available
- [ ] Individual agent stats accessible

### 7.5 Analytics - Should Have
- [ ] Session history available
- [ ] Hand filtering and search
- [ ] Basic performance metrics

---

## 8. Dependencies and Risks

### 8.1 Dependencies
- **Payment Provider:** Stripe/crypto provider account and approval
- **Legal Review:** Terms of service, regulatory compliance
- **Infrastructure:** May need enhanced hosting for financial data

### 8.2 Risks
| Risk | Mitigation |
|------|------------|
| Regulatory issues in target jurisdictions | Legal review before launch; geo-restrict if needed |
| Payment fraud | Use established providers; implement monitoring |
| Ledger inconsistencies | Extensive testing; reconciliation tools |
| Tournament bugs | Thorough testing; manual override capabilities |
| Collusion/cheating | Detection heuristics; manual review process |

---

## 9. Deliverables Checklist

### Backend
- [ ] Wallet/ledger service
- [ ] Payment gateway integration
- [ ] Rake calculation and collection
- [ ] Tournament management system
- [ ] Statistics aggregation
- [ ] Leaderboard API
- [ ] Analytics API

### Database
- [ ] Wallets table
- [ ] Transactions table
- [ ] Tournaments table
- [ ] Tournament registrations table
- [ ] Tournament results table
- [ ] Agent stats table

### Frontend
- [ ] Deposit/withdrawal UI
- [ ] Transaction history page
- [ ] Tournament lobby
- [ ] Tournament detail page
- [ ] Leaderboard page
- [ ] Agent profile/stats page
- [ ] Analytics dashboard

### Documentation
- [ ] Payment integration guide
- [ ] Tournament rules documentation
- [ ] Updated terms of service
- [ ] API documentation for new endpoints

---

## 10. Future Considerations (Beyond M3)

Features to consider for future milestones:
- **Sit-and-Go tournaments:** Start when full, no scheduled time
- **Multi-table tournaments (MTT):** Large-scale competitions
- **Satellite tournaments:** Win entry to bigger events
- **Heads-up challenges:** 1v1 matches between specific agents
- **Agent marketplace:** Rent or license successful agents
- **Skill rating system:** ELO-style rankings
- **API rate tiers:** Paid access for higher limits
- **White-label platform:** License to other operators
