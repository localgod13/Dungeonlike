# Stage Counter System

## 📊 **Feature**
Added a stage counter that tracks which battle number the players are on, displayed alongside the turn counter in battle.

---

## 🎯 **How It Works**

### **Stage Progression:**
```
Game Start → Map → Battle 1 (Stage 1) → Victory → Map
                → Battle 2 (Stage 2) → Victory → Map
                → Battle 3 (Stage 3) → Victory → Map
                → Shop (Stage 3) → Map
                → Battle 4 (Stage 4) → ...
```

**Stage increments ONLY for battles** (not shops or events)

---

## 🎨 **Visual Display**

### **Battle UI (Top Right):**
```
┌──────────────┐
│ Stage 1      │  ← Gold text
│ Turn 3       │  ← White text
└──────────────┘
```

**Position:**
- Stage: Top right corner, Y: 20px
- Turn: Below stage, Y: 45px
- Font: Bold with black stroke
- Stage color: Gold (#d4af37)
- Turn color: White (#ffffff)

---

## 🔄 **Stage Tracking Flow**

### **Full Scene Lifecycle:**

**Battle 1:**
```
Map (stage: 1)
  ↓
CardSelect (stage: 1)
  ↓
Battle (Stage 1 - Turn 1, 2, 3...)
  ↓ Victory
Map (stage: 1)
```

**Battle 2:**
```
Map (stage: 1)
  ↓ Click battle node → stage++
CardSelect (stage: 2)
  ↓
Battle (Stage 2 - Turn 1, 2, 3...)
  ↓ Victory
Map (stage: 2)
```

**Shop Visit:**
```
Map (stage: 2)
  ↓ Click shop node → stage unchanged
Shop (stage: 2)
  ↓
Map (stage: 2) ← Stage NOT incremented
```

---

## 📋 **Implementation Details**

### **Files Modified:**

1. **`src/scenes/BattleScene.ts`** ✅
   - Added `private currentStage = 1`
   - Receives stage from init data
   - Displays "Stage X" above turn counter
   - Passes stage back to MapScene on victory

2. **`src/scenes/MapScene.ts`** ✅
   - Added `private currentStage = 1`
   - Receives stage from init data
   - Increments stage when transitioning to battles
   - Passes stage to CardSelectScene, ShopScene, EventScene

3. **`src/scenes/CardSelectScene.ts`** ✅
   - Added `private currentStage = 1`
   - Receives stage from init data
   - Passes stage to BattleScene

4. **`src/scenes/ShopScene.ts`** ✅
   - Added `private currentStage = 1`
   - Receives and passes stage back to map
   - Stage unchanged (shops don't count)

5. **`src/scenes/EventScene.ts`** ✅
   - Added `private currentStage = 1`
   - Receives and passes stage back to map
   - Stage unchanged (events don't count)

---

## 💻 **Code Implementation**

### **Stage Variable:**
```typescript
private currentStage = 1; // Track which battle this is
```

### **Receive in init():**
```typescript
init(data: { ..., stage?: number }): void {
  this.currentStage = data.stage || 1;
  console.log(`Battle stage: ${this.currentStage}`);
}
```

### **Display in UI:**
```typescript
// Stage text (gold color)
const stageText = this.add.text(
  this.scale.width - 20, 20, 
  `Stage ${this.currentStage}`, 
  {
    fontSize: '18px',
    color: '#d4af37', // Gold
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 4,
  }
);

// Turn text (white, below stage)
const turnText = this.add.text(
  this.scale.width - 20, 45, 
  `Turn ${this.currentTurn}`, 
  { ... }
);
```

### **Increment for Battles:**
```typescript
// In MapScene transitionToNode()
case NodeType.Battle:
case NodeType.Boss:
  const nextStage = this.currentStage + 1; // Increment!
  this.scene.start('CardSelectScene', {
    ...,
    stage: nextStage,
  });
```

### **Maintain for Non-Battles:**
```typescript
case NodeType.Shop:
case NodeType.Event:
  this.scene.start('ShopScene', {
    ...,
    stage: this.currentStage, // Same stage, no increment
  });
```

### **Update UI:**
```typescript
private updateUI(): void {
  // Update stage text (index 0)
  const stageText = this.hudContainer.getAt(0);
  stageText.setText(`Stage ${this.currentStage}`);
  
  // Update turn text (index 1)
  const turnText = this.hudContainer.getAt(1);
  turnText.setText(`Turn ${this.currentTurn}`);
  
  // ... update phase ...
}
```

---

## 🎮 **Example Playthrough**

### **Run 1:**
```
Map → Battle Node → Card Select → Battle (Stage 1, Turns 1-5) → Victory
  → Map → Shop Node → Shop → Map
  → Map → Battle Node → Card Select → Battle (Stage 2, Turns 1-4) → Victory
  → Map → Event Node → Event → Map
  → Map → Battle Node → Card Select → Battle (Stage 3, Turns 1-6) → Victory
  → Map → Boss Node → Card Select → Battle (Stage 4, Turns 1-10) → Victory!
```

**Stage Increments:**
- First battle: Stage 1 ✅
- Shop: Still Stage 1 (no increment)
- Second battle: Stage 2 ✅
- Event: Still Stage 2 (no increment)
- Third battle: Stage 3 ✅
- Boss battle: Stage 4 ✅

---

## 📊 **Visual Hierarchy**

**Top Right Corner:**
```
┌────────────────┐
│ Stage 3    ← Gold, smaller (18px)
│ Turn 7     ← White, larger (20px)
└────────────────┘
```

**Design Reasoning:**
- Stage is context (which battle)
- Turn is immediate (current action)
- Gold color makes stage feel special/important
- Stacked vertically for clean readability

---

## 🔍 **Debug Logging**

**Battle Init:**
```
🔄 Resetting battle state for new battle...
📊 Stage 3 - Turn 1
=== BATTLE SCENE INIT DEBUG ===
Battle stage: 3
```

**Map Transition:**
```
Transitioning to battle... (Stage 4)
```

**Card Select:**
```
Card selection initialized for lobby: ...
Battle stage: 4
```

---

## 🎯 **Benefits**

- ✅ **Progress Tracking:** Players see how far they've progressed
- ✅ **Context Awareness:** Know if it's early or late game
- ✅ **Motivation:** Stage number shows accomplishment
- ✅ **Difficulty Scaling:** Can use stage for enemy difficulty later
- ✅ **Visual Clarity:** Easy to see at a glance

---

## 🚀 **Future Enhancements**

### **Easy to Add:**
```typescript
// Scale enemy difficulty by stage
const enemyHP = 50 + (this.currentStage * 10);

// Different enemies per stage
if (this.currentStage <= 2) {
  enemy = 'Slime';
} else if (this.currentStage <= 4) {
  enemy = 'Flying Demon';
} else {
  enemy = 'Boss';
}

// Stage-based rewards
const goldReward = 50 * this.currentStage;
```

---

## ✅ **Files Summary**

**Modified:**
- ✅ `src/scenes/BattleScene.ts` - Display stage, track stage
- ✅ `src/scenes/MapScene.ts` - Increment stage for battles
- ✅ `src/scenes/CardSelectScene.ts` - Pass stage through
- ✅ `src/scenes/ShopScene.ts` - Pass stage through (no increment)
- ✅ `src/scenes/EventScene.ts` - Pass stage through (no increment)

**Created:**
- ✅ `STAGE-COUNTER-SYSTEM.md` - This documentation

---

## 🎯 **Result**

The battle UI now shows:
```
Stage 1 ← First battle
Turn 1  ← First turn of that battle
```

After winning and selecting another battle:
```
Stage 2 ← Second battle
Turn 1  ← Fresh turn counter
```

Players can now track their progress through the dungeon! 📊✨

