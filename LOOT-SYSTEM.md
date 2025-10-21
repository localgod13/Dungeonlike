# Battle Loot & Reward System

## Overview
After each battle victory, players are shown a loot screen where they receive gold and can select one card from 3 options to add to their persistent deck. The system tracks gold and cards across battles throughout the run.

## Features

### 1. **Gold Rewards** 💰
- **Base Gold:** 50 per battle
- **Stage Bonus:** +10 gold per stage
- **Random Variance:** 0-20 additional gold
- **Formula:** `50 + (stage * 10) + random(0-20)`

**Examples:**
- Stage 1: 50-70 gold
- Stage 5: 100-120 gold
- Stage 10: 150-170 gold

### 2. **Card Selection** 🃏
Players choose **1 card from 3 options**:
- **Slot 1:** Always a **consumable item** (health potion, damage potion, etc.)
- **Slot 2:** Random card (class-specific or reusable neutral item)
- **Slot 3:** Random card (class-specific or reusable neutral item)

### 3. **Inventory System** 📦
Tracks player resources across battles:
- **Gold:** Cumulative throughout the run
- **Permanent Deck:** Cards that persist (reusable items, class cards)
- **Consumables:** Limited-use items with counts

## Implementation

### Files Created

#### **`src/scenes/LootScene.ts`**
Post-battle loot screen with:
- Victory banner
- Gold reward display (shows gained + total)
- 3 card options displayed as interactive cards
- Selection system (click to select, scales up, gold border)
- Continue button (enabled only after selection)
- Card visual distinction (attack=red, defense=blue, magic=purple, neutral=gray)
- Consumable badge warning

#### **`src/game/inventory.ts`**
Inventory management system:
- `initializeInventory(playerId)` - Set up empty inventory
- `addGold(playerId, amount)` - Grant gold reward
- `getGold(playerId)` - Get current gold balance
- `addCardToDeck(playerId, card)` - Add card to deck or consumables
- `removeConsumable(playerId, cardId)` - Use consumable (decrements count)
- `getPermanentDeck(playerId)` - Get persistent cards
- `getConsumables(playerId)` - Get consumable counts
- `clearAllInventories()` - Reset on new run

### Files Modified

#### **`src/scenes/BattleScene.ts`**
- Added `calculateGoldReward(stage)` method
- Changed victory flow to transition to `LootScene` instead of directly to `MapScene`
- Passes gold reward, map state, and stage info to `LootScene`

```typescript
private calculateGoldReward(stage: number): number {
  const baseGold = 50;
  const stageBonus = stage * 10;
  const variance = Math.floor(Math.random() * 21); // 0-20
  return baseGold + stageBonus + variance;
}
```

#### **`src/scenes/CardSelectScene.ts`**
- Imported inventory system
- Clears all inventories on new run (alongside ultimate power reset)
- Initializes inventory for all players at start of card selection

```typescript
const isNewRun = !data.visitedNodes || data.visitedNodes.length === 0;
if (isNewRun) {
  clearPersistedUltimatePower();
  clearAllInventories(); // ← NEW
  console.log('🆕 New run detected');
}

// Initialize inventory for all players
this.players.forEach(player => {
  initializeInventory(player.userId);
});
```

#### **`src/main.ts`**
- Registered `LootScene` in scene list
- Order: `[..., BattleScene, LootScene, MapScene, ...]`

## Flow Diagram

```
┌─────────────┐
│  MapScene   │
│ (Click node)│
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ CardSelectScene │
│  (Pick 10 cards)│
└──────┬──────────┘
       │
       ▼
┌──────────────┐
│ BattleScene  │
│   (Combat)   │
└──────┬───────┘
       │ Victory
       ▼
┌──────────────────┐
│   LootScene      │
│  💰 +60 Gold     │
│  (Pick 1 card)   │
│  [Card] [Card] [Card]
└──────┬───────────┘
       │
       ▼
┌─────────────┐
│  MapScene   │  ← Gold & card saved!
│  (Continue) │
└─────────────┘
```

## Card Selection Algorithm

```typescript
generateCardOptions(): Card[] {
  const options: Card[] = [];
  
  // 1. Always add 1 consumable
  const randomConsumable = random(NEUTRAL_CONSUMABLE_ITEMS);
  options.push(randomConsumable);
  
  // 2. Add 2 more cards from class + reusable pool
  const allPossible = [...classCards, ...reusableItems];
  const remaining = allPossible.filter(c => c.id !== randomConsumable.id);
  
  // Shuffle and pick 2
  shuffle(remaining);
  options.push(...remaining.slice(0, 2));
  
  return options;
}
```

## Inventory Storage

### Data Structure
```typescript
interface PlayerInventory {
  gold: number;
  permanentDeck: Card[];
  consumables: Map<string, number>; // cardId -> count
}
```

### Storage Location
- **In-memory:** Stored in `Map<playerId, PlayerInventory>`
- **Lifetime:** Persists throughout the run (cleared on new run)
- **Scope:** Per-player, across all scenes

### Card Types
1. **Permanent Cards** (added to deck, usable every battle):
   - Class-specific cards (Slash, Arrow Shot, Fireball, etc.)
   - Reusable neutral items (Firebomb, Poison Dart, etc.)

2. **Consumables** (limited uses, tracked by count):
   - Greater Health Potion
   - Damage Potion
   - Shield Potion
   - Explosive Vial
   - Ultimate Elixir
   - Revive Crystal

## UI Details

### LootScene Layout
```
┌────────────────────────────────────┐
│          🎉 Victory! 🎉             │
│     💰 +60 Gold (Total: 180)       │
│  Choose 1 card to add to your deck:│
│                                    │
│  ┌────┐   ┌────┐   ┌────┐         │
│  │Card│   │Card│   │Card│         │
│  │ 1  │   │ 2  │   │ 3  │         │
│  │[⚠]│   │    │   │    │         │
│  └────┘   └────┘   └────┘         │
│                                    │
│       [Continue to Map]            │
└────────────────────────────────────┘
```

### Card Display
- **Background Color:** Varies by type (red/blue/purple/gray)
- **AP Cost:** Gold badge in top-left
- **Name:** Bold text in header
- **Description:** Wrapped text in center
- **Consumable Badge:** "⚠️ Consumable" label if applicable
- **Selection:** Scales to 1.1x, gold border (0xffd700)

## Future Enhancements

### Planned Features
1. **Gold Display in HUD** - Show current gold during battles/map
2. **Shop Integration** - Use gold to buy items in shop nodes
3. **Deck Management UI** - View/remove cards from deck
4. **Rarity System** - Common/Rare/Epic/Legendary cards with different probabilities
5. **Card Upgrade System** - Spend gold to upgrade existing cards
6. **Duplicate Handling** - Prevent offering cards already in deck
7. **Consumable Display** - Show consumable counts in battle UI
8. **Save/Load** - Persist inventory to database between sessions

### Possible Improvements
- **Reroll Option** - Spend gold to reroll card options
- **Skip Option** - Take extra gold instead of a card
- **Batch Rewards** - Show all loot at once (gold + card simultaneously)
- **Animations** - Card flip reveal, gold counter animation
- **Sound Effects** - Coin jingle, card selection sound
- **Tooltips** - Hover info for card mechanics

## Testing Checklist

### Gold System
- [ ] Gold awarded correctly based on stage
- [ ] Gold total displays in LootScene
- [ ] Gold persists between battles
- [ ] Gold resets on new run

### Card Selection
- [ ] Always get 1 consumable option
- [ ] Get 2 additional random cards
- [ ] Cannot select duplicate cards in same offer
- [ ] Card selection saves to inventory
- [ ] Permanent cards added to deck
- [ ] Consumables tracked by count

### Inventory Persistence
- [ ] Inventory persists across battles (same run)
- [ ] Inventory clears on new run (stage 1, no visited nodes)
- [ ] All players have separate inventories
- [ ] Consumable counts track correctly

### UI/UX
- [ ] Cards display correctly (name, AP, desc, type color)
- [ ] Card selection visual feedback (scale, border)
- [ ] Continue button disabled until card selected
- [ ] Continue button enabled after selection
- [ ] Transition to MapScene works correctly
- [ ] Gold reward formula correct (50 + stage*10 + variance)

## Known Issues
- **No visual indication of existing cards** - Players might select cards they already have
- **No duplicate prevention** - Same card can be offered multiple times across battles
- **No deck size limit** - Deck can grow indefinitely
- **No shop integration yet** - Gold has no use outside future shop visits
- **Consumables not usable yet** - Need to integrate with deck/hand system in battle

## Integration Points

### With Battle System
- `BattleScene.calculateGoldReward()` → `LootScene.goldReward`

### With Inventory System
- `LootScene.create()` → `addGold(playerId, amount)`
- `LootScene.selectCard()` → `addCardToDeck(playerId, card)`

### With Deck System (TODO)
- Need to integrate `getPermanentDeck()` with card selection
- Need to add consumables to battle hand
- Need to track consumable usage in `DeckState`

## Summary

✅ **Implemented:**
- Gold reward calculation (stage-based)
- LootScene UI with card selection
- Inventory system (gold + deck tracking)
- Scene flow (Battle → Loot → Map)
- Consumable vs Permanent card distinction
- New run reset logic

⏳ **Pending:**
- Shop integration (spend gold)
- Consumable usage in battle
- Deck management UI
- Duplicate card prevention
- Rarity/upgrade systems

