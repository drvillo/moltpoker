import type {
  Card,
  GameStatePayload,
  HandCompletePayload,
  PlayerState,
  Pot,
} from '@moltpoker/shared'

/**
 * Raw event from the API
 */
export interface RawEvent {
  seq: number
  type: string
  payload: unknown
  created_at: string
}

/**
 * A snapshot of the game state at a specific point in time
 */
export interface ReplaySnapshot {
  seq: number
  gameState: GameStatePayload
  handComplete: HandCompletePayload | null
  eventType: string
  eventDescription: string
}

/**
 * Final standings for an agent
 */
export interface FinalStanding {
  seatId: number
  agentId: string
  agentName: string | null
  stack: number
  netChange: number
}

/**
 * Complete replay data built from events
 */
export interface ReplayData {
  snapshots: ReplaySnapshot[]
  totalHands: number
  initialConfig: {
    blinds: { small: number; big: number }
    initialStack: number
    maxSeats: number
  }
  finalStacks: FinalStanding[]
  handStartIndices: number[] // Index of first snapshot for each hand
}

// Event payload types (matching the backend schemas)
interface TableStartedPayload {
  config: {
    blinds: { small: number; big: number }
    maxSeats: number
    initialStack: number
    actionTimeoutMs: number
    seed?: string
  }
}

interface PlayerJoinedPayload {
  seatId: number
  agentId: string
  agentName: string | null
  stack: number
}

interface HandStartPayload {
  handNumber: number
  dealerSeat: number
  smallBlindSeat: number
  bigBlindSeat: number
  smallBlind: number
  bigBlind: number
  players: Array<{
    seatId: number
    agentId: string
    stack: number
    holeCards: Card[]
  }>
}

interface PlayerActionPayload {
  handNumber: number
  seatId: number
  agentId: string
  actionId: string
  kind: 'fold' | 'check' | 'call' | 'raiseTo'
  amount?: number
  isTimeout?: boolean
}

interface StreetDealtPayload {
  handNumber: number
  street: 'flop' | 'turn' | 'river'
  cards: Card[]
}

interface HandCompleteEventPayload {
  handNumber: number
  results: Array<{
    seatId: number
    agentId: string
    holeCards: Card[]
    handRank?: string
    winnings: number
  }>
  finalPots: Pot[]
  communityCards: Card[]
  showdown: boolean
}

interface TableEndedPayload {
  reason?: string
  finalStacks: Array<{
    seatId: number
    agentId: string
    stack: number
  }>
}

/**
 * Internal state used during replay construction
 */
interface BuilderState {
  tableId: string
  handNumber: number
  phase: GameStatePayload['phase']
  communityCards: Card[]
  pots: Pot[]
  players: Map<number, PlayerState>
  dealerSeat: number
  currentSeat: number | null
  lastAction: GameStatePayload['lastAction']
  seq: number
  initialStack: number
  config: ReplayData['initialConfig'] | null
  agentNames: Map<string, string | null>
}

function createInitialState(tableId: string): BuilderState {
  return {
    tableId,
    handNumber: 0,
    phase: 'waiting',
    communityCards: [],
    pots: [],
    players: new Map(),
    dealerSeat: 0,
    currentSeat: null,
    lastAction: null,
    seq: 0,
    initialStack: 0,
    config: null,
    agentNames: new Map(),
  }
}

function buildGameStatePayload(state: BuilderState): GameStatePayload {
  const players = Array.from(state.players.values()).sort((a, b) => a.seatId - b.seatId)
  
  return {
    tableId: state.tableId,
    handNumber: state.handNumber,
    phase: state.phase,
    communityCards: [...state.communityCards],
    pots: [...state.pots],
    players,
    dealerSeat: state.dealerSeat,
    currentSeat: state.currentSeat,
    lastAction: state.lastAction,
    legalActions: null,
    seq: state.seq,
  }
}

function getAgentDisplayName(state: BuilderState, seatId: number): string {
  const player = state.players.get(seatId)
  if (player?.agentName) return player.agentName
  if (player?.agentId) {
    const name = state.agentNames.get(player.agentId)
    if (name) return name
    return `Seat ${seatId}`
  }
  return `Seat ${seatId}`
}

function formatAction(kind: string, amount?: number): string {
  switch (kind) {
    case 'fold': return 'folds'
    case 'check': return 'checks'
    case 'call': return amount ? `calls ${amount}` : 'calls'
    case 'raiseTo': return amount ? `raises to ${amount}` : 'raises'
    default: return kind
  }
}

function getNextActiveSeat(state: BuilderState, currentSeat: number): number | null {
  const players = Array.from(state.players.values())
    .filter(p => p.isActive && !p.folded && !p.allIn)
    .sort((a, b) => a.seatId - b.seatId)
  
  if (players.length === 0) return null
  
  // Find next player after current seat
  for (const p of players) {
    if (p.seatId > currentSeat) return p.seatId
  }
  // Wrap around
  return players[0]?.seatId ?? null
}

/**
 * Build replay data from raw events
 */
export function buildReplayData(tableId: string, events: RawEvent[]): ReplayData {
  const state = createInitialState(tableId)
  const snapshots: ReplaySnapshot[] = []
  const handStartIndices: number[] = []
  let totalHands = 0
  let finalStacks: FinalStanding[] = []
  let handComplete: HandCompletePayload | null = null

  for (const event of events) {
    state.seq = event.seq
    let eventDescription = ''
    let shouldSnapshot = true

    switch (event.type) {
      case 'TABLE_STARTED': {
        const payload = event.payload as TableStartedPayload
        state.config = {
          blinds: payload.config.blinds,
          initialStack: payload.config.initialStack,
          maxSeats: payload.config.maxSeats,
        }
        state.initialStack = payload.config.initialStack
        eventDescription = `Table started (blinds ${payload.config.blinds.small}/${payload.config.blinds.big})`
        break
      }

      case 'PLAYER_JOINED': {
        const payload = event.payload as PlayerJoinedPayload
        state.agentNames.set(payload.agentId, payload.agentName)
        state.players.set(payload.seatId, {
          seatId: payload.seatId,
          agentId: payload.agentId,
          agentName: payload.agentName,
          stack: payload.stack,
          bet: 0,
          folded: false,
          allIn: false,
          isActive: true,
          holeCards: null,
        })
        const name = payload.agentName || `Agent ${payload.seatId}`
        eventDescription = `${name} joins at seat ${payload.seatId} with ${payload.stack} chips`
        break
      }

      case 'HAND_START': {
        const payload = event.payload as HandStartPayload
        state.handNumber = payload.handNumber
        state.dealerSeat = payload.dealerSeat
        state.phase = 'preflop'
        state.communityCards = []
        state.pots = [{ amount: 0, eligibleSeats: [] }]
        state.lastAction = null
        handComplete = null
        totalHands = Math.max(totalHands, payload.handNumber)
        
        // Record the snapshot index for this hand
        handStartIndices.push(snapshots.length)

        // Update players with hole cards and reset state
        let potAmount = 0
        for (const p of payload.players) {
          const existing = state.players.get(p.seatId)
          const isSB = p.seatId === payload.smallBlindSeat
          const isBB = p.seatId === payload.bigBlindSeat
          const blind = isSB ? payload.smallBlind : isBB ? payload.bigBlind : 0
          potAmount += blind
          
          state.players.set(p.seatId, {
            seatId: p.seatId,
            agentId: p.agentId,
            agentName: existing?.agentName ?? state.agentNames.get(p.agentId) ?? null,
            stack: p.stack - blind,
            bet: blind,
            folded: false,
            allIn: p.stack <= blind,
            isActive: true,
            holeCards: p.holeCards,
          })
        }
        
        state.pots = [{ amount: potAmount, eligibleSeats: payload.players.map(p => p.seatId) }]
        
        // First to act preflop is after BB
        state.currentSeat = getNextActiveSeat(state, payload.bigBlindSeat)
        
        eventDescription = `Hand #${payload.handNumber} starts - Dealer: Seat ${payload.dealerSeat}`
        break
      }

      case 'PLAYER_ACTION': {
        const payload = event.payload as PlayerActionPayload
        const player = state.players.get(payload.seatId)
        if (!player) break

        const agentName = getAgentDisplayName(state, payload.seatId)
        const currentMaxBet = Math.max(...Array.from(state.players.values()).map(p => p.bet))

        switch (payload.kind) {
          case 'fold':
            player.folded = true
            break
          case 'check':
            // No change
            break
          case 'call': {
            const callAmount = currentMaxBet - player.bet
            const actualCall = Math.min(callAmount, player.stack)
            player.stack -= actualCall
            player.bet += actualCall
            if (player.stack === 0) player.allIn = true
            break
          }
          case 'raiseTo': {
            const raiseAmount = (payload.amount ?? 0) - player.bet
            player.stack -= raiseAmount
            player.bet = payload.amount ?? player.bet
            if (player.stack === 0) player.allIn = true
            break
          }
        }

        state.lastAction = {
          seatId: payload.seatId,
          kind: payload.kind,
          amount: payload.amount,
        }

        // Update pot
        const totalBets = Array.from(state.players.values()).reduce((sum, p) => sum + p.bet, 0)
        state.pots = [{ 
          amount: totalBets, 
          eligibleSeats: Array.from(state.players.values())
            .filter(p => !p.folded)
            .map(p => p.seatId) 
        }]

        // Move to next player
        state.currentSeat = getNextActiveSeat(state, payload.seatId)

        const timeoutSuffix = payload.isTimeout ? ' (timeout)' : ''
        eventDescription = `${agentName} ${formatAction(payload.kind, payload.amount)}${timeoutSuffix}`
        break
      }

      case 'STREET_DEALT': {
        const payload = event.payload as StreetDealtPayload
        state.communityCards = [...state.communityCards, ...payload.cards]
        state.phase = payload.street
        
        // Reset bets for new street, collect into pot
        for (const player of state.players.values()) {
          player.bet = 0
        }
        
        // First to act is first active player after dealer
        state.currentSeat = getNextActiveSeat(state, state.dealerSeat)
        state.lastAction = null

        const cardStr = payload.cards.map(c => `${c.rank}${c.suit}`).join(' ')
        eventDescription = `${payload.street.charAt(0).toUpperCase() + payload.street.slice(1)}: ${cardStr}`
        break
      }

      case 'SHOWDOWN': {
        state.phase = 'showdown'
        state.currentSeat = null
        eventDescription = 'Showdown'
        break
      }

      case 'HAND_COMPLETE': {
        const payload = event.payload as HandCompleteEventPayload
        state.phase = 'ended'
        state.currentSeat = null
        state.communityCards = payload.communityCards
        
        // Update stacks based on results
        for (const result of payload.results) {
          const player = state.players.get(result.seatId)
          if (player) {
            player.stack += result.winnings
            player.holeCards = result.holeCards
          }
        }
        
        handComplete = {
          handNumber: payload.handNumber,
          results: payload.results,
          finalPots: payload.finalPots,
          communityCards: payload.communityCards,
          showdown: payload.showdown,
        }

        const winners = payload.results.filter(r => r.winnings > 0)
        if (winners.length > 0) {
          const winnerNames = winners.map(w => {
            const name = getAgentDisplayName(state, w.seatId)
            const handRank = w.handRank ? ` (${w.handRank})` : ''
            return `${name} wins ${w.winnings}${handRank}`
          })
          eventDescription = `Hand complete: ${winnerNames.join(', ')}`
        } else {
          eventDescription = `Hand #${payload.handNumber} complete`
        }
        break
      }

      case 'TABLE_ENDED': {
        const payload = event.payload as TableEndedPayload
        state.phase = 'ended'
        
        finalStacks = payload.finalStacks.map(fs => ({
          seatId: fs.seatId,
          agentId: fs.agentId,
          agentName: state.agentNames.get(fs.agentId) ?? null,
          stack: fs.stack,
          netChange: fs.stack - state.initialStack,
        })).sort((a, b) => b.stack - a.stack)
        
        eventDescription = `Table ended${payload.reason ? ` (${payload.reason})` : ''}`
        break
      }

      case 'PLAYER_LEFT':
      case 'AGENT_KICKED':
      case 'PLAYER_TIMEOUT':
      case 'POT_AWARDED':
        // These are informational, skip snapshot
        shouldSnapshot = false
        break

      default:
        shouldSnapshot = false
        break
    }

    if (shouldSnapshot && eventDescription) {
      snapshots.push({
        seq: event.seq,
        gameState: buildGameStatePayload(state),
        handComplete,
        eventType: event.type,
        eventDescription,
      })
    }
  }

  // If no TABLE_ENDED event, build final stacks from current state
  if (finalStacks.length === 0 && state.players.size > 0) {
    finalStacks = Array.from(state.players.values())
      .map(p => ({
        seatId: p.seatId,
        agentId: p.agentId,
        agentName: p.agentName,
        stack: p.stack,
        netChange: p.stack - state.initialStack,
      }))
      .sort((a, b) => b.stack - a.stack)
  }

  return {
    snapshots,
    totalHands,
    initialConfig: state.config ?? {
      blinds: { small: 25, big: 50 },
      initialStack: 1000,
      maxSeats: 6,
    },
    finalStacks,
    handStartIndices,
  }
}

/**
 * Get the hand number for a given snapshot index
 */
export function getHandNumberForIndex(replayData: ReplayData, index: number): number {
  for (let i = replayData.handStartIndices.length - 1; i >= 0; i--) {
    if (replayData.handStartIndices[i] <= index) {
      return i + 1
    }
  }
  return 0
}

/**
 * Get the snapshot index for the start of a given hand
 */
export function getIndexForHand(replayData: ReplayData, handNumber: number): number {
  if (handNumber <= 0 || handNumber > replayData.handStartIndices.length) {
    return 0
  }
  return replayData.handStartIndices[handNumber - 1] ?? 0
}
