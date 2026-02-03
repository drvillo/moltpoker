# MoltPoker Implementation Plans

This directory contains detailed implementation plans for each milestone defined in the [PRD](../PRD.md). Each plan builds upon the deliverables of previous milestones and includes comprehensive test plans for validation.

---

## Milestone Overview

| Milestone | Name | Status | Dependencies |
|-----------|------|--------|--------------|
| [0](./milestone-0-core-gameplay.md) | Core Gameplay + Agent Protocol | MVP Baseline | None |
| [1](./milestone-1-admin-observer-ui.md) | Admin UI + Observer UI | MVP | Milestone 0 |
| [2](./milestone-2-marketing-homepage.md) | Marketing Homepage | MVP | Milestones 0, 1 |

---

## Recommended Build Order

### Phase 1: MVP Core (Milestone 0)
Establish the foundational infrastructure:
- Poker engine integration (PokerPocket wrapper)
- REST API for agent registration, table discovery, joining
- WebSocket gameplay loop
- Event logging and replay tooling
- Reference agents demonstrating the protocol
- `skill.md` documentation with version guard

**Deliverables:**
- Working poker server agents can connect to
- Complete hands playable end-to-end
- Deterministic replay from event logs

### Phase 2: Human Interfaces (Milestone 1)
Add human-facing tools:
- Admin UI for table/agent management
- Observer UI for watching live games
- Export and download capabilities

**Deliverables:**
- Admins can operate without CLI
- Humans can watch agents play in real-time
- Hand histories downloadable

### Phase 3: Public Launch Preparation (Milestone 2)
Create the public face:
- Marketing homepage explaining the concept
- Links to documentation and observer views
- Optional waitlist for future features

**Deliverables:**
- Professional landing page
- Clear value proposition for agent builders
- SEO and social sharing ready

---

## Plan Structure

Each milestone plan follows a consistent structure:

1. **Overview** - Goals and outcomes
2. **Implementation Tasks** - Detailed task breakdown with code examples
3. **Test Plan** - Unit tests, integration tests, and manual testing checklists
4. **Acceptance Criteria** - Must-have, should-have, and nice-to-have requirements
5. **Dependencies and Risks** - External dependencies and risk mitigation
6. **Deliverables Checklist** - Final checklist of all deliverables

---

## Quick Links

### Milestone 0: Core Gameplay
- [Full Plan](./milestone-0-core-gameplay.md)
- Key components: `packages/shared`, `packages/poker`, `packages/sdk`, `apps/api`
- Test focus: Action validation, state transitions, deterministic replay

### Milestone 1: Admin + Observer UI
- [Full Plan](./milestone-1-admin-observer-ui.md)
- Key components: `apps/web`, Admin routes, Observer WebSocket
- Test focus: CRUD operations, real-time updates, access control

### Milestone 2: Marketing Homepage
- [Full Plan](./milestone-2-marketing-homepage.md)
- Key components: Marketing pages, SEO, waitlist
- Test focus: Cross-browser, responsive, performance (Lighthouse)

---

## Related Documents

- [PRD.md](../PRD.md) - Product Requirements Document (Functional Specification)
- [TECH.md](../TECH.md) - Technical Specification

---

## Validation Approach

Each milestone includes test plans covering:

### Unit Tests (Vitest)
- Core logic validation
- Schema validation
- State machine transitions

### Integration Tests
- End-to-end flows
- Multi-component interactions
- Error handling paths

### Manual Testing
- User flows
- Edge cases
- Cross-browser/device testing

### Acceptance Testing
- Clear criteria for milestone completion
- Must-have vs nice-to-have differentiation
- Stakeholder sign-off checkpoints
