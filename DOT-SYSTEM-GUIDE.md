# DOT (Damage Over Time) System Guide

## 🎯 How DOT Effects Work

### Expected Behavior

**Turn 1 - Apply Poison/Curse:**
- Player plays **Poison Arrow** or **Burning Curse** on an enemy
- Visual effect shows poison/burn being applied
- **NO DAMAGE on this turn** - DOT is just applied
- DOT status stored: `{damage: 2-3, duration: 2, source: player, type: 'poison'/'burn'}`

**Turn 2 - First DOT Tick:**
- At the **START** of Turn 2 (before any actions)
- Enemy takes poison/burn damage automatically
- Visual effect shows poison/burn + damage number
- Duration decrements: 2 → 1
- DOT persists for next turn

**Turn 3 - Second DOT Tick:**
- At the **START** of Turn 3
- Enemy takes poison/burn damage again
- Duration decrements: 1 → 0
- DOT expires and is removed

**Turn 4 - No More DOT:**
- Enemy is free from the effect
- No more automatic damage

---

## 🔍 Debug Logging

### When Applying DOT (Turn 1):
```
[Combat] ✨ Player applies Poison Arrow to Enemy!
[Combat] 🔮 DOT Effect: 2 poison damage per turn for 2 turns
[Combat] 📊 Total DOTs on Enemy: 1
```

### When DOT Ticks (Turn 2+):
```
[Combat] 🔥 DOT Tick Phase - Turn X
[Combat] 📋 Total actors with DOTs: 1
[Combat] 🎯 Processing DOTs for Enemy (1 effects)
[Combat] ☠️ Applying poison DOT to Enemy: 2 damage (2 turns remaining)
[Combat] 💚 Enemy HP before DOT: 50/100
[Combat] ❤️ Enemy HP after DOT: 48/100
[Combat] ⏱️ poison duration decremented to: 1
[Combat] 🧹 Cleaning DOTs for Enemy: 1 -> 1
```

### BattleScene Persistence:
```
📦 Received payload.dots: [...]
🔮 Deserializing DOTs for actor enemy_1: [...]
✅ DOT effects persisted for next turn: [['enemy_1', [...]]]
```

---

## 🃏 DOT Cards

### Poison Arrow (Huntress)
- **Cost:** 3 AP
- **Effect:** Poison: 4 damage per turn for 2 turns
- **Total Damage:** 8 (4 damage × 2 turns)
- **Type:** poison (green visual)

### Burning Curse (Mage)
- **Cost:** 3 AP
- **Effect:** Curse: 5 burn damage per turn for 2 turns
- **Total Damage:** 10 (5 damage × 2 turns)
- **Type:** burn (fire visual)

---

## ⚔️ Combat Mechanics

1. **DOT Phase Always First:** Every turn starts with DOT damage before any actions
2. **Stacking:** Multiple DOTs can be on the same target (each ticks independently)
3. **Source Attribution:** Damage is attributed to the player who applied the DOT
4. **Guard/Shield:** DOT damage can be blocked by shields (not implemented yet)
5. **Death:** If enemy dies from DOT, the effect is removed
6. **Persistence:** DOTs carry over between turns automatically via network sync

---

## 🐛 Testing DOT Effects

1. **Start a Battle** with Huntress or Mage class
2. **Select Poison Arrow** or **Burning Curse** in card selection
3. **Play the DOT card** on an enemy in Turn 1
4. **Watch Console Logs:**
   - Look for "✨ applies" message (application)
   - Look for "🔮 DOT Effect" details
5. **End Turn and Wait for Turn 2:**
   - Look for "🔥 DOT Tick Phase" message
   - Look for "☠️ Applying" message with damage
   - Verify enemy HP decreases
6. **Turn 3:**
   - DOT should tick again
   - Duration should reach 0
7. **Turn 4:**
   - No more DOT damage

---

## 🔧 Technical Details

### DOT Effect Structure
```typescript
interface DotEffect {
  damage: number;      // Damage per turn (2-3)
  duration: number;    // Remaining turns (starts at 2)
  source: ActorId;     // Player who applied it
  type: 'poison' | 'burn'; // Visual type
}
```

### Storage
- **CombatState:** `Map<ActorId, DotEffect[]>`
- **Network Payload:** Serialized as array of `{actorId, effects[]}`
- **Persistence:** Deserialized and restored in BattleScene after each turn

### Timing
- DOT tick phase: `tCursor = 0` (start of turn)
- Each DOT takes 600ms to animate
- Actions start after DOT phase completes

---

## ✅ Verification Checklist

- [ ] Poison/burn visual shows when card is played
- [ ] NO damage on the turn DOT is applied
- [ ] DOT damage shows on Turn 2 (next turn after application)
- [ ] DOT damage shows on Turn 3 (second tick)
- [ ] DOT expires after Turn 3 (no more ticks)
- [ ] Console logs show all DOT events
- [ ] Enemy HP decreases correctly each turn
- [ ] Multiple DOTs can stack on same target

---

If DOTs are still not working, check the console for:
1. Missing "✨ applies" logs = DOT not being created
2. Missing "📦 Received payload.dots" = Network sync issue
3. Missing "🔥 DOT Tick Phase" = Tick logic not running
4. "⚰️ Skipping DOTs" = Actor is dead or not found
5. "⏭️ Skipping expired" = Duration already 0

