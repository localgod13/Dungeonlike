# Inventory Integration - Cards & Gold Carry Over

## Overview
This update integrates the inventory system with the game loop, ensuring that collected cards and gold persist across battles and are visible/usable throughout the run.

## What Was Fixed

### Problem
- Gold and cards collected from loot were stored in inventory but NOT shown in card selection
- Players couldn't use consumables they collected
- Gold wasn't visible during gameplay
- No indication of consumable counts

### Solution
Cards and gold now **fully integrate** with the game:
1. **Card Selection** shows all collected cards (permanent + consumables)
2. **Gold displays** in Card Selection and Map scenes
3. **Consumable counts** shown with red badges (e.g., "x3")
4. **Inventory persists** across battles throughout the run

---

## Implementation Details

### 1. **CardSelectScene Integration**

#### Added Collected Cards to Pool
```typescript
// Get base cards (class-specific + neutral reusable)
const baseCardPool = getAllAvailableCardsForClass(playerClass);

// Get collected permanent cards from inventory
const collectedCards = getPermanentDeck(this.userId);

// Get consumables with counts
const consumables = getConsumables(this.userId);
const consumableCards = Array.from(consumables.entries())
  .map(([cardId, count]) => {
    const card = getCardById(cardId);
    return card ? { ...card, consumableCount: count } : null;
  })
  .filter(c => c !== null);

// Combine ALL available cards
const classCardPool = [
  ...baseCardPool,      // 6 class cards + 6 neutral reusable
  ...collectedCards,    // Cards collected from loot
  ...consumableCards    // Consumables with counts
];
```

**Result:** All collected cards now appear in the card pool for selection!

#### Added Gold Display
```typescript
const playerGold = getGold(this.userId);
this.add.text(width - 20, 20, `💰 ${playerGold} Gold`, {
  fontSize: '28px',
  fontFamily: 'Arial Black',
  color: '#ffd700',
  stroke: '#000000',
  strokeThickness: 4,
}).setOrigin(1, 0);
```

**Location:** Top-right corner of Card Selection screen

---

### 2. **MapScene Integration**

#### Added Gold Display
```typescript
if (this.userId) {
  initializeInventory(this.userId); // Ensure exists
  const playerGold = getGold(this.userId);
  this.add.text(width - 20, 20, `💰 ${playerGold} Gold`, {
    fontSize: '28px',
    fontFamily: 'Arial Black',
    color: '#ffd700',
    stroke: '#000000',
    strokeThickness: 4,
  }).setOrigin(1, 0).setDepth(1000);
}
```

**Location:** Top-right corner of Map screen

---

### 3. **CardSelectUI - Consumable Badges**

#### Added Consumable Count Badges
Both in card pool AND loadout slots:

```typescript
// Consumable count badge (if applicable)
if ((card as any).consumableCount !== undefined) {
  const count = (card as any).consumableCount;
  const countBadge = this.scene.add.container(x, y);
  
  const countBg = this.scene.add.circle(0, 0, 18, 0xe74c3c, 1);
  countBg.setStrokeStyle(2, 0xffffff, 1);
  
  const countText = this.scene.add.text(0, 0, `x${count}`, {
    fontSize: '16px',
    color: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    fontStyle: 'bold',
  });
  
  // Add to card
}
```

**Visual:** Red circle badge in top-right corner with white "x3" text

---

## Files Modified

### **`src/scenes/CardSelectScene.ts`**
- Imported: `getPermanentDeck`, `getConsumables`, `getGold`, `getCardById`
- Combined base cards + collected cards + consumables into card pool
- Added gold display in top-right corner
- Cards with `consumableCount` property are passed to UI

### **`src/ui/cardSelectUi.ts`**
- Added consumable count badge to `createCardButton()` (card pool display)
- Added consumable count badge to `updateLoadoutSlot()` (selected deck display)
- Red badge with white "xN" text appears on consumable cards

### **`src/scenes/MapScene.ts`**
- Imported: `getGold`, `initializeInventory`
- Added gold display in top-right corner
- Ensures inventory is initialized for the player

---

## Visual Indicators

### Gold Display
```
┌────────────────────────────┐
│              💰 180 Gold  │ ← Top-right
│                            │
│   [Card Selection UI]      │
│                            │
└────────────────────────────┘
```

### Consumable Count Badge
```
Card Pool:
┌──────────────┐
│   AP: 2  x3 │ ← Red badge
│             │
│Health Potion│
│             │
│Heal 25 HP   │
└──────────────┘
```

### Card Selection View
```
Available Cards (Class + Neutral + Collected):
┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
│Slash│ │Arrow│ │Fire│ │Bomb│ │Dart│ │HP  │ ← 12+ cards
└────┘ └────┘ └────┘ └────┘ └────┘ └x3 ─┘   (including collected)

Your Deck (X/10):
┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
│    │ │    │ │    │ │    │ │    │
└────┘ └────┘ └────┘ └────┘ └────┘
┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
│    │ │    │ │    │ │    │ │    │
└────┘ └────┘ └────┘ └────┘ └────┘
```

---

## Game Flow

### Example Run:

**Battle 1:**
```
CardSelect: 12 cards available (6 class + 6 neutral)
  ↓
Battle: Win
  ↓
Loot: +60 gold, selected "Health Potion"
```

**Battle 2:**
```
CardSelect: 💰 60 Gold
            13 cards available (12 base + 1 potion x1)
  ↓
Battle: Win
  ↓
Loot: +70 gold, selected "Health Potion" again
```

**Battle 3:**
```
CardSelect: 💰 130 Gold
            13 cards available (12 base + 1 potion x2)
  ↓
Battle: Win
  ↓
Loot: +80 gold, selected "Lightning Rod"
```

**Battle 4:**
```
CardSelect: 💰 210 Gold
            14 cards available (12 base + potion x2 + Lightning Rod)
```

---

## Card Types in Pool

### Base Cards (Always Available)
1. **6 Class-Specific Cards** (Slash, Arrow Shot, Fireball, etc.)
2. **6 Neutral Reusable Items** (Firebomb, Poison Dart, Lightning Rod, etc.)

### Collected Cards (From Loot)
3. **Permanent Cards** - Added once, usable every battle
   - Additional class cards
   - Additional reusable items
   
4. **Consumables** - Limited use, shown with count
   - Health Potion x3
   - Damage Potion x1
   - Ultimate Elixir x2
   - Etc.

---

## Data Flow

```
LootScene (collect card)
    ↓
addCardToDeck(playerId, card)
    ↓
Inventory.permanentDeck.push(card)  OR
Inventory.consumables.set(cardId, count)
    ↓
CardSelectScene.create()
    ↓
getPermanentDeck() + getConsumables()
    ↓
Combined card pool displayed
    ↓
Player selects 10 cards
    ↓
Battle uses selected cards
```

---

## Key Features

### ✅ Implemented
- [x] Gold displays in Card Selection
- [x] Gold displays in Map
- [x] Collected cards appear in card pool
- [x] Consumables show with count badges
- [x] Red badge visual for consumables (xN)
- [x] Permanent cards vs consumables distinction
- [x] Inventory persists across battles
- [x] Inventory resets on new run

### ⏳ Pending
- [ ] Consumable usage in battle (decrement count)
- [ ] Disable consumable in card pool when count = 0
- [ ] Gold spending in shop
- [ ] Deck management UI (remove cards)
- [ ] Card upgrade system

---

## Testing Checklist

### Card Collection
- [ ] Win battle → receive card → card appears in next card selection
- [ ] Collect consumable → shows "x1" badge
- [ ] Collect same consumable again → shows "x2" badge
- [ ] Collect permanent card → appears without badge
- [ ] New run → inventory cleared → only base cards available

### Gold Display
- [ ] Gold displays in Card Selection (top-right)
- [ ] Gold displays in Map (top-right)
- [ ] Gold increases after each battle
- [ ] Gold persists across battles
- [ ] Gold resets on new run

### Visual
- [ ] Consumable badges appear in card pool
- [ ] Consumable badges appear in selected deck slots
- [ ] Red circle badge with white text
- [ ] Badge positioned in top-right of card
- [ ] Badge doesn't overlap with AP cost

---

## Known Issues
- **Consumables not decremented in battle yet** - Need to integrate with deck system
- **No duplicate prevention** - Can select same consumable multiple times in one deck
- **No card removal UI** - Can't remove cards from permanent collection
- **Gold not spendable yet** - Shop integration pending

---

## Summary

✅ **FIXED:** Cards and gold now carry over properly!

**Before:**
- Collected cards disappeared
- Gold invisible
- Consumables not shown
- No persistence

**After:**
- ✅ All collected cards appear in card selection
- ✅ Gold displays in Card Select & Map
- ✅ Consumables show count badges (x3, x2, etc.)
- ✅ Inventory persists throughout run
- ✅ Visual distinction for consumables

**Next Steps:**
- Implement consumable usage/decrement in battle
- Add shop integration for spending gold
- Create deck management UI

