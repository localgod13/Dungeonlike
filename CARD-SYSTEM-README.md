# Card System Implementation

## Overview

The card system adds a **pre-battle card selection phase** followed by an **AP-based in-battle card mechanic**. Players choose up to 4 cards from a shared pool before each battle, then play those cards during combat by spending AP (Action Points).

## Game Loop

### 1. **Lobby → Card Selection**
- Host starts the game from the lobby
- All players transition to `CardSelectScene`

### 2. **Card Selection Phase** (`CardSelectScene`)
- Players see the shared **card pool** (6 cards available)
- Each player can **pick up to 4 cards** for their loadout
- If at max capacity (4 cards), players can **swap** by clicking a pool card, then clicking a loadout slot
- A **Ready** button appears; players toggle it when satisfied
- When **all players are ready**, the host commits the loadouts
- All players transition to `BattleScene` with their chosen loadouts

### 3. **Battle Phase** (`BattleScene`)
- Players start with **5 AP**
- Each round, AP **refills by +5** (capped at **10 AP max**)
- Players' **4-card hand** is displayed at the bottom of the screen
- Cards are **enabled/disabled** based on whether the player can afford them
- Players select a card, choose a target (if required), and **lock** their action
- When all players lock, the host resolves the turn
- **AP is deducted** when a card is played
- After resolution, a new planning phase begins with **AP refresh**

### 4. **Battle End**
- When combat ends (victory/defeat), players return to the lobby
- The next battle starts fresh with **card selection** again

## Card Catalog

Cards are defined in `src/game/cards.ts`:

| Card | AP Cost | Target | Opcode | Power | Description |
|------|---------|--------|--------|-------|-------------|
| **Strike** | 3 | enemy | DMG | 6 | Deal 6 damage |
| **Guard** | 2 | ally | GUARD | 3 | Give 3 Shield |
| **Mend** | 3 | ally | HEAL | 6 | Heal 6 HP |
| **Weaken** | 2 | enemy | VULN | 2 | Apply 2 Vulnerable (this turn) |
| **Bash** | 4 | enemy | STUN | 1 | Stun target (skip next action) |
| **Nova** | 5 | all_enemies | AOE_DMG | 4 | Deal 4 to all enemies |

## AP Economy

Rules defined in `src/game/economy.ts`:

- **Starting AP**: 5
- **AP per Round**: +5
- **AP Cap**: 10
- Cards are **grayed out** when unaffordable
- Attempting to play an unaffordable card shows **"Not enough AP!"**

## File Structure

### New Files Created
```
src/
  game/
    cards.ts            # Card catalog & types
    economy.ts          # AP rules & helpers
  ui/
    cardSelectUi.ts     # Pre-battle card selection UI
    handUi.ts           # In-battle card hand display
  scenes/
    CardSelectScene.ts  # Card selection phase scene
  net/
    proto.ts            # Updated: Card/Loadout messages
    match.ts            # Updated: Selection network helpers
```

### Modified Files
```
src/
  main.ts              # Added CardSelectScene to scene list
  scenes/
    Lobby.ts           # Changed: start CardSelectScene instead of BattleScene
    BattleScene.ts     # Integrated: loadouts, AP tracking, HandUI, card actions
  game/
    combat.ts          # Added: Card action handling & opcodes
```

## Key Components

### **CardSelectScene**
- Manages pre-battle card selection
- Tracks player loadouts and ready states
- Broadcasts picks/swaps/ready via Supabase channels
- Host commits when all ready, transitions to battle

### **HandUI**
- Displays player's 4-card loadout during battle
- Shows AP cost on each card
- Enables/disables cards based on current AP
- Handles card selection and visual feedback

### **BattleScene (Updated)**
- Accepts `loadouts` from CardSelectScene
- Tracks `playerAP` Map (userId → AP)
- Creates HandUI if loadout exists
- Validates AP before locking card actions
- Deducts AP when cards are played
- Refreshes AP at start of each round

### **Combat Resolution**
- Card actions pass `cardId` in `ActionPlan`
- `resolveTurn()` reads card opcode and executes:
  - **DMG**: Standard damage (respects guard)
  - **HEAL**: Restore HP (capped at maxHp)
  - **GUARD**: Reduce incoming damage
  - **VULN**: Show VFX (damage multiplier not yet implemented)
  - **STUN**: Show VFX (skip action not yet implemented)
  - **AOE_DMG**: Damage all enemies with staggered animations

## Testing

1. **Start Lobby** → Create/join lobby with 2+ players
2. **All Ready** → Host starts game
3. **Card Selection** → Each player picks 4 cards
4. **All Ready** → Transitions to battle
5. **Battle** → Play cards, verify AP deduction/refresh
6. **Verify** → Cards cost AP, disabled when unaffordable
7. **End Battle** → Return to lobby, next battle repeats selection

## Future Enhancements

- **Status Effects**: Implement Vulnerable/Stun mechanics in combat
- **More Cards**: Expand card pool with new opcodes
- **Card Rarity**: Add common/rare/epic tiers
- **Deck Building**: Persistent decks instead of per-battle selection
- **Card Upgrades**: Power-up cards during a run
- **Cooldowns**: Limit card usage per battle

---

**Implementation Complete**: All core features functional. Players can select cards, play them during battle, and manage AP across rounds. The system is fully multiplayer-synchronized via Supabase channels.

