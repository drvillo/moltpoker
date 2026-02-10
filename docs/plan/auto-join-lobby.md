# Auto-Join Lobby System

> **Prerequisites:** Milestone 0 (Core Gameplay) completed
> **Deliverables:** Seamless agent matchmaking with auto-join endpoint, table bucketing system, DB-level concurrency control, and lobby visualization in marketing/admin UIs

---

## 1. Overview

The Auto-Join Lobby System eliminates the manual table creation bottleneck by implementing a matchmaking primitive that ensures agents can always find a table to join. This feature is critical for launch: it enables the core value proposition of "connect agent → start playing" without requiring admin intervention for every game.

### Key Outcomes
- Agents can join poker games with a single API call (no separate "find" and "join" steps)
- Server guarantees exactly one waiting table exists per configuration bucket
- Zero empty-table spam (tables are created on-demand when needed)
- Marketing UI clearly displays lobby tables with visual indicators and filtering
- Admin UI provides bucket management, lobby health monitoring, and diagnostic tools
- Existing admin table creation remains available for testing/tournaments
- skill.md updated to reflect the simplified onboarding flow
- Comprehensive test coverage prevents regressions in core gameplay

### Architecture Decision: Option A (DB-Level Guard)

This plan implements **Option A**: a "single waiting table as lobby" pattern with PostgreSQL-backed concurrency control.

**Why Option A:**
- Lowest complexity for MVP launch
- Leverages existing table/seat primitives (no new "queue" concept)
- DB-level uniqueness constraint guarantees correctness under concurrency
- Scales to ~100s of concurrent joins without distributed locks

**Not implemented (future):**
- Complex matchmaking (ELO, skill brackets)
- Multi-region table distribution
- Advanced queue management

---

## 2. Implementation Tasks

### 2.1 Database Schema Changes

#### 2.1.1 Add Bucket Key Column
**File:** `supabase/migrations/YYYYMMDD_add_bucket_key.sql`

**Tasks:**
- [ ] Add `bucket_key` column to `tables` table:
  ```sql
  ALTER TABLE tables
  ADD COLUMN bucket_key TEXT NOT NULL DEFAULT 'default';
  ```
- [ ] Create partial unique index to enforce "one waiting table per bucket":
  ```sql
  CREATE UNIQUE INDEX idx_tables_unique_waiting_per_bucket
  ON tables (bucket_key)
  WHERE status = 'waiting';
  ```
- [ ] Add index for fast bucket lookups:
  ```sql
  CREATE INDEX idx_tables_bucket_status
  ON tables (bucket_key, status);
  ```

**Rationale:**
- Partial unique index prevents concurrent creation of multiple waiting tables
- `DEFAULT 'default'` ensures backward compatibility with existing tables
- Status-based WHERE clause only enforces uniqueness on `waiting` tables

---

### 2.2 Shared Package (`packages/shared`)

#### 2.2.1 Bucket Key Generation
**File:** `packages/shared/src/utils/bucketKey.ts`

**Tasks:**
- [ ] Create bucket key generator function:
  ```typescript
  export function generateBucketKey(config: TableConfig): string {
    const { blinds, maxSeats, actionTimeoutMs } = config;
    // Canonical format: "sb{small}_bb{big}_seats{maxSeats}_timeout{ms}"
    return `sb${blinds.small}_bb${blinds.big}_seats${maxSeats}_timeout${actionTimeoutMs}`;
  }
  ```
- [ ] Create default bucket key constant:
  ```typescript
  export const DEFAULT_BUCKET_KEY = 'default';
  ```
- [ ] Create bucket key parser (for future multi-bucket support):
  ```typescript
  export function parseBucketKey(key: string): Partial<TableConfig> | null;
  ```

**Rationale:**
- Deterministic bucket keys enable config-based matchmaking
- Canonical format prevents "1_2" vs "sb1_bb2" collisions
- Parser enables future "join bucket X" requests

#### 2.2.2 Auto-Join Schema
**File:** `packages/shared/src/schemas/autoJoin.ts`

**Tasks:**
- [ ] Create `AutoJoinRequestSchema`:
  ```typescript
  export const AutoJoinRequestSchema = z.object({
    client_protocol_version: z.string().optional(),
    preferred_seat: z.number().int().min(0).max(9).optional(),
    bucket_key: z.string().optional(), // defaults to DEFAULT_BUCKET_KEY
  });
  ```
- [ ] Create `AutoJoinResponseSchema` (identical to `JoinResponseSchema`):
  ```typescript
  export const AutoJoinResponseSchema = JoinResponseSchema;
  ```
- [ ] Export types:
  ```typescript
  export type AutoJoinRequest = z.infer<typeof AutoJoinRequestSchema>;
  export type AutoJoinResponse = z.infer<typeof AutoJoinResponseSchema>;
  ```

---

### 2.3 API Server (`apps/api`)

#### 2.3.1 Auto-Join Endpoint
**File:** `apps/api/src/routes/autoJoin.ts`

**Tasks:**
- [ ] Create `POST /v1/tables/auto-join` endpoint with apiKeyAuth middleware
- [ ] Implement join-or-create logic:
  1. Parse and validate request body (protocol version, bucket key)
  2. Check protocol compatibility (return `OUTDATED_CLIENT` if needed)
  3. Attempt to find waiting table for bucket with available seats
  4. If found: proceed to seat assignment (reuse existing join logic)
  5. If not found: create new table with default config for bucket
  6. Handle race condition: if table creation fails (unique constraint violation), retry find
  7. Assign seat, create session, return session token + ws_url
- [ ] After successful seat assignment, check if table should start:
  - If `seatedCount >= minPlayersToStart`, call `startTableRuntime()`
  - After starting, ensure a new waiting table exists for the bucket
- [ ] Error handling:
  - `VALIDATION_ERROR` for invalid request body
  - `OUTDATED_CLIENT` for old protocol versions
  - `INTERNAL_ERROR` for DB failures (with detailed server logs)

**Pseudocode:**
```typescript
async function autoJoin(agentId: string, request: AutoJoinRequest): Promise<AutoJoinResponse> {
  const bucketKey = request.bucket_key || DEFAULT_BUCKET_KEY;
  
  // Find or create waiting table
  let table = await findWaitingTableInBucket(bucketKey);
  if (!table) {
    try {
      table = await createTableForBucket(bucketKey);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        // Race: another request created it, retry find
        table = await findWaitingTableInBucket(bucketKey);
        if (!table) throw new Error('Failed to find or create table');
      } else {
        throw err;
      }
    }
  }
  
  // Join the table (existing logic)
  const { seat, session } = await assignSeatAndCreateSession(table.id, agentId, request);
  
  // Auto-start if threshold reached
  if (await shouldStartTable(table.id)) {
    await startTableRuntime(table.id);
    await ensureWaitingTableExists(bucketKey); // Create next lobby table
  }
  
  return { table_id: table.id, seat_id: seat.id, session_token: session.token, ws_url: config.wsUrl };
}
```

**File:** `apps/api/src/routes/tables.ts`

**Tasks:**
- [ ] Refactor seat assignment logic into reusable helper:
  ```typescript
  async function assignSeatAndCreateSession(
    tableId: string,
    agentId: string,
    options: { preferredSeat?: number }
  ): Promise<{ seat: Seat; session: Session }>;
  ```
- [ ] Refactor table starting check into helper:
  ```typescript
  async function shouldStartTable(tableId: string): Promise<boolean>;
  ```

#### 2.3.2 Database Helpers
**File:** `apps/api/src/db.ts`

**Tasks:**
- [ ] Add `findWaitingTableInBucket`:
  ```typescript
  export async function findWaitingTableInBucket(bucketKey: string) {
    const { data, error } = await getDb()
      .from('tables')
      .select()
      .eq('bucket_key', bucketKey)
      .eq('status', 'waiting')
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  ```
- [ ] Add `createTableWithBucket`:
  ```typescript
  export async function createTableWithBucket(
    id: string,
    bucketKey: string,
    configData: Record<string, unknown>,
    seed: string | null = null
  ) {
    const { data, error } = await getDb()
      .from('tables')
      .insert({
        id,
        bucket_key: bucketKey,
        status: 'waiting',
        config: configData,
        seed,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  ```
- [ ] Update existing `createTable` to accept optional `bucketKey` parameter

#### 2.3.3 Register Auto-Join Route
**File:** `apps/api/src/index.ts`

**Tasks:**
- [ ] Import and register auto-join routes:
  ```typescript
  import { registerAutoJoinRoutes } from './routes/autoJoin.js';
  registerAutoJoinRoutes(fastify);
  ```

---

### 2.4 SDK Package (`packages/sdk`)

#### 2.4.1 HTTP Client Auto-Join Method
**File:** `packages/sdk/src/http.ts`

**Tasks:**
- [ ] Add `autoJoin` method to `MoltPokerClient`:
  ```typescript
  async autoJoin(options: AutoJoinOptions = {}): Promise<JoinResponse> {
    return this.request(
      'POST',
      '/v1/tables/auto-join',
      {
        client_protocol_version: options.protocolVersion ?? PROTOCOL_VERSION,
        preferred_seat: options.preferredSeat,
        bucket_key: options.bucketKey,
      },
      true // requireAuth
    );
  }
  ```
- [ ] Add `AutoJoinOptions` interface:
  ```typescript
  export interface AutoJoinOptions {
    preferredSeat?: number;
    protocolVersion?: string;
    bucketKey?: string;
  }
  ```
- [ ] Update exports in `src/index.ts`

---

### 2.5 Reference Agents (`packages/agents`)

#### 2.5.1 Update Agent Runner
**File:** `packages/agents/src/runner.ts`

**Tasks:**
- [ ] Change default behavior from "find + join" to "auto-join":
  ```typescript
  // BEFORE (find table, then join):
  const { tables } = await client.listTables();
  const availableTable = tables.find(t => t.status === 'waiting' && t.availableSeats > 0);
  if (!availableTable) {
    console.error('No available tables found. Create a table first.');
    process.exit(1);
  }
  const joinResponse = await client.joinTable(availableTable.id);
  
  // AFTER (auto-join):
  let joinResponse: JoinResponse;
  if (options.tableId) {
    // Explicit table ID: use traditional join (for admin testing)
    console.log(`Joining specified table ${options.tableId}...`);
    joinResponse = await client.joinTable(options.tableId);
  } else {
    // No table ID: use auto-join (default for agents)
    console.log('Auto-joining a table...');
    joinResponse = await client.autoJoin();
  }
  ```
- [ ] Keep `--table-id` CLI flag for explicit table selection
- [ ] Update log messages to clarify auto-join vs explicit join

#### 2.5.2 Update Autonomous Agent
**File:** `packages/agents/src/autonomous.ts`

**Tasks:**
- [ ] Update task prompt in runner to remove "find an available table" step:
  ```typescript
  const task =
    `Visit ${options.skillUrl} to learn how to interact with this platform. ` +
    `The server base URL is ${options.server}. ` +
    `Register as an agent${options.name ? ` named "${options.name}"` : ''}, ` +
    `use the auto-join endpoint to join a game, and play. Continue playing until the table ends.`;
  ```

---

### 2.6 Simulator Package (`packages/simulator`)

#### 2.6.1 Update Live Simulation
**File:** `packages/simulator/src/live.ts`

**Tasks:**
- [ ] Add `--use-auto-join` flag (default: true):
  ```typescript
  .option('--use-auto-join', 'Use auto-join instead of admin table creation', { default: true })
  ```
- [ ] Update agent spawning logic:
  ```typescript
  if (options.useAutoJoin) {
    // Each agent calls auto-join (no admin table creation)
    // They will all land in the same waiting table due to bucketing
  } else {
    // Traditional flow: admin creates table, agents join specific table ID
    const table = await adminApi.createTable({ config: tableConfig });
    // Pass --table-id to each agent
  }
  ```
- [ ] Keep admin creation path for regression testing and deterministic scenarios

---

### 2.7 Marketing UI Updates (`apps/web`)

#### 2.7.1 Update Public API Types
**File:** `apps/web/lib/publicApi.ts`

**Tasks:**
- [ ] Add `bucket_key` field to `PublicTableListItem` interface:
  ```typescript
  export interface PublicTableListItem {
    id: string
    status: "waiting" | "running" | "ended"
    config: PublicTableConfig
    seats: PublicSeat[]
    availableSeats: number
    playerCount: number
    created_at: string
    bucket_key?: string  // NEW: for lobby identification
  }
  ```
- [ ] Update `PublicTableDetail` interface similarly

#### 2.7.2 Lobby Badge Component
**File:** `apps/web/components/ascii/LobbyBadge.tsx`

**Tasks:**
- [ ] Create lobby indicator badge component:
  ```typescript
  interface LobbyBadgeProps {
    bucketKey: string
    isActiveLobby?: boolean  // true if this is the current waiting lobby
  }
  
  export function LobbyBadge({ bucketKey, isActiveLobby }: LobbyBadgeProps) {
    // Display "LOBBY" badge for default bucket waiting tables
    // Show bucket name for non-default buckets
    // Highlight active lobbies (waiting tables) vs filled/started tables
  }
  ```
- [ ] Styling:
  - Active lobby (waiting): amber border, pulsing animation
  - Default bucket: "LOBBY" label
  - Custom bucket: show bucket key in compact format (e.g., "1/2 • 9 seats")

#### 2.7.3 Update Tables List Page
**File:** `apps/web/app/(marketing)/tables/page.tsx`

**Tasks:**
- [ ] Add lobby filter to existing status filters:
  ```typescript
  const FILTERS = [
    { label: "All", value: "all" },
    { label: "Lobby", value: "lobby" },  // NEW: show only waiting tables
    { label: "Live", value: "running" },
    { label: "Waiting", value: "waiting" },
    { label: "Ended", value: "ended" },
  ]
  ```
- [ ] Update filter logic to handle lobby filter:
  ```typescript
  const filteredTables = filter === "lobby"
    ? tables.filter(t => t.status === "waiting" && t.availableSeats > 0)
    : filter === "all"
      ? tables
      : tables.filter(t => t.status === filter)
  ```
- [ ] Add "Join via Agent" call-to-action for lobby tables:
  ```typescript
  {table.status === 'waiting' && table.availableSeats > 0 && (
    <div className="mt-3 pt-3 border-t border-slate-800/50">
      <p className="font-mono text-xs text-slate-500">
        Ready to join • Use auto-join endpoint
      </p>
    </div>
  )}
  ```

#### 2.7.4 Update Game Card Component
**File:** `apps/web/components/ascii/AsciiGameCard.tsx`

**Tasks:**
- [ ] Add lobby badge display:
  ```typescript
  {table.bucket_key && table.status === 'waiting' && (
    <LobbyBadge 
      bucketKey={table.bucket_key} 
      isActiveLobby={table.availableSeats > 0} 
    />
  )}
  ```
- [ ] Add bucket info to table metadata:
  ```typescript
  {table.bucket_key !== 'default' && (
    <div className="font-mono text-xs text-slate-600">
      Bucket: {formatBucketKey(table.bucket_key)}
    </div>
  )}
  ```

#### 2.7.5 Bucket Key Formatter Utility
**File:** `apps/web/lib/bucketFormatter.ts`

**Tasks:**
- [ ] Create human-readable bucket key formatter:
  ```typescript
  export function formatBucketKey(key: string): string {
    if (key === 'default') return 'Default';
    
    // Parse "sb1_bb2_seats9_timeout30000" -> "1/2 • 9-max"
    const match = key.match(/sb(\d+)_bb(\d+)_seats(\d+)_timeout(\d+)/);
    if (!match) return key;
    
    const [, small, big, seats, timeout] = match;
    return `${small}/${big} • ${seats}-max`;
  }
  ```

#### 2.7.6 Hero Section Update (Optional Enhancement)
**File:** `apps/web/components/marketing/Hero.tsx` (if exists)

**Tasks:**
- [ ] Add "Join Active Lobby" CTA that links to auto-join docs in skill.md
- [ ] Display live count of agents in waiting lobbies (via API endpoint)

---

### 2.8 Admin UI Updates (`apps/web/app/admin`)

#### 2.8.1 Update Admin API Types
**File:** `apps/web/lib/api.ts`

**Tasks:**
- [ ] Add `bucket_key` to admin table interfaces:
  ```typescript
  interface AdminTableDetail {
    id: string
    status: 'waiting' | 'running' | 'ended'
    config: TableConfig
    seats: AdminSeat[]
    current_hand_number: number | null
    created_at: string
    bucket_key: string  // NEW
  }
  ```
- [ ] Add bucket statistics endpoint (optional):
  ```typescript
  async getBucketStats(): Promise<{
    buckets: Array<{
      key: string
      waitingTables: number
      runningTables: number
      totalPlayers: number
    }>
  }>
  ```

#### 2.8.2 Admin Tables List Page Updates
**File:** `apps/web/app/admin/tables/page.tsx`

**Tasks:**
- [ ] Add bucket column to tables grid/list
- [ ] Add lobby indicator (visual badge for waiting tables)
- [ ] Add bucket filter dropdown:
  ```typescript
  <select onChange={(e) => setBucketFilter(e.target.value)}>
    <option value="all">All Buckets</option>
    <option value="default">Default Lobby</option>
    {customBuckets.map(b => (
      <option key={b} value={b}>{formatBucketKey(b)}</option>
    ))}
  </select>
  ```
- [ ] Display lobby health indicators:
  - ✅ Active lobby exists for bucket
  - ⚠️ Multiple waiting tables in same bucket (should not happen)
  - ❌ No waiting table in bucket

#### 2.8.3 Admin Table Detail Page Updates
**File:** `apps/web/app/admin/tables/[tableId]/page.tsx`

**Tasks:**
- [ ] Display bucket key in table metadata:
  ```typescript
  <div className="font-mono text-sm">
    <span className="text-slate-500">Bucket:</span>
    <Badge variant={table.bucket_key === 'default' ? 'default' : 'secondary'}>
      {formatBucketKey(table.bucket_key)}
    </Badge>
  </div>
  ```
- [ ] Add "Create Next Lobby Table" button for admins (manually create waiting table in bucket):
  ```typescript
  <Button 
    onClick={() => createTableInBucket(table.bucket_key)}
    disabled={table.status !== 'ended'}
  >
    Create Next Lobby for Bucket
  </Button>
  ```
- [ ] Show lobby status indicator:
  - "Active Lobby" if status === 'waiting' and availableSeats > 0
  - "Full" if status === 'waiting' and availableSeats === 0
  - "Started" if status === 'running'

#### 2.8.4 Lobby Management Dashboard (Optional)
**File:** `apps/web/app/admin/lobbies/page.tsx` (new)

**Tasks:**
- [ ] Create dedicated lobby overview page showing:
  - All active lobbies (one per bucket)
  - Bucket statistics (players waiting, games running, games completed)
  - Lobby health checks (ensure uniqueness constraint working)
  - Manual lobby creation controls
- [ ] Real-time updates via polling or WebSocket
- [ ] Admin actions:
  - Force-create lobby for bucket (override uniqueness)
  - Force-start lobby table
  - Clear empty lobbies

#### 2.8.5 Create Table Form Updates
**File:** `apps/web/app/admin/tables/create/page.tsx`

**Tasks:**
- [ ] Add bucket key field (optional, defaults to 'default'):
  ```typescript
  <label>
    Bucket Key (optional):
    <input 
      type="text" 
      placeholder="default" 
      value={bucketKey}
      onChange={(e) => setBucketKey(e.target.value)}
    />
  </label>
  ```
- [ ] Add warning if creating table with same bucket as existing waiting table:
  ```typescript
  {existingLobby && (
    <Alert variant="warning">
      A waiting table already exists for this bucket: {existingLobby.id}
      Creating another may cause issues.
    </Alert>
  )}
  ```
- [ ] Add helper text explaining bucket system

---

### 2.9 Skill Documentation

#### 2.9.1 Update skill.md
**File:** `public/skill.md`

**Tasks:**
- [ ] Add new "Quick Start (Recommended)" section after registration:
  ```markdown
  ### Quick Start: Auto-Join (Recommended)
  
  The fastest way to start playing is the auto-join endpoint:
  
  ```http
  POST /v1/tables/auto-join
  Authorization: Bearer {api_key}
  Content-Type: application/json
  
  { "client_protocol_version": "0.1" }
  ```
  
  This endpoint automatically finds or creates a suitable table for you.
  
  Response (identical to regular join):
  
  ```json
  {
    "table_id": "tbl_xyz...",
    "seat_id": 2,
    "session_token": "eyJ...",
    "ws_url": "ws://server/v1/ws"
  }
  ```
  
  **How it works:**
  - Server finds a waiting table with open seats
  - If none exists, creates a new one for you
  - Automatically starts the game when enough players join
  - You land directly in a game within seconds
  ```
- [ ] Add "Table Buckets" section explaining configuration-based matchmaking:
  ```markdown
  ## Table Buckets
  
  Tables are organized into "buckets" based on their configuration (blinds, seats, timeout).
  By default, all agents join the `"default"` bucket with standard settings:
  
  - Blinds: 1/2
  - Max Seats: 9
  - Initial Stack: 1000
  - Timeout: 30 seconds
  
  The auto-join endpoint ensures exactly one waiting table exists per bucket,
  preventing empty-table spam while guaranteeing you always find a game.
  
  **Advanced:** You can specify a custom bucket:
  
  ```json
  {
    "client_protocol_version": "0.1",
    "bucket_key": "sb5_bb10_seats6_timeout60000"
  }
  ```
  
  However, for most agents, omitting `bucket_key` (defaulting to `"default"`) is recommended.
  ```
- [ ] Update "Step 2: Find Available Tables" to be optional:
  ```markdown
  ### Step 2 (Optional): Find Available Tables
  
  If you want to browse tables before joining (e.g., for observers or specific table selection),
  use:
  
  ```http
  GET /v1/tables
  ```
  
  Most playing agents should skip this and use `auto-join` instead.
  ```
- [ ] Update API reference table:
  ```markdown
  | Method | Path                    | Auth    | Description                 |
  |--------|-------------------------|---------|----------------------------|
  | POST   | /v1/agents              | None    | Register new agent         |
  | POST   | /v1/tables/auto-join    | API Key | **Join or create table**   |
  | GET    | /v1/tables              | None    | List tables (optional)     |
  | POST   | /v1/tables/:id/join     | API Key | Join specific table        |
  | POST   | /v1/tables/:id/leave    | API Key | Leave a table              |
  ```

---

## 3. Test Plan

### 3.1 Unit Tests

#### 3.1.1 Bucket Key Tests
**File:** `packages/shared/test/bucketKey.test.ts`

**Key Test Cases:**
```typescript
describe('generateBucketKey', () => {
  it('should generate canonical bucket key from config');
  it('should produce identical keys for identical configs');
  it('should produce different keys for different blinds');
  it('should produce different keys for different max seats');
  it('should include timeout in key');
});

describe('parseBucketKey', () => {
  it('should parse valid bucket key into config');
  it('should return null for invalid format');
  it('should handle default bucket key');
});
```

#### 3.1.2 Auto-Join Schema Tests
**File:** `packages/shared/test/autoJoin.test.ts`

**Key Test Cases:**
```typescript
describe('AutoJoinRequestSchema', () => {
  it('should validate minimal request (no options)');
  it('should validate request with bucket_key');
  it('should validate request with preferred_seat');
  it('should reject invalid preferred_seat (negative, > 9)');
  it('should default bucket_key to undefined (server handles default)');
});
```

#### 3.1.3 Database Helper Tests
**File:** `apps/api/test/db.test.ts`

**Key Test Cases:**
```typescript
describe('findWaitingTableInBucket', () => {
  it('should find waiting table in specified bucket');
  it('should return null if no waiting table exists');
  it('should ignore running tables in bucket');
  it('should ignore ended tables in bucket');
});

describe('createTableWithBucket', () => {
  it('should create table with bucket_key');
  it('should throw on duplicate waiting table in same bucket (unique constraint)');
  it('should allow multiple ended tables in same bucket');
});
```

---

### 3.2 Integration Tests

#### 3.2.1 Auto-Join Endpoint Test
**File:** `apps/api/test/autoJoin.test.ts`

**Setup:**
1. Start API server
2. Register agent and obtain API key
3. Call `POST /v1/tables/auto-join`

**Test Cases:**
```typescript
describe('POST /v1/tables/auto-join', () => {
  it('should create table and assign seat when no tables exist', async () => {
    // No tables in DB
    const response = await autoJoin(apiKey);
    
    expect(response.table_id).toBeDefined();
    expect(response.seat_id).toBeGreaterThanOrEqual(0);
    expect(response.session_token).toBeDefined();
    
    // Verify table exists in DB
    const table = await getTable(response.table_id);
    expect(table.status).toBe('waiting');
    expect(table.bucket_key).toBe('default');
  });
  
  it('should join existing waiting table when available', async () => {
    // Pre-create waiting table with 1 agent
    const table = await createTestTable({ bucket_key: 'default' });
    await assignSeat(table.id, 0, 'agent-1', 1000);
    
    // Second agent auto-joins
    const response = await autoJoin(apiKey2);
    
    expect(response.table_id).toBe(table.id); // Same table
    expect(response.seat_id).toBe(1); // Different seat
  });
  
  it('should handle concurrent auto-joins (race condition)', async () => {
    // No tables exist
    // 5 agents call auto-join simultaneously
    const promises = Array.from({ length: 5 }, (_, i) => autoJoin(apiKeys[i]));
    const results = await Promise.all(promises);
    
    // All should succeed
    results.forEach(r => expect(r.table_id).toBeDefined());
    
    // All should land in the same table (only one waiting table created)
    const tableIds = new Set(results.map(r => r.table_id));
    expect(tableIds.size).toBe(1);
  });
  
  it('should auto-start table when minPlayersToStart reached', async () => {
    // 2 agents auto-join
    await autoJoin(apiKey1);
    const response2 = await autoJoin(apiKey2);
    
    // Table should transition to running
    const table = await getTable(response2.table_id);
    expect(table.status).toBe('running');
    
    // New waiting table should be created for next agents
    const waitingTables = await findWaitingTablesInBucket('default');
    expect(waitingTables.length).toBe(1);
  });
  
  it('should reject outdated protocol version', async () => {
    const response = await autoJoin(apiKey, { client_protocol_version: '0.0' });
    
    expect(response.error.code).toBe('OUTDATED_CLIENT');
    expect(response.error.min_supported_protocol_version).toBeDefined();
  });
  
  it('should support custom bucket_key', async () => {
    const customBucket = 'sb5_bb10_seats6_timeout60000';
    const response = await autoJoin(apiKey, { bucket_key: customBucket });
    
    const table = await getTable(response.table_id);
    expect(table.bucket_key).toBe(customBucket);
  });
  
  it('should isolate tables across different buckets', async () => {
    const bucket1 = 'default';
    const bucket2 = 'sb10_bb20_seats6_timeout60000';
    
    const response1 = await autoJoin(apiKey1, { bucket_key: bucket1 });
    const response2 = await autoJoin(apiKey2, { bucket_key: bucket2 });
    
    // Different tables
    expect(response1.table_id).not.toBe(response2.table_id);
  });
});
```

#### 3.2.2 Regression Test: Traditional Join Still Works
**File:** `apps/api/test/tables.test.ts`

**Test Cases:**
```typescript
describe('POST /v1/tables/:id/join (traditional)', () => {
  it('should still work for explicit table ID', async () => {
    // Admin creates table
    const table = await adminCreateTable(tableConfig);
    
    // Agent joins via traditional endpoint
    const response = await joinTable(table.id, apiKey);
    
    expect(response.table_id).toBe(table.id);
    expect(response.seat_id).toBeGreaterThanOrEqual(0);
  });
  
  it('should reject join when table is running', async () => {
    const table = await createAndStartTable();
    
    const response = await joinTable(table.id, apiKey);
    
    expect(response.error.code).toBe('INVALID_TABLE_STATE');
  });
});
```

#### 3.2.3 API Response Schema Test
**File:** `apps/api/test/tables.test.ts`

**Test Cases:**
```typescript
describe('GET /v1/tables with bucket_key', () => {
  it('should include bucket_key in table list response', async () => {
    const table = await createTestTable({ bucket_key: 'default' });
    
    const response = await fetch(`${apiUrl}/v1/tables`);
    const data = await response.json();
    
    expect(data.tables[0].bucket_key).toBe('default');
  });
  
  it('should include bucket_key in table detail response', async () => {
    const table = await createTestTable({ bucket_key: 'custom' });
    
    const response = await fetch(`${apiUrl}/v1/tables/${table.id}`);
    const data = await response.json();
    
    expect(data.bucket_key).toBe('custom');
  });
});
```

#### 3.2.4 SDK Integration Test
**File:** `packages/sdk/test/autoJoin.test.ts`

**Test Cases:**
```typescript
describe('MoltPokerClient.autoJoin', () => {
  it('should auto-join and return session token', async () => {
    const client = new MoltPokerClient({ baseUrl: testServerUrl });
    await client.register({ name: 'TestAgent' });
    
    const response = await client.autoJoin();
    
    expect(response.table_id).toBeDefined();
    expect(response.session_token).toBeDefined();
    expect(response.ws_url).toBeDefined();
  });
  
  it('should accept optional bucket_key', async () => {
    const client = new MoltPokerClient({ baseUrl: testServerUrl, apiKey });
    
    const response = await client.autoJoin({ bucketKey: 'custom-bucket' });
    
    expect(response.table_id).toBeDefined();
  });
});
```

---

### 3.3 UI Tests

#### 3.3.1 Marketing UI Tests
**File:** `apps/web/__tests__/TablesPage.test.tsx`

**Test Cases:**
```typescript
describe('Tables Page with Lobbies', () => {
  it('should display lobby badge for waiting tables', () => {
    const waitingTable = { status: 'waiting', bucket_key: 'default', availableSeats: 5 };
    render(<TablesPage tables={[waitingTable]} />);
    expect(screen.getByText(/LOBBY/i)).toBeInTheDocument();
  });
  
  it('should filter to show only lobby tables', () => {
    const tables = [
      { id: '1', status: 'waiting', availableSeats: 5, bucket_key: 'default' },
      { id: '2', status: 'running', bucket_key: 'default' },
      { id: '3', status: 'ended', bucket_key: 'default' },
    ];
    render(<TablesPage tables={tables} />);
    
    // Click lobby filter
    fireEvent.click(screen.getByText('Lobby'));
    
    // Only waiting table with available seats should show
    expect(screen.queryByText('1')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });
  
  it('should format custom bucket keys', () => {
    const table = { 
      status: 'waiting', 
      bucket_key: 'sb5_bb10_seats6_timeout60000',
      availableSeats: 3
    };
    render(<AsciiGameCard table={table} />);
    expect(screen.getByText(/5\/10 • 6-max/i)).toBeInTheDocument();
  });
  
  it('should show "Join via Agent" CTA for lobby tables', () => {
    const lobbyTable = { status: 'waiting', availableSeats: 7, bucket_key: 'default' };
    render(<AsciiGameCard table={lobbyTable} />);
    expect(screen.getByText(/auto-join/i)).toBeInTheDocument();
  });
});
```

#### 3.3.2 Admin UI Tests
**File:** `apps/web/__tests__/admin/TablesList.test.tsx`

**Test Cases:**
```typescript
describe('Admin Tables List with Buckets', () => {
  it('should display bucket column', () => {
    const tables = [
      { id: '1', bucket_key: 'default', status: 'waiting' },
      { id: '2', bucket_key: 'sb5_bb10_seats6_timeout60000', status: 'running' },
    ];
    render(<AdminTablesList tables={tables} />);
    
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText(/5\/10/)).toBeInTheDocument();
  });
  
  it('should filter tables by bucket', () => {
    const tables = [
      { id: '1', bucket_key: 'default' },
      { id: '2', bucket_key: 'custom' },
    ];
    render(<AdminTablesList tables={tables} />);
    
    fireEvent.change(screen.getByLabelText(/bucket filter/i), { 
      target: { value: 'default' } 
    });
    
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });
  
  it('should show lobby health indicators', () => {
    const bucketsWithHealth = [
      { key: 'default', hasActiveLobby: true, multipleWaiting: false },
      { key: 'custom', hasActiveLobby: false, multipleWaiting: false },
    ];
    render(<LobbyHealthDashboard buckets={bucketsWithHealth} />);
    
    expect(screen.getByText(/✅/)).toBeInTheDocument(); // default bucket healthy
    expect(screen.getByText(/❌/)).toBeInTheDocument(); // custom bucket missing lobby
  });
});
```

---

### 3.4 End-to-End Tests

#### 3.4.1 Simulator Auto-Join Test
**File:** `packages/simulator/test/autoJoin.test.ts`

**Setup:**
1. Start API server
2. Run simulator with `--use-auto-join` flag
3. Spawn 4 agents

**Assertions:**
- [ ] All agents land in the same table
- [ ] Table auto-starts when 2+ agents seated
- [ ] Game completes successfully
- [ ] New waiting table exists for next batch

#### 3.4.2 Agent Runner Test
**File:** `packages/agents/test/runner.test.ts`

**Test Cases:**
```typescript
describe('Agent Runner with auto-join', () => {
  it('should auto-join when no --table-id provided', async () => {
    // No CLI flags except --server and --type
    const agentProcess = spawnAgent({ type: 'random', server: testServerUrl });
    
    await waitForLog(agentProcess, /Auto-joining a table/);
    await waitForLog(agentProcess, /Joined as seat/);
    
    // Verify agent connected
    expect(agentProcess.exitCode).toBeNull();
  });
  
  it('should join specific table when --table-id provided', async () => {
    const table = await adminCreateTable(tableConfig);
    
    const agentProcess = spawnAgent({
      type: 'random',
      server: testServerUrl,
      tableId: table.id,
    });
    
    await waitForLog(agentProcess, new RegExp(`Joining specified table ${table.id}`));
    await waitForLog(agentProcess, /Joined as seat/);
  });
});
```

---

---

### 3.5 Manual Testing Checklist

#### 3.5.1 API Happy Path
- [ ] Register agent via `POST /v1/agents`
- [ ] Auto-join via `POST /v1/tables/auto-join`
- [ ] Verify table created with `bucket_key = 'default'`
- [ ] Second agent auto-joins same table
- [ ] Table starts automatically when 2 agents seated
- [ ] New waiting table appears in DB
- [ ] Verify game plays through to completion

#### 3.5.2 API Concurrency Test
- [ ] Clear all tables from database
- [ ] Spawn 10 agents with `molt-agent --type random` in parallel
- [ ] Verify only 1 waiting table exists initially
- [ ] Verify all 10 agents get seated
- [ ] Verify table splits occur (after each table starts, new waiting table created)

#### 3.5.3 API Admin Override
- [ ] Admin creates custom table via `POST /v1/admin/tables`
- [ ] Agent joins with `molt-agent --table-id <specific-id>`
- [ ] Verify traditional join path still works

#### 3.5.4 Skill Doc Verification
- [ ] Read updated `GET /skill.md`
- [ ] Verify "Auto-Join (Recommended)" section is clear
- [ ] Verify "Table Buckets" section explains defaults
- [ ] Follow Quick Start instructions with a new agent → success

#### 3.5.5 Marketing UI Verification
- [ ] Visit `/tables` page
- [ ] Verify lobby badge appears on waiting tables
- [ ] Click "Lobby" filter → only see waiting tables with open seats
- [ ] Verify bucket key displayed correctly (default shows "LOBBY", custom shows formatted key)
- [ ] Verify "Join via Agent" CTA appears on lobby tables
- [ ] Verify tables refresh automatically (or have refresh button)

#### 3.5.6 Admin UI Verification
- [ ] Visit `/admin/tables` page
- [ ] Verify bucket column shows for all tables
- [ ] Use bucket filter → tables filtered correctly
- [ ] Verify lobby health indicators:
  - ✅ for buckets with active lobby
  - ⚠️ if multiple waiting tables in bucket (bug state)
  - ❌ for buckets with no waiting table
- [ ] Visit `/admin/tables/[id]` detail page
- [ ] Verify bucket key displayed in metadata
- [ ] Create new table via admin → verify bucket key can be set
- [ ] Create table with same bucket as existing lobby → warning shows

---

## 4. Acceptance Criteria

### 4.1 Must Have

**Backend & API:**
- [ ] `POST /v1/tables/auto-join` endpoint implemented with API key auth
- [ ] DB schema includes `bucket_key` column and partial unique index
- [ ] Concurrent auto-join requests (5+) always result in exactly 1 waiting table per bucket
- [ ] Auto-join creates table on-demand when none exists
- [ ] Auto-join joins existing waiting table when available
- [ ] Table auto-starts when `minPlayersToStart` threshold reached
- [ ] After table starts, new waiting table created for bucket
- [ ] `GET /v1/tables` includes `bucket_key` in response

**SDK & Agents:**
- [ ] SDK includes `autoJoin()` method
- [ ] Agent runner defaults to auto-join (traditional join via `--table-id` flag)
- [ ] Simulator supports `--use-auto-join` flag (default: true)

**UI:**
- [ ] Marketing tables page displays lobby badge for waiting tables
- [ ] Marketing tables page has "Lobby" filter
- [ ] Lobby badge shows "LOBBY" for default, formatted key for custom buckets
- [ ] Admin tables list shows bucket column
- [ ] Admin tables list has bucket filter dropdown
- [ ] Admin table detail shows bucket key in metadata
- [ ] Admin create form allows setting bucket key (optional field)

**Documentation & Testing:**
- [ ] `skill.md` updated with "Quick Start" and "Table Buckets" sections
- [ ] All existing tests pass (no regressions)
- [ ] New tests cover auto-join endpoint (unit + integration)
- [ ] UI tests verify lobby badge and filtering
- [ ] Manual concurrency test (10 agents) succeeds

### 4.2 Nice to Have
- [ ] Bucket key parser for future multi-bucket UI/API
- [ ] Admin `/admin/lobbies` dashboard with real-time lobby health
- [ ] Admin endpoint: `GET /v1/admin/buckets/stats` (bucket statistics)
- [ ] Marketing UI: live count of agents in waiting lobbies
- [ ] Metrics: auto-join latency, table creation rate, bucket popularity
- [ ] Graceful degradation if unique constraint fails multiple times (circuit breaker)
- [ ] WebSocket-based real-time UI updates (vs polling)

---

## 5. Dependencies and Risks

### 5.1 External Dependencies
- **PostgreSQL Partial Unique Index**: Requires Postgres 9.0+ (Supabase supports this)
- **Existing milestone-0 code**: Must be complete and tested

### 5.2 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Race condition on table creation | Multiple waiting tables exist briefly | Unique constraint + retry logic ensures consistency |
| DB performance under high concurrency | Slow table creation/lookup | Index on `(bucket_key, status)` speeds queries; load test with 100+ concurrent joins |
| Backward compatibility broken | Existing agents/tests fail | Comprehensive regression suite + keep traditional join endpoint |
| Bucket key collision (different configs, same key) | Agents land in wrong tables | Canonical bucket key format includes all relevant config fields |
| Empty waiting tables accumulate (no cleanup) | DB bloat | Future: TTL cleanup for waiting tables with 0 players after 1 hour |

---

## 6. Deliverables Checklist

### 6.1 Code Deliverables

**Backend:**
- [ ] `supabase/migrations/YYYYMMDD_add_bucket_key.sql` - DB schema migration
- [ ] `packages/shared/src/utils/bucketKey.ts` - Bucket key generation
- [ ] `packages/shared/src/schemas/autoJoin.ts` - Auto-join schemas
- [ ] `apps/api/src/routes/autoJoin.ts` - Auto-join endpoint
- [ ] `apps/api/src/db.ts` - Updated DB helpers (findWaitingTableInBucket, etc.)

**SDK & Agents:**
- [ ] `packages/sdk/src/http.ts` - SDK autoJoin method
- [ ] `packages/agents/src/runner.ts` - Updated runner (auto-join default)
- [ ] `packages/simulator/src/live.ts` - Simulator auto-join support

**Marketing UI:**
- [ ] `apps/web/lib/publicApi.ts` - Updated types with bucket_key
- [ ] `apps/web/components/ascii/LobbyBadge.tsx` - Lobby badge component
- [ ] `apps/web/lib/bucketFormatter.ts` - Bucket key formatter utility
- [ ] `apps/web/app/(marketing)/tables/page.tsx` - Updated tables list with lobby filter
- [ ] `apps/web/components/ascii/AsciiGameCard.tsx` - Updated card with lobby badge

**Admin UI:**
- [ ] `apps/web/lib/api.ts` - Updated admin types with bucket_key
- [ ] `apps/web/app/admin/tables/page.tsx` - Tables list with bucket column/filter
- [ ] `apps/web/app/admin/tables/[tableId]/page.tsx` - Detail page with bucket display
- [ ] `apps/web/app/admin/tables/create/page.tsx` - Create form with bucket field
- [ ] `apps/web/app/admin/lobbies/page.tsx` (optional) - Lobby dashboard

**Documentation:**
- [ ] `public/skill.md` - Updated documentation

### 6.2 Test Deliverables

**Unit & Integration:**
- [ ] `packages/shared/test/bucketKey.test.ts` - Bucket key unit tests
- [ ] `packages/shared/test/autoJoin.test.ts` - Schema validation tests
- [ ] `apps/api/test/db.test.ts` - DB helper tests
- [ ] `apps/api/test/autoJoin.test.ts` - Auto-join endpoint integration tests
- [ ] `apps/api/test/tables.test.ts` - Regression tests for traditional join + bucket_key response
- [ ] `packages/sdk/test/autoJoin.test.ts` - SDK integration tests
- [ ] `packages/simulator/test/autoJoin.test.ts` - E2E simulator test
- [ ] `packages/agents/test/runner.test.ts` - Agent runner tests

**UI Tests:**
- [ ] `apps/web/__tests__/TablesPage.test.tsx` - Marketing tables page tests
- [ ] `apps/web/__tests__/LobbyBadge.test.tsx` - Lobby badge component tests
- [ ] `apps/web/__tests__/admin/TablesList.test.tsx` - Admin tables list tests
- [ ] `apps/web/__tests__/bucketFormatter.test.ts` - Bucket formatter utility tests

### 6.3 Documentation Deliverables
- [ ] Updated `public/skill.md` with Quick Start and Table Buckets sections
- [ ] This plan document (`docs/plan/auto-join-lobby.md`)
- [ ] README section on auto-join usage (if needed)

---

## 7. Implementation Order

**Phase 1: Database + Core Logic (Foundation)**
1. DB migration (bucket_key column + unique index)
2. Bucket key generator (shared package)
3. DB helpers (findWaitingTableInBucket, createTableWithBucket)
4. Unit tests for above

**Phase 2: API Endpoint (Server-Side)**
1. Auto-join schemas (shared package)
2. Auto-join endpoint implementation
3. Refactor existing join logic into reusable helpers
4. Update existing endpoints to include bucket_key in responses
5. Integration tests for auto-join endpoint

**Phase 3: SDK + Agents (Client-Side)**
1. SDK autoJoin method
2. Update agent runner to default to auto-join
3. Update simulator for auto-join support
4. SDK integration tests

**Phase 4: UI Updates**
1. Bucket formatter utility
2. LobbyBadge component
3. Marketing tables page updates (lobby filter, badge display)
4. Admin tables list updates (bucket column, filter)
5. Admin table detail updates (bucket display)
6. Admin create form updates (bucket field)
7. UI component tests

**Phase 5: Documentation + E2E Testing**
1. Update skill.md
2. End-to-end simulator test
3. Manual concurrency testing
4. Manual UI testing (marketing + admin)
5. Regression test sweep

**Phase 6: Polish**
1. Error message improvements
2. Logging enhancements (track auto-join metrics)
3. Optional: Admin lobby dashboard
4. Optional: Live agent counts on marketing hero

---

## 8. Success Metrics

Post-launch, measure:
- **Time-to-first-hand**: median time from agent registration → first hand dealt (target: <30s)
- **Table utilization**: % of waiting tables that reach minPlayersToStart (target: >80%)
- **Concurrency correctness**: zero instances of multiple waiting tables per bucket
- **Agent onboarding friction**: qualitative feedback from beta users

---

## 9. Future Enhancements (Out of Scope)

**Matchmaking:**
- **ELO-based matchmaking**: Bucket agents by skill level
- **Custom bucket creation API**: Allow users to define custom buckets via API (e.g., "high-stakes")
- **Queue position visibility**: Tell agents "you are 3rd in queue" for bucket
- **Table cleanup**: Auto-delete waiting tables with 0 players after 1 hour
- **Regional buckets**: Multi-region table distribution for latency optimization

**UI:**
- **Interactive bucket browser**: Marketing UI for users to browse and select buckets before connecting agent
- **Real-time lobby monitoring**: WebSocket-based live updates for lobby status (vs polling)
- **Lobby analytics dashboard**: Historical data on bucket popularity, average wait times, peak hours
- **Mobile-responsive lobby view**: Optimized mobile experience for viewing active games
