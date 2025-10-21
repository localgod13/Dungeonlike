# Deck Cycling Fix

## 🐛 **Problems Fixed**

### **1. Card Selection Layout Issue**
**Problem:** Not enough space between available cards and selected deck slots

**Solution:**
- Moved available cards to top with clear "═══ AVAILABLE CARDS ═══" header
- Moved selected deck to bottom with "═══ YOUR DECK (X/10) ═══" header
- Better vertical spacing for 12 selectable cards + 10 deck slots

### **2. Deck Cycling Bug - Cards Repeating Too Often**
**Problem:** Cards appearing multiple times in consecutive draws

**Root Cause:**
```
Turn 1: Draw 4 (6 left in deck)
Turn 2: Discard 4 → Draw 4 (2 left in deck)  
Turn 3: Discard 4 → Draw 2 from deck → Deck empty → Need 2 more but discard only has 4!
        BUG: Would only reshuffle AFTER trying to draw, causing issues
```

**Solution:**
The `drawCards()` function now properly handles mid-draw reshuffling:

```typescript
while (cardsDrawn < 4) {
  // Check if deck is empty BEFORE each draw attempt
  if (state.deck.length === 0 && state.discardPile.length > 0) {
    // Reshuffle discard pile back into deck
    state.deck = [...state.discardPile];
    state.discardPile = [];
    shuffleDeck(state.deck);
  }
  
  // Draw one card
  const card = state.deck.shift();
  if (card) {
    state.hand.push(card);
    cardsDrawn++;
  }
}
```

---

## ✅ **Proper Deck Cycling Flow**

### **Example with 10-card deck:**

**Turn 1 (Battle Start):**
```
Deck: [1,2,3,4,5,6,7,8,9,10] (shuffled)
Draw 4 → Hand: [1,2,3,4]
Remaining: Deck=[5,6,7,8,9,10], Discard=[]
```

**Turn 2:**
```
Discard hand → Discard=[1,2,3,4]
Draw 4 from deck → Hand: [5,6,7,8]
Remaining: Deck=[9,10], Discard=[1,2,3,4]
```

**Turn 3 (Reshuffle happens mid-draw):**
```
Discard hand → Discard=[1,2,3,4,5,6,7,8]
Draw 2 from deck → Hand: [9,10]
Deck empty! Reshuffle discard → Deck=[3,7,1,5,2,8,4,6] (shuffled)
Draw 2 more → Hand: [9,10,3,7]
Remaining: Deck=[1,5,2,8,4,6], Discard=[]
```

**Turn 4:**
```
Discard hand → Discard=[9,10,3,7]
Draw 4 from deck → Hand: [1,5,2,8]
Remaining: Deck=[4,6], Discard=[9,10,3,7]
```

---

## 🎯 **Benefits**

### **Card Variety:**
- Cards cycle through the entire deck before reshuffling
- Minimal repeats in consecutive draws
- Proper Fisher-Yates shuffle ensures randomness

### **Predictable Pattern:**
With 10 cards, drawing 4 per turn:
- **Turn 1:** Draw 4 (6 left)
- **Turn 2:** Draw 4 (2 left)
- **Turn 3:** Draw 2, reshuffle 4, draw 2 more
- **Turn 4:** Draw 4 (2 left)
- **Turn 5:** Draw 2, reshuffle 4, draw 2 more
- Pattern repeats...

### **Debug Logging:**
Added comprehensive logging to track:
- When reshuffles occur
- Hand contents after each draw
- Deck/discard pile sizes
- Easy to debug any future issues

---

## 🔍 **Testing Verification**

Watch the console logs during battle to verify:
```
[Deck] === DRAW PHASE START ===
[Deck] Before: Hand=4, Deck=2, Discard=4
[Deck] Moved hand to discard. Deck=2, Discard=8
[Deck] Drew 2 cards
[Deck] 🔄 Deck empty! Reshuffling discard pile...
[Deck] ✓ Reshuffled 8 cards back into deck
[Deck] Drew 2 more cards
[Deck] Final: Hand=4, Deck=6, Discard=0
[Deck] Hand contents: ['Slash', 'Firebomb', 'PoisonDart', 'ShieldWall']
```

The system now properly cycles through your entire deck before repeating cards! 🎴✨

