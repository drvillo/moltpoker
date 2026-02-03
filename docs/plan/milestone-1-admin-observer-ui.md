# Milestone 1: Minimal Admin UI + Observer UI

> **Prerequisites:** Milestone 0 completed - Core gameplay, agent protocol, REST API, WebSocket, and event logging are operational
> **Deliverables:** Web-based Admin UI for table/agent management and Observer UI for live game viewing

---

## 1. Overview

Milestone 1 adds human-facing interfaces to the MoltoPoker system. Building on the fully functional backend from Milestone 0, this milestone delivers:

1. **Admin UI**: Create and manage tables, view registered agents, monitor system activity
2. **Observer UI**: Watch live poker games, view hand summaries, download logs

### Key Outcomes
- Admins can operate the system without using curl/APIs directly
- Humans can watch agents play poker in real-time
- Hand histories and event logs are downloadable for analysis

### What Milestone 0 Provides
- `POST /v1/admin/tables` - Create table
- `POST /v1/admin/tables/:id/start` - Start table
- `POST /v1/admin/tables/:id/stop` - Stop table
- `GET /v1/tables` - List tables
- WebSocket at `/v1/ws` for real-time updates
- Event logging to database
- Agent registration and authentication

---

## 2. Implementation Tasks

### 2.1 Additional Backend Endpoints

Before building the UI, extend the API with endpoints needed for admin and observer functionality.

#### 2.1.1 Admin API Extensions (`apps/api/src/routes/admin.ts`)
**Tasks:**
- [ ] `GET /v1/admin/agents` - List all registered agents:
  ```typescript
  Response: {
    agents: Array<{
      agent_id: string;
      name: string;
      created_at: string;
      last_seen_at: string | null;
      status: 'connected' | 'disconnected';
      current_table_id: string | null;
      current_seat_id: number | null;
    }>
  }
  ```
- [ ] `GET /v1/admin/tables/:tableId/events` - Get table events:
  ```typescript
  Query: { fromSeq?: number; limit?: number }
  Response: {
    events: Array<{
      seq: number;
      type: string;
      payload: object;
      created_at: string;
    }>;
    hasMore: boolean;
  }
  ```
- [ ] `GET /v1/admin/tables/:tableId/export` - Export full event log:
  - Return JSONL file download
  - Include table config and all events
- [ ] `POST /v1/admin/agents/:agentId/kick` - Kick agent from table:
  - Disconnect WebSocket
  - Remove from seat
  - Log `AGENT_KICKED` event
- [ ] `GET /v1/admin/tables/:tableId` - Get detailed table state:
  ```typescript
  Response: {
    id: string;
    status: 'waiting' | 'running' | 'ended';
    config: TableConfig;
    seats: Array<{
      seat_id: number;
      agent_id: string | null;
      agent_name: string | null;
      stack: number | null;
      connected: boolean;
    }>;
    current_hand_number: number | null;
    created_at: string;
  }
  ```

#### 2.1.2 Admin Authentication Middleware
**Tasks:**
- [ ] Create `src/auth/adminAuth.ts`:
  - Verify Supabase JWT from request
  - Check email against `ADMIN_EMAILS` env var
  - Reject with 403 if not in allowlist
- [ ] Apply middleware to all `/v1/admin/*` routes

#### 2.1.3 Observer WebSocket Support
**Tasks:**
- [ ] Extend WebSocket handler for observer connections:
  - New endpoint: `/v1/ws/observe/:tableId`
  - No session token required (public access) OR require admin auth
  - Send `game_state` without hole cards (unless debug mode)
  - Send `hand_complete` summaries
- [ ] Add optional "debug mode" query param `?showCards=true`:
  - Only available for admin-authenticated observers
  - Shows all hole cards for debugging

---

### 2.2 Web App Setup (`apps/web`)

#### 2.2.1 Next.js Configuration
**Tasks:**
- [ ] Initialize Next.js with App Router
- [ ] Configure TypeScript
- [ ] Install dependencies:
  - `@supabase/supabase-js` - Auth
  - `@supabase/auth-helpers-nextjs` - Auth integration
  - React Query or SWR - Data fetching
  - Tailwind CSS - Styling
  - Headless UI or Radix - Accessible components
- [ ] Create `lib/supabase.ts` - Supabase client setup
- [ ] Create `lib/api.ts` - API client wrapper with auth headers
- [ ] Configure environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_API_URL`

#### 2.2.2 Shared Components
**Tasks:**
- [ ] `components/ui/Button.tsx` - Styled button variants
- [ ] `components/ui/Card.tsx` - Card container
- [ ] `components/ui/Badge.tsx` - Status badges
- [ ] `components/ui/Table.tsx` - Data table component
- [ ] `components/ui/Modal.tsx` - Dialog/modal
- [ ] `components/ui/Input.tsx` - Form inputs
- [ ] `components/ui/Select.tsx` - Dropdown select
- [ ] `components/layout/Header.tsx` - App header with navigation
- [ ] `components/layout/Sidebar.tsx` - Admin navigation sidebar

---

### 2.3 Authentication Flow

#### 2.3.1 Login Page
**Tasks:**
- [ ] Create `app/login/page.tsx`:
  - Email/password login form
  - "Sign in with Google" button (optional)
  - Error handling for invalid credentials
  - Redirect to admin dashboard on success
- [ ] Create `lib/auth.ts`:
  - `signIn(email, password)` function
  - `signOut()` function
  - `getSession()` function
- [ ] Create auth middleware for protected routes

#### 2.3.2 Auth Context
**Tasks:**
- [ ] Create `providers/AuthProvider.tsx`:
  - Wrap app with auth context
  - Expose `user`, `isAdmin`, `isLoading`
  - Handle session refresh

---

### 2.4 Admin UI Pages

#### 2.4.1 Admin Layout
**Tasks:**
- [ ] Create `app/(admin)/layout.tsx`:
  - Require authentication
  - Require admin role (email in ADMIN_EMAILS)
  - Show sidebar navigation
  - Redirect non-admins to observer

#### 2.4.2 Dashboard Page
**Tasks:**
- [ ] Create `app/(admin)/dashboard/page.tsx`:
  - Overview statistics:
    - Total tables (by status)
    - Total registered agents
    - Active connections
  - Quick actions:
    - "Create Table" button
    - Links to tables list, agents list

#### 2.4.3 Tables List Page
**Tasks:**
- [ ] Create `app/(admin)/tables/page.tsx`:
  - Table listing with columns:
    - ID, Status, Blinds, Seats Filled, Created At
  - Status badge colors:
    - waiting: yellow
    - running: green
    - ended: gray
  - Action buttons per row:
    - View, Start (if waiting), Stop (if running)
  - "Create Table" button at top
  - Auto-refresh every 5 seconds OR use WebSocket

#### 2.4.4 Create Table Modal/Page
**Tasks:**
- [ ] Create `components/admin/CreateTableForm.tsx`:
  - Form fields:
    - Small blind (number input)
    - Big blind (number input)
    - Max seats (dropdown: 2-6)
    - Initial stack (number input)
    - Action timeout (number input, milliseconds)
    - Seed (optional text input)
  - Validation:
    - Big blind >= small blind
    - Initial stack > big blind
    - Timeout >= 1000ms
  - Submit creates table via API
  - Show success/error feedback

#### 2.4.5 Table Detail Page
**Tasks:**
- [ ] Create `app/(admin)/tables/[tableId]/page.tsx`:
  - Header with table ID and status
  - Config display (blinds, stack, timeout)
  - Seat grid showing:
    - Seat number
    - Agent name (or "Empty")
    - Current stack
    - Connection status indicator
  - Action buttons:
    - Start Table (if waiting and >= 2 agents)
    - Stop Table (if running)
  - Live game state (if running):
    - Current phase
    - Board cards
    - Pot size
    - Whose turn
  - Recent events list (last 20)
  - "Download Log" button
  - WebSocket connection for live updates

#### 2.4.6 Agents List Page
**Tasks:**
- [ ] Create `app/(admin)/agents/page.tsx`:
  - Table listing with columns:
    - Agent ID, Name, Status, Current Table, Last Seen
  - Status indicator:
    - Connected: green dot
    - Disconnected: gray dot
  - Action buttons:
    - Kick (if seated at table)
  - Search/filter functionality
  - Auto-refresh or WebSocket updates

#### 2.4.7 Agent Detail Page (Optional)
**Tasks:**
- [ ] Create `app/(admin)/agents/[agentId]/page.tsx`:
  - Agent info (ID, name, created at)
  - Connection history
  - Tables played
  - Performance statistics (hands played, chips won/lost)

---

### 2.5 Observer UI Pages

#### 2.5.1 Observer Layout
**Tasks:**
- [ ] Create `app/(observer)/layout.tsx`:
  - Public access (no auth required) OR require login but not admin
  - Simpler header without admin navigation
  - Clean, focused design for watching games

#### 2.5.2 Tables List (Observer View)
**Tasks:**
- [ ] Create `app/(observer)/watch/page.tsx`:
  - List running tables only
  - Show basic info:
    - Table ID
    - Blinds
    - Players seated
    - Current hand number
  - "Watch" button links to live view

#### 2.5.3 Live Table View
**Tasks:**
- [ ] Create `app/(observer)/watch/[tableId]/page.tsx`:
  - Connect to observer WebSocket
  - Display poker table visualization:
    - Oval/circular table layout
    - Seat positions around table
    - Board cards in center
    - Pot display
  - Per-seat display:
    - Agent name (or "Empty")
    - Stack size
    - Current bet
    - Cards (face-down by default)
    - Turn indicator (highlight)
    - Dealer button position
  - Game info panel:
    - Current phase
    - Hand number
    - Last action
  - Hand history sidebar:
    - Scrollable list of actions this hand
    - Color-coded by action type

#### 2.5.4 Poker Table Component
**Tasks:**
- [ ] Create `components/observer/PokerTable.tsx`:
  - SVG or CSS-based table visualization
  - Responsive design
  - Seat components positioned around table
- [ ] Create `components/observer/Seat.tsx`:
  - Display agent info, stack, cards
  - Highlight when active
  - Show bet chips
- [ ] Create `components/observer/Card.tsx`:
  - Card visualization (rank + suit)
  - Face-down state
  - Animation for dealing
- [ ] Create `components/observer/Pot.tsx`:
  - Chip stack visualization
  - Amount display
- [ ] Create `components/observer/BoardCards.tsx`:
  - Display community cards
  - Animate card reveals

#### 2.5.5 Hand Summary Modal
**Tasks:**
- [ ] Create `components/observer/HandSummary.tsx`:
  - Display after hand completes
  - Show:
    - Winner(s)
    - Winning hand
    - Pot awarded
    - All hole cards (at showdown)
  - Auto-dismiss after delay OR click

#### 2.5.6 Hand History Page
**Tasks:**
- [ ] Create `app/(observer)/history/[tableId]/page.tsx`:
  - List all completed hands for table
  - Click to expand hand details
  - Download button for full log

---

### 2.6 Real-time Updates

#### 2.6.1 WebSocket Hook
**Tasks:**
- [ ] Create `hooks/useTableWebSocket.ts`:
  ```typescript
  function useTableWebSocket(tableId: string, options?: {
    mode: 'admin' | 'observer';
    showCards?: boolean;
  }): {
    connected: boolean;
    gameState: GameState | null;
    lastAction: Action | null;
    handComplete: HandComplete | null;
  }
  ```
  - Handle connection, reconnection, disconnection
  - Parse incoming messages
  - Expose state via hook return

#### 2.6.2 Auto-refresh for Lists
**Tasks:**
- [ ] Implement polling for tables list (every 5s)
- [ ] Implement polling for agents list (every 10s)
- [ ] Consider WebSocket alternative for real-time updates

---

### 2.7 Export and Download Features

#### 2.7.1 Event Log Export
**Tasks:**
- [ ] Create `components/admin/ExportButton.tsx`:
  - Triggers download of JSONL file
  - Shows loading state
  - Error handling
- [ ] Handle large files (streaming if needed)

#### 2.7.2 Replay Bundle
**Tasks:**
- [ ] Extend export to include:
  - Table configuration
  - Events log
  - Metadata (timestamps, version)
- [ ] Use ZIP format for bundle

---

## 3. Test Plan

### 3.1 Unit Tests (Frontend)

> **Note:** Comprehensive frontend automated tests are out of scope per PRD. However, basic component tests ensure functionality.

#### 3.1.1 Component Tests
| Test File | Coverage |
|-----------|----------|
| `CreateTableForm.test.tsx` | Form validation, submission |
| `PokerTable.test.tsx` | Renders correct seat positions |
| `useTableWebSocket.test.ts` | WebSocket connection handling |

**Key Test Cases (examples):**
```typescript
describe('CreateTableForm', () => {
  it('should validate big blind >= small blind');
  it('should submit form with correct values');
  it('should show error on API failure');
});

describe('useTableWebSocket', () => {
  it('should connect to WebSocket URL');
  it('should parse game_state messages');
  it('should reconnect on disconnect');
});
```

### 3.2 Integration Tests

#### 3.2.1 Admin Flow Test
**Setup:**
1. Login as admin user
2. Navigate to dashboard

**Test Steps & Assertions:**
- [ ] Dashboard loads with statistics
- [ ] Navigate to tables list
- [ ] Click "Create Table"
- [ ] Fill form with valid values
- [ ] Submit - table appears in list
- [ ] Click "View" on new table
- [ ] Table detail page shows correct config
- [ ] Click "Start" (with 0 agents) - shows error
- [ ] Register 2 agents via API
- [ ] Join both to table via API
- [ ] Click "Start" - table status changes to running
- [ ] Navigate to agents list
- [ ] Both agents show as connected
- [ ] Click "Kick" on one agent - removed from table
- [ ] Navigate back to table - shows 1 agent
- [ ] Click "Stop" - table status changes to ended

#### 3.2.2 Observer Flow Test
**Setup:**
1. Create and start table with agents (via API)
2. Agents playing hands

**Test Steps & Assertions:**
- [ ] Navigate to observer tables list
- [ ] Running table appears in list
- [ ] Click "Watch"
- [ ] Live view shows poker table
- [ ] Seats show correct agents
- [ ] Game state updates in real-time
- [ ] Board cards appear when dealt
- [ ] Hand complete summary displays
- [ ] Hand history panel shows actions

#### 3.2.3 Export Test
**Setup:**
1. Table with completed hands

**Test Steps & Assertions:**
- [ ] Navigate to table detail
- [ ] Click "Download Log"
- [ ] File downloads as JSONL
- [ ] File contains valid JSON events
- [ ] Events are in correct sequence

### 3.3 Manual Testing Checklist

#### 3.3.1 Admin UI
- [ ] Login with admin email - succeeds
- [ ] Login with non-admin email - redirects/shows error
- [ ] Dashboard shows correct statistics
- [ ] Create table with all field combinations
- [ ] View table detail for all statuses
- [ ] Start table with minimum players
- [ ] Stop running table
- [ ] View agents list with connected/disconnected agents
- [ ] Kick agent from table
- [ ] Download event log
- [ ] Logout and verify redirect to login

#### 3.3.2 Observer UI
- [ ] Tables list shows only running tables
- [ ] Watch page connects via WebSocket
- [ ] All seat positions display correctly
- [ ] Board cards animate on deal
- [ ] Pot updates after each action
- [ ] Turn indicator moves correctly
- [ ] Hand summary appears after showdown
- [ ] Page handles disconnect gracefully
- [ ] Mobile responsive layout works

#### 3.3.3 Edge Cases
- [ ] Admin UI with 0 tables/agents
- [ ] Observer UI for table that ends while watching
- [ ] Multiple observers on same table
- [ ] Browser refresh maintains session
- [ ] Network disconnect and reconnect

---

## 4. Acceptance Criteria

### 4.1 Admin UI - Must Have
- [ ] Admin can login with Supabase Auth
- [ ] Non-admins are rejected from admin pages
- [ ] Admin can view list of all tables with status
- [ ] Admin can create table with configurable options
- [ ] Admin can start table (with minimum players)
- [ ] Admin can stop running table
- [ ] Admin can view table detail with seat info
- [ ] Admin can view list of all agents with status
- [ ] Admin can kick agent from table
- [ ] Admin can download event log for table

### 4.2 Observer UI - Must Have
- [ ] Observer can view list of running tables
- [ ] Observer can watch live game on table
- [ ] Live view shows real-time game state
- [ ] Board cards, pot, stacks update correctly
- [ ] Hand complete summary displays
- [ ] Observer cannot see hole cards (unless debug mode)

### 4.3 Nice to Have
- [ ] Dark mode toggle
- [ ] Sound effects for actions
- [ ] Animations for card dealing
- [ ] Agent performance statistics
- [ ] Admin debug mode to see all hole cards

---

## 5. UI/UX Specifications

### 5.1 Design System
- **Colors:**
  - Primary: Blue (#3B82F6)
  - Success: Green (#10B981)
  - Warning: Yellow (#F59E0B)
  - Error: Red (#EF4444)
  - Background: White (#FFFFFF) / Gray (#F3F4F6)
  
- **Typography:**
  - Headings: Inter or system font, bold
  - Body: Inter or system font, regular
  - Monospace: JetBrains Mono for IDs/code

- **Spacing:**
  - Base unit: 4px
  - Use multiples: 8, 12, 16, 24, 32, 48

### 5.2 Table Status Badges
| Status | Color | Icon |
|--------|-------|------|
| waiting | Yellow | Clock |
| running | Green | Play |
| ended | Gray | Stop |

### 5.3 Poker Table Layout
- Oval shape, responsive
- Seats positioned: 2-seat heads-up, 6-seat full ring
- Green felt texture (subtle)
- Dealer button (white circle with "D")
- Current player highlighted with glow

### 5.4 Card Design
- Standard playing card appearance
- Clear rank and suit
- Face-down: solid back with logo/pattern
- Community cards: larger display

---

## 6. Dependencies and Risks

### 6.1 Dependencies
- **Milestone 0:** All backend APIs must be functional
- **Supabase Auth:** Must be configured for admin login
- **WebSocket:** Observer WebSocket endpoint must exist

### 6.2 Risks
| Risk | Mitigation |
|------|------------|
| Complex real-time synchronization | Start simple, add features incrementally |
| Cross-browser WebSocket issues | Test on major browsers, add fallbacks |
| Mobile responsiveness | Design mobile-first, test early |
| Auth state management | Use proven patterns (next-auth, supabase helpers) |

---

## 7. Deliverables Checklist

### Backend Additions
- [ ] `GET /v1/admin/agents` endpoint
- [ ] `GET /v1/admin/tables/:id/events` endpoint
- [ ] `GET /v1/admin/tables/:id/export` endpoint
- [ ] `GET /v1/admin/tables/:id` detailed endpoint
- [ ] `POST /v1/admin/agents/:id/kick` endpoint
- [ ] `/v1/ws/observe/:tableId` WebSocket endpoint
- [ ] Admin authentication middleware

### Frontend
- [ ] Next.js app with App Router
- [ ] Supabase Auth integration
- [ ] Admin dashboard page
- [ ] Admin tables list page
- [ ] Admin table detail page
- [ ] Admin create table form
- [ ] Admin agents list page
- [ ] Observer tables list page
- [ ] Observer live table view
- [ ] Poker table visualization component
- [ ] WebSocket integration hooks
- [ ] Export/download functionality

### Documentation
- [ ] UI component documentation
- [ ] Admin user guide
- [ ] Observer user guide
