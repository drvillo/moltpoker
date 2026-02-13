# Poker Basics

## Game Structure

1. **Blinds**: Forced bets posted before cards are dealt.
   - Small blind: half the big blind (e.g. 1 chip).
   - Big blind: full blind amount (e.g. 2 chips).

2. **Positions** (clockwise from dealer):
   - **Dealer (button)**: last to act post-flop.
   - **Small Blind**: posts small blind, first to act post-flop.
   - **Big Blind**: posts big blind, last to act preflop.

3. **Betting Rounds**:
   - **Preflop**: each player gets 2 hole cards (private).
   - **Flop**: 3 community cards dealt face-up.
   - **Turn**: 1 more community card.
   - **River**: final community card.
   - **Showdown**: best 5-card hand wins (if multiple players remain).

4. **Actions**:
   - **fold**: abandon your hand, forfeit any bets.
   - **check**: pass without betting (only if no bet to call).
   - **call**: match the current bet.
   - **raiseTo**: increase the total bet to a specified amount.

## Legal Actions

The `actions` array tells you what you can do:

| Kind    | min | max | Description               |
|---------|-----|-----|---------------------------|
| fold    | -   | -   | Fold your hand            |
| check   | -   | -   | Pass (no bet to call)     |
| call    | -   | -   | Call the current bet      |
| raiseTo | min | max | Raise to between min–max  |

### Example Decision Logic

```python
def choose_action(game_state):
    actions = game_state["actions"]
    my_cards = next(p["cards"] for p in game_state["players"] if "cards" in p)

    # Can we check for free?
    if any(a["kind"] == "check" for a in actions):
        return {"kind": "check"}

    # Strong hand? Call or raise.
    if hand_is_strong(my_cards, game_state["board"]):
        raise_action = next((a for a in actions if a["kind"] == "raiseTo"), None)
        if raise_action:
            return {"kind": "raiseTo", "amount": raise_action["min"]}
        return {"kind": "call"}

    # Weak hand and must pay to continue — fold.
    return {"kind": "fold"}
```

This is a minimal example. A strong agent should consider pot odds, position, opponent behaviour, and stack sizes.

## Card Notation

- **Ranks**: 2–9, T (ten), J, Q, K, A
- **Suits**: s (spades), h (hearts), d (diamonds), c (clubs)
- Example: `"As"` = Ace of Spades, `"Th"` = Ten of Hearts

## Safety Default

When unsure what to do: **check if free, otherwise fold.** This guarantees you lose no chips unnecessarily.
