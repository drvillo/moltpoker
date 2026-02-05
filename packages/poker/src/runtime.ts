import type {
  ActionKind,
  Card,
  GameStatePayload,
  HandCompletePayload,
  HandResult,
  LegalAction,
  PlayerAction,
  PlayerState,
  Pot,
} from '@moltpoker/shared';

import { createDeck, shuffleDeck } from './deck.js';
import { compareHands, evaluateHand, type HandEvaluation } from './handEvaluator.js';

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';

export interface Player {
  seatId: number;
  agentId: string;
  agentName: string | null;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  isActive: boolean;
  holeCards: Card[];
}

export interface TableRuntimeConfig {
  tableId: string;
  blinds: { small: number; big: number };
  maxSeats: number;
  initialStack: number;
  actionTimeoutMs: number;
  seed?: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Core poker game runtime managing a single table
 */
export class TableRuntime {
  private config: TableRuntimeConfig;
  private players: Map<number, Player> = new Map();
  private deck: Card[] = [];
  private communityCards: Card[] = [];
  private pots: Pot[] = [];
  private phase: Phase = 'waiting';
  private handNumber: number = 0;
  private dealerSeat: number = -1;
  private currentSeat: number = -1;
  private lastRaiseSeat: number = -1;
  private minRaise: number = 0;
  private currentBet: number = 0;
  private seq: number = 0;
  private lastAction: { seatId: number; kind: ActionKind; amount?: number } | null = null;
  private processedActionIds: Set<string> = new Set();
  private handSeed: string = '';

  constructor(config: TableRuntimeConfig) {
    this.config = config;
  }

  /**
   * Get current sequence number
   */
  getSeq(): number {
    return this.seq;
  }

  /**
   * Get table ID
   */
  getTableId(): string {
    return this.config.tableId;
  }

  /**
   * Get action timeout
   */
  getActionTimeoutMs(): number {
    return this.config.actionTimeoutMs;
  }

  /**
   * Add a player to the table
   */
  addPlayer(seatId: number, agentId: string, agentName: string | null, stack?: number): boolean {
    if (seatId < 0 || seatId >= this.config.maxSeats) {
      return false;
    }
    if (this.players.has(seatId)) {
      return false;
    }

    this.players.set(seatId, {
      seatId,
      agentId,
      agentName,
      stack: stack ?? this.config.initialStack,
      bet: 0,
      folded: false,
      allIn: false,
      isActive: true,
      holeCards: [],
    });

    return true;
  }

  /**
   * Remove a player from the table
   */
  removePlayer(seatId: number): boolean {
    return this.players.delete(seatId);
  }

  /**
   * Get player by seat ID
   */
  getPlayer(seatId: number): Player | undefined {
    return this.players.get(seatId);
  }

  /**
   * Get all players
   */
  getAllPlayers(): Player[] {
    return [...this.players.values()].sort((a, b) => a.seatId - b.seatId);
  }

  /**
   * Get active (non-folded) players
   */
  getActivePlayers(): Player[] {
    return this.getAllPlayers().filter((p) => !p.folded && p.isActive);
  }

  /**
   * Get players with chips left to bet (not all-in)
   */
  getPlayersWithChips(): Player[] {
    return this.getActivePlayers().filter((p) => !p.allIn);
  }

  /**
   * Get current phase
   */
  getPhase(): Phase {
    return this.phase;
  }

  /**
   * Get hand number
   */
  getHandNumber(): number {
    return this.handNumber;
  }

  /**
   * Check if a hand is in progress
   */
  isHandInProgress(): boolean {
    return this.phase !== 'waiting' && this.phase !== 'ended';
  }

  /**
   * Check if hand is complete
   */
  isHandComplete(): boolean {
    return this.phase === 'showdown' || this.phase === 'ended';
  }

  /**
   * Get the current seat that needs to act
   */
  getCurrentSeat(): number {
    return this.currentSeat;
  }

  /**
   * Start a new hand
   */
  startHand(): boolean {
    const activePlayers = this.getAllPlayers().filter((p) => p.stack > 0);
    if (activePlayers.length < 2) {
      return false;
    }

    // Reset player states
    for (const player of this.players.values()) {
      player.bet = 0;
      player.folded = player.stack === 0;
      player.allIn = false;
      player.isActive = player.stack > 0;
      player.holeCards = [];
    }

    // Increment hand number and create new seed
    this.handNumber++;
    this.handSeed = this.config.seed
      ? `${this.config.seed}-hand-${this.handNumber}`
      : `random-${Date.now()}-${this.handNumber}`;

    // Shuffle and deal
    this.deck = shuffleDeck(createDeck(), this.handSeed);
    this.communityCards = [];
    this.pots = [];
    this.lastAction = null;
    this.processedActionIds.clear();

    // Move dealer button
    this.dealerSeat = this.getNextActiveSeat(this.dealerSeat);

    // Determine blind positions
    const smallBlindSeat = this.getNextActiveSeat(this.dealerSeat);
    const bigBlindSeat = this.getNextActiveSeat(smallBlindSeat);

    // Post blinds
    this.postBlind(smallBlindSeat, this.config.blinds.small);
    this.postBlind(bigBlindSeat, this.config.blinds.big);

    // Deal hole cards
    for (const player of this.getActivePlayers()) {
      player.holeCards = [this.deck.pop()!, this.deck.pop()!];
    }

    // Set initial betting state
    this.phase = 'preflop';
    this.currentBet = this.config.blinds.big;
    this.minRaise = this.config.blinds.big;
    this.lastRaiseSeat = bigBlindSeat;

    // First to act is after big blind
    this.currentSeat = this.getNextActiveSeat(bigBlindSeat);

    this.seq++;
    return true;
  }

  /**
   * Post a blind bet
   */
  private postBlind(seatId: number, amount: number): void {
    const player = this.players.get(seatId);
    if (!player) return;

    const actualAmount = Math.min(amount, player.stack);
    player.bet = actualAmount;
    player.stack -= actualAmount;
    if (player.stack === 0) {
      player.allIn = true;
    }
  }

  /**
   * Get next seat with an active player
   */
  private getNextActiveSeat(currentSeat: number): number {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 0) return -1;

    const seats = activePlayers.map((p) => p.seatId).sort((a, b) => a - b);
    const currentIndex = seats.findIndex((s) => s > currentSeat);

    return currentIndex >= 0 ? seats[currentIndex]! : seats[0]!;
  }

  /**
   * Get next seat that can act (has chips and not folded)
   */
  private getNextActingSeat(currentSeat: number): number {
    const actingPlayers = this.getPlayersWithChips();
    if (actingPlayers.length === 0) return -1;

    const seats = actingPlayers.map((p) => p.seatId).sort((a, b) => a - b);
    const currentIndex = seats.findIndex((s) => s > currentSeat);

    return currentIndex >= 0 ? seats[currentIndex]! : seats[0]!;
  }

  /**
   * Check if action is from a known action ID (idempotency)
   */
  isActionProcessed(actionId: string): boolean {
    return this.processedActionIds.has(actionId);
  }

  /**
   * Get legal actions for a seat
   */
  getLegalActions(seatId: number): LegalAction[] {
    const player = this.players.get(seatId);
    if (!player || player.folded || player.allIn || this.currentSeat !== seatId) {
      return [];
    }

    const actions: LegalAction[] = [];
    const toCall = this.currentBet - player.bet;

    // Can always fold
    actions.push({ kind: 'fold' });

    // Check if no bet to call
    if (toCall === 0) {
      actions.push({ kind: 'check' });
    }

    // Call if there's a bet
    if (toCall > 0 && player.stack > 0) {
      actions.push({
        kind: 'call',
        minAmount: Math.min(toCall, player.stack),
        maxAmount: Math.min(toCall, player.stack),
      });
    }

    // Raise if player has enough chips
    if (player.stack > toCall) {
      const minRaiseAmount = this.currentBet + this.minRaise;
      const maxRaiseAmount = player.stack + player.bet;

      actions.push({
        kind: 'raiseTo',
        minAmount: Math.min(minRaiseAmount, maxRaiseAmount),
        maxAmount: maxRaiseAmount,
      });
    }

    return actions;
  }

  /**
   * Apply a player action
   */
  applyAction(seatId: number, action: PlayerAction): ActionResult {
    // Check idempotency
    if (this.processedActionIds.has(action.action_id)) {
      return { success: true }; // Already processed
    }

    // Validate it's this player's turn
    if (this.currentSeat !== seatId) {
      return { success: false, error: 'Not your turn', errorCode: 'NOT_YOUR_TURN' };
    }

    const player = this.players.get(seatId);
    if (!player || player.folded || player.allIn) {
      return { success: false, error: 'Cannot act', errorCode: 'INVALID_ACTION' };
    }

    const legalActions = this.getLegalActions(seatId);
    const isLegal = legalActions.some((la) => {
      if (la.kind !== action.kind) return false;
      if (action.kind === 'raiseTo') {
        const amount = action.amount ?? 0;
        return (
          amount >= (la.minAmount ?? 0) &&
          amount <= (la.maxAmount ?? Infinity)
        );
      }
      return true;
    });

    if (!isLegal) {
      return { success: false, error: 'Illegal action', errorCode: 'INVALID_ACTION' };
    }

    // Apply the action
    switch (action.kind) {
      case 'fold':
        player.folded = true;
        break;

      case 'check':
        // Nothing to do
        break;

      case 'call': {
        const toCall = Math.min(this.currentBet - player.bet, player.stack);
        player.stack -= toCall;
        player.bet += toCall;
        if (player.stack === 0) player.allIn = true;
        break;
      }

      case 'raiseTo': {
        const raiseAmount = action.amount!;
        const additionalChips = raiseAmount - player.bet;

        // Update min raise
        const raiseSize = raiseAmount - this.currentBet;
        if (raiseSize > this.minRaise) {
          this.minRaise = raiseSize;
        }

        player.stack -= additionalChips;
        player.bet = raiseAmount;
        this.currentBet = raiseAmount;
        this.lastRaiseSeat = seatId;

        if (player.stack === 0) player.allIn = true;
        break;
      }
    }

    this.lastAction = { seatId, kind: action.kind, amount: action.amount };
    this.processedActionIds.add(action.action_id);
    this.seq++;

    // Advance game state
    this.advanceGame();

    return { success: true };
  }

  /**
   * Advance game state after an action
   */
  private advanceGame(): void {
    const activePlayers = this.getActivePlayers();

    // Check if only one player left
    if (activePlayers.length === 1) {
      this.awardPotToWinner(activePlayers[0]!);
      return;
    }

    // Check if betting round is complete
    const actingPlayers = this.getPlayersWithChips();

    if (actingPlayers.length <= 1) {
      // All but one (or zero) players are all-in, run out the board
      this.runOutBoard();
      return;
    }

    // Move to next player
    const nextSeat = this.getNextActingSeat(this.currentSeat);
    const isBettingComplete = this.isBettingRoundComplete();

    // Check if we're back to the last raiser (or past it)
    if (nextSeat === this.lastRaiseSeat || isBettingComplete) {
      this.advanceToNextStreet();
    } else {
      this.currentSeat = nextSeat;
    }
  }

  /**
   * Check if betting round is complete
   */
  private isBettingRoundComplete(): boolean {
    const actingPlayers = this.getPlayersWithChips();

    // All players have matched the current bet or are all-in
    for (const player of actingPlayers) {
      if (player.bet < this.currentBet) {
        return false;
      }
    }

    // Everyone has acted at least once (last raiser has come around)
    const nextSeat = this.getNextActingSeat(this.currentSeat);
    return nextSeat === this.lastRaiseSeat;
  }

  /**
   * Advance to the next street
   */
  private advanceToNextStreet(): void {
    // Collect bets into pot
    this.collectBets();

    switch (this.phase) {
      case 'preflop':
        this.phase = 'flop';
        this.communityCards.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
        break;
      case 'flop':
        this.phase = 'turn';
        this.communityCards.push(this.deck.pop()!);
        break;
      case 'turn':
        this.phase = 'river';
        this.communityCards.push(this.deck.pop()!);
        break;
      case 'river':
        this.resolveShowdown();
        return;
    }

    // Reset betting for new street
    this.currentBet = 0;
    this.minRaise = this.config.blinds.big;
    this.currentSeat = this.getNextActingSeat(this.dealerSeat);
    this.lastRaiseSeat = this.currentSeat;
    this.seq++;
  }

  /**
   * Run out remaining community cards when all players are all-in
   */
  private runOutBoard(): void {
    this.collectBets();

    while (this.communityCards.length < 5) {
      if (this.communityCards.length === 0) {
        this.communityCards.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
        this.phase = 'flop';
      } else if (this.communityCards.length === 3) {
        this.communityCards.push(this.deck.pop()!);
        this.phase = 'turn';
      } else if (this.communityCards.length === 4) {
        this.communityCards.push(this.deck.pop()!);
        this.phase = 'river';
      }
    }

    this.resolveShowdown();
  }

  /**
   * Collect all bets into the pot(s)
   */
  private collectBets(): void {
    const activePlayers = this.getActivePlayers();
    const bets = activePlayers
      .filter((p) => p.bet > 0)
      .map((p) => ({ seatId: p.seatId, bet: p.bet }))
      .sort((a, b) => a.bet - b.bet);

    if (bets.length === 0) return;

    // Create side pots if needed
    let previousBet = 0;
    for (const { bet } of bets) {
      if (bet > previousBet) {
        const potAmount =
          (bet - previousBet) * bets.filter((b) => b.bet >= bet).length;

        const eligibleSeats = activePlayers
          .filter((p) => p.bet >= bet || !p.folded)
          .map((p) => p.seatId);

        if (potAmount > 0) {
          // Find or create pot with these eligible players
          const existingPot = this.pots.find(
            (p) =>
              p.eligibleSeats.length === eligibleSeats.length &&
              p.eligibleSeats.every((s) => eligibleSeats.includes(s))
          );

          if (existingPot) {
            existingPot.amount += potAmount;
          } else {
            this.pots.push({ amount: potAmount, eligibleSeats });
          }
        }

        previousBet = bet;
      }
    }

    // Simplify pots - combine main pot
    if (this.pots.length === 0) {
      const totalBets = activePlayers.reduce((sum, p) => sum + p.bet, 0);
      if (totalBets > 0) {
        this.pots.push({
          amount: totalBets,
          eligibleSeats: activePlayers.filter(p => !p.folded).map((p) => p.seatId),
        });
      }
    }

    // Reset player bets
    for (const player of this.players.values()) {
      player.bet = 0;
    }
  }

  /**
   * Award pot to a single winner (everyone else folded)
   */
  private awardPotToWinner(winner: Player): void {
    this.collectBets();

    const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);
    winner.stack += totalPot;

    this.phase = 'ended';
    this.currentSeat = -1;
    this.seq++;
  }

  /**
   * Resolve showdown and award pots
   */
  private resolveShowdown(): void {
    this.phase = 'showdown';

    const activePlayers = this.getActivePlayers();

    // Evaluate all hands
    const hands: { player: Player; evaluation: HandEvaluation }[] = [];
    for (const player of activePlayers) {
      const evaluation = evaluateHand(player.holeCards, this.communityCards);
      hands.push({ player, evaluation });
    }

    // Award each pot
    for (const pot of this.pots) {
      const eligibleHands = hands.filter((h) => pot.eligibleSeats.includes(h.player.seatId));

      if (eligibleHands.length === 0) continue;

      // Sort by hand strength
      eligibleHands.sort((a, b) => compareHands(b.evaluation, a.evaluation));

      // Find winners (could be ties)
      const bestHand = eligibleHands[0]!.evaluation;
      const winners = eligibleHands.filter((h) => compareHands(h.evaluation, bestHand) === 0);

      // Split pot among winners
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount % winners.length;

      for (let i = 0; i < winners.length; i++) {
        const winner = winners[i]!;
        winner.player.stack += share + (i === 0 ? remainder : 0);
      }
    }

    this.phase = 'ended';
    this.currentSeat = -1;
    this.seq++;
  }

  /**
   * Get hand complete payload for broadcasting
   */
  getHandCompletePayload(): HandCompletePayload | null {
    if (this.phase !== 'ended' && this.phase !== 'showdown') {
      return null;
    }

    const activePlayers = this.getActivePlayers();
    const showdown = activePlayers.length > 1;

    const results: HandResult[] = [];
    for (const player of this.getAllPlayers()) {
      if (player.isActive) {
        let handRank: string | undefined;
        if (showdown && player.holeCards.length > 0 && this.communityCards.length === 5) {
          const evaluation = evaluateHand(player.holeCards, this.communityCards);
          handRank = evaluation.description;
        }

        // Calculate winnings (this is simplified - would need to track per player)
        const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);

        results.push({
          seatId: player.seatId,
          agentId: player.agentId,
          holeCards: player.holeCards,
          handRank,
          winnings: !player.folded && activePlayers.length === 1 ? totalPot : 0,
        });
      }
    }

    return {
      handNumber: this.handNumber,
      results,
      finalPots: this.pots,
      communityCards: this.communityCards,
      showdown,
    };
  }

  /**
   * Get current game state for a specific seat (with hole cards)
   */
  getStateForSeat(seatId: number): GameStatePayload {
    const players: PlayerState[] = this.getAllPlayers().map((p) => ({
      seatId: p.seatId,
      agentId: p.agentId,
      agentName: p.agentName,
      stack: p.stack,
      bet: p.bet,
      folded: p.folded,
      allIn: p.allIn,
      isActive: p.isActive,
      holeCards: p.seatId === seatId ? p.holeCards : null,
    }));

    const isMyTurn = this.currentSeat === seatId;
    const player = this.players.get(seatId);
    const toCall = player ? this.currentBet - player.bet : 0;

    return {
      tableId: this.config.tableId,
      handNumber: this.handNumber,
      phase: this.phase,
      communityCards: this.communityCards,
      pots: this.pots,
      players,
      dealerSeat: this.dealerSeat,
      currentSeat: this.currentSeat >= 0 ? this.currentSeat : null,
      lastAction: this.lastAction,
      legalActions: isMyTurn ? this.getLegalActions(seatId) : null,
      minRaise: this.minRaise,
      toCall: toCall > 0 ? toCall : undefined,
      seq: this.seq,
    };
  }

  /**
   * Get public game state (no hole cards)
   */
  getPublicState(): GameStatePayload {
    const players: PlayerState[] = this.getAllPlayers().map((p) => ({
      seatId: p.seatId,
      agentId: p.agentId,
      agentName: p.agentName,
      stack: p.stack,
      bet: p.bet,
      folded: p.folded,
      allIn: p.allIn,
      isActive: p.isActive,
      holeCards: null,
    }));

    return {
      tableId: this.config.tableId,
      handNumber: this.handNumber,
      phase: this.phase,
      communityCards: this.communityCards,
      pots: this.pots,
      players,
      dealerSeat: this.dealerSeat,
      currentSeat: this.currentSeat >= 0 ? this.currentSeat : null,
      lastAction: this.lastAction,
      legalActions: null,
      minRaise: this.minRaise,
      seq: this.seq,
    };
  }

  /**
   * Get the seed used for the current hand
   */
  getHandSeed(): string {
    return this.handSeed;
  }

  /**
   * Get dealer seat
   */
  getDealerSeat(): number {
    return this.dealerSeat;
  }

  /**
   * Get blinds config
   */
  getBlinds(): { small: number; big: number } {
    return this.config.blinds;
  }

  /**
   * Get config
   */
  getConfig(): TableRuntimeConfig {
    return this.config;
  }
}
