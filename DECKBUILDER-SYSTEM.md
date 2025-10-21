# Deckbuilder System Implementation

## 🎴 **Overview**
The game now features a full deckbuilder system where players build a deck of 10 cards and draw 4 cards each turn.

---

## 🎯 **How It Works**

### **Card Selection Phase:**
1. Players choose **10 cards** from their class pool + neutral items
2. Cards are organized in **2 rows of 5 slots**
3. Available cards: **6 class-specific** + **6 neutral reusable items**

### **Battle Phase:**
1. **Deck is shuffled** at battle start
2. **Draw 4 cards** from the top of the deck
3. **Play cards** using AP during your turn
4. At **end of turn**, used cards go to discard pile
5. **Draw 4 new cards** at start of next turn
6. When deck is empty, **reshuffle discard pile** into deck

---

## 🃏 **Card Types**

### **Class-Specific Cards (6 per class):**
- ⚔️ **Warrior:** Slash, Shield Wall, Taunt, Heavy Strike, Defensive Stance, Cleave
- 🏹 **Huntress:** Arrow Shot, Multi-Shot, Piercing Arrow, Poison Arrow, Rapid Fire, Evasive Maneuver
- 🔥 **Mage:** Fireball, Flame Nova, Inferno, Burning Curse, Fire Shield, Meteor Strike

### **Neutral Reusable Items (6 total, charges per battle):**
1. **Firebomb** (4 AP) - 3 charges - Deal 8 damage to ALL + burn
2. **Poison Dart** (2 AP) - 4 charges - Deal 5 damage + poison
3. **Lightning Rod** (3 AP) - 2 charges - Gain 8 Shield + redirect attack
4. **Healing Salve** (3 AP) - 3 charges - Heal 12 HP + remove effect
5. **Berserker Potion** (4 AP) - 2 charges - All allies +4 damage
6. **Smoke Grenade** (3 AP) - 2 charges - Deal 6 damage to all + miss

### **Neutral Consumable Items (6 total, limited forever):**
1. **Greater Health Potion** (2 AP) - Heal 25 HP
2. **Damage Potion** (3 AP) - Deal 15 damage
3. **Shield Potion** (2 AP) - Give 10 Shield
4. **Explosive Vial** (4 AP) - Deal 12 damage to ALL
5. **Ultimate Elixir** (1 AP) - Gain 25% ultimate power
6. **Revive Crystal** (5 AP) - Revive dead ally at 75% HP

---

## 🔄 **Deck Mechanics**

### **Card Flow:**
```
Deck (6 cards) → Hand (4 cards) → Discard Pile (0 cards)
         ↓              ↓                    ↓
     Draw 4         Play cards         Accumulate used
         ↓              ↓                    ↓
   (empty?) → Yes → Reshuffle discard → Back to deck
```

### **Reusable Item Charges:**
- **Reset each battle** (not each turn)
- **Track charges** independently per item
- **Example:** Firebomb has 3 charges - can use 3 times total in battle

### **Consumable Items:**
- **Limited forever** - once used, gone permanently
- **Found as loot** from battles
- **Bought in shops** (future feature)
- **Removed from deck** when last one is used

---

## 🎮 **Strategic Depth**

### **Deck Building:**
- Mix **cheap cards** for consistency
- Include **expensive cards** for power plays
- Balance **offense** and **defense**
- Add **neutral items** for versatility

### **In-Battle Decisions:**
- **When to use** reusable items (limited charges)
- **Save consumables** for tough fights
- **AP management** - play multiple cheap cards or one expensive
- **Card draw planning** - knowing what's left in deck

### **Resource Management:**
- **Reusable charges** reset each battle
- **Consumables** are precious and permanent
- **AP accumulates** between rounds (max 30)
- **Ultimate power** carries between battles

---

## 📊 **Technical Implementation**

### **Files Modified:**
1. **`src/game/cards.ts`** - Added neutral items (reusable + consumable)
2. **`src/game/deck.ts`** - New deck management system
3. **`src/ui/cardSelectUi.ts`** - Updated to 10 card slots (2 rows of 5)
4. **`src/scenes/CardSelectScene.ts`** - Uses getAllAvailableCardsForClass()
5. **`src/scenes/BattleScene.ts`** - Deck drawing and hand UI updates

### **Key Functions:**
- **`createDeck(cardIds)`** - Initialize deck, shuffle, draw initial hand
- **`drawCards(state)`** - Draw 4 cards, reshuffle if needed
- **`playCard(state, cardId)`** - Track card usage, consume charges
- **`resetReusableCharges(state)`** - Reset charges for new battle
- **`canPlayCard(state, cardId)`** - Check if card is playable

---

## 🚀 **Future Enhancements**

### **Loot System:**
- Drop consumable items after battles
- Rarity tiers for loot drops
- Boss battles drop better items

### **Shop Integration:**
- Buy consumable items with gold
- Sell unwanted items
- Special item deals

### **Progression:**
- Unlock new class cards
- Find rare neutral items
- Upgrade existing cards

---

## 🎯 **Balance Considerations**

### **Reusable Items:**
- **Charges prevent spam** - can't use same item every turn
- **AP costs** create strategic choices
- **Reset each battle** - consistent power level

### **Consumable Items:**
- **Forever limited** - creates tension and value
- **High impact** - worth using in tough situations
- **Found as loot** - reward for progression

### **Deck Size:**
- **10 cards** provides variety without overwhelming
- **4 card hand** is manageable and strategic
- **Cycling every turn** keeps gameplay dynamic

---

## 📝 **Example Battle Flow**

### **Turn 1:**
```
Deck: 6 cards
Hand: [Slash, Firebomb, Poison Dart, Shield Wall]
AP: 5

Actions:
- Play Poison Dart (2 AP) → 3 AP left
- Play Slash (3 AP) → 0 AP left
- End Turn

Discard: [Poison Dart, Slash]
```

### **Turn 2:**
```
Draw 4 new cards
Deck: 2 cards
Hand: [Heavy Strike, Healing Salve, Arrow Shot, Firebomb]
Discard: [Poison Dart, Slash]
AP: 5 (refreshed)

Actions:
- Play Firebomb (4 AP) → 1 AP left
- Save AP for next turn
- End Turn

Discard: [Poison Dart, Slash, Firebomb]
```

### **Turn 3:**
```
Draw 4 new cards (deck empty → reshuffle discard)
Deck: 3 cards (reshuffled from discard)
Hand: 4 new cards
AP: 6 (1 saved + 5 refresh)
```

---

This system transforms the game into a **roguelike deckbuilder** with meaningful progression, strategic deck construction, and dynamic in-battle decisions!

