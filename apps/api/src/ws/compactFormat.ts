import type {
  Card,
  ErrorPayload,
  GameStatePayload,
  HandCompletePayload,
  PlayerState,
  WelcomePayload,
  WsMessageEnvelope,
} from '@moltpoker/shared'

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert a standard WsMessageEnvelope-shaped message into a compact, token-
 * optimised plain object ready for JSON.stringify.
 *
 * This is the **single public entry point** for the module. All per-type
 * conversion logic is kept private.
 */
export function formatMessage(
  type: WsMessageEnvelope['type'],
  payload: unknown,
  _tableId?: string,
  seq?: number,
): Record<string, unknown> {
  switch (type) {
    case 'game_state':
      return compactGameState(payload as GameStatePayload)
    case 'hand_complete':
      return compactHandComplete(payload as HandCompletePayload)
    case 'welcome':
      return compactWelcome(payload as WelcomePayload)
    case 'ack':
      return compactAck(payload as { turn_token: string; seq: number; success: boolean })
    case 'error':
      return compactError(payload as ErrorPayload)
    case 'table_status':
      return { type: 'table_status', ...(payload as Record<string, unknown>) }
    case 'player_joined':
      return { type: 'player_joined', ...(payload as Record<string, unknown>) }
    case 'player_left':
      return { type: 'player_left', ...(payload as Record<string, unknown>) }
    case 'pong':
      return { type: 'pong', ...(seq !== undefined ? { seq } : {}), ...(payload as Record<string, unknown>) }
    default:
      // Fallback: pass through with type tag
      return { type, ...(seq !== undefined ? { seq } : {}), ...(payload as Record<string, unknown>) }
  }
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/** Convert a Card object to its 2-char string notation (e.g. "Qs"). */
function cardStr(card: Card): string {
  return `${card.rank}${card.suit}`
}

/** Convert an array of Card objects to string notation. */
function cardsStr(cards: Card[]): string[] {
  return cards.map(cardStr)
}

/**
 * Convert a PlayerState into a compact player object.
 * Shared by compactGameState (avoids duplicating player field logic).
 *
 * - Omits agentId, isActive
 * - Omits holeCards when null (key absent)
 * - Includes folded/allIn only when true
 */
function compactPlayer(p: PlayerState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    seat: p.seatId,
    name: p.agentName,
    stack: p.stack,
    bet: p.bet,
  }
  if (p.folded) out.folded = true
  if (p.allIn) out.allIn = true
  if (p.holeCards && p.holeCards.length > 0) out.cards = cardsStr(p.holeCards)
  return out
}

// ─── Per-Type Converters ─────────────────────────────────────────────────────

function compactGameState(state: GameStatePayload): Record<string, unknown> {
  const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0)

  const out: Record<string, unknown> = {
    type: 'game_state',
    seq: state.seq,
    hand: state.handNumber,
    phase: state.phase,
    board: cardsStr(state.communityCards),
    pot: totalPot,
    players: state.players.map(compactPlayer),
    dealer: state.dealerSeat,
  }

  if (state.currentSeat !== null && state.currentSeat !== undefined)
    out.turn = state.currentSeat

  if (state.lastAction)
    out.last = {
      seat: state.lastAction.seatId,
      kind: state.lastAction.kind,
      ...(state.lastAction.amount !== undefined ? { amount: state.lastAction.amount } : {}),
    }

  if (state.legalActions && state.legalActions.length > 0)
    out.actions = state.legalActions.map((a) => {
      const action: Record<string, unknown> = { kind: a.kind }
      if (a.minAmount !== undefined) action.min = a.minAmount
      if (a.maxAmount !== undefined) action.max = a.maxAmount
      return action
    })

  if (state.toCall !== undefined) out.toCall = state.toCall
  if (state.turn_token) out.turn_token = state.turn_token

  return out
}

function compactHandComplete(payload: HandCompletePayload): Record<string, unknown> {
  return {
    type: 'hand_complete',
    hand: payload.handNumber,
    results: payload.results.map((r) => {
      const out: Record<string, unknown> = {
        seat: r.seatId,
        cards: cardsStr(r.holeCards),
        won: r.winnings,
      }
      if (r.handRank) out.rank = r.handRank
      return out
    }),
    showdown: payload.showdown,
  }
}

function compactWelcome(payload: WelcomePayload): Record<string, unknown> {
  return {
    type: 'welcome',
    seat: payload.seat_id,
    agent_id: payload.agent_id,
    timeout: payload.action_timeout_ms,
  }
}

function compactAck(payload: { turn_token: string; seq: number; success: boolean }): Record<string, unknown> {
  return {
    type: 'ack',
    turn_token: payload.turn_token,
    seq: payload.seq,
  }
}

function compactError(payload: ErrorPayload): Record<string, unknown> {
  return {
    type: 'error',
    code: payload.code,
    message: payload.message,
  }
}
