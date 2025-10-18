# Battle Scene Reset Fix

## 🐛 **Problem**
When returning to the map and selecting another battle node, the battle scene would continue from the previous battle's turn number instead of starting fresh at Turn 1.

**Example Bug:**
```
Battle 1: Complete at Turn 5
→ Return to Map
→ Select new Battle node
→ Battle 2: Starts at Turn 6 ❌ (should be Turn 1!)
```

---

## 🔍 **Root Cause**

### **Scene Lifecycle Issue:**
Phaser scenes are **reused** by default. When you call `scene.start('BattleScene')`:
1. If the scene already exists, it calls `init()` then `create()`
2. **Class properties are NOT reset** - they keep their previous values
3. `currentTurn` was initialized as `private currentTurn = 1;` in the class
4. This only runs when the scene is **first instantiated**, not on subsequent starts

### **What Was Persisting:**
```typescript
// These were NOT being reset between battles:
private currentTurn = 1;          // ❌ Kept old turn number
private phase = 'planning';        // ❌ Could be stuck in 'resolving'
private isLocked = false;          // ❌ Could be stuck locked
private playerPlans = new Map();   // ❌ Had old actions
private queuedActions = [];        // ❌ Had old queued cards
private loadouts = new Map();      // ❌ Had old loadouts
private playerAP = new Map();      // ❌ Had old AP values
// ... and more!
```

---

## ✅ **Solution**

### **Comprehensive State Reset in init():**
Added complete state reset in the `init()` method so **every battle starts fresh**:

```typescript
init(data: { ... }): void {
  // ... receive data ...
  
  // 🔄 RESET ALL BATTLE STATE FOR FRESH BATTLE
  this.currentTurn = 1;                 // ✅ Always start at Turn 1
  this.phase = 'planning';              // ✅ Always start in planning
  this.isLocked = false;                // ✅ Not locked
  this.selectedAction = null;           // ✅ No pending actions
  this.selectedTarget = null;
  this.selectedCardId = null;
  this.pendingPostState = null;
  this.timeline = null;
  
  // Clear UI elements
  if (this.handUI) {
    this.handUI.destroy();
    this.handUI = null;
  }
  if (this.queueDisplay) {
    this.queueDisplay.destroy();
    this.queueDisplay = null;
  }
  if (this.lockButton) {
    this.lockButton.destroy();
    this.lockButton = null;
  }
  if (this.targetSelector) {
    this.targetSelector.destroy();
    this.targetSelector = null;
  }
  
  // Clear collections
  this.combatLogEntries = [];           // ✅ Fresh combat log
  this.playerPlans.clear();             // ✅ No old plans
  this.queuedActions = [];              // ✅ No queued cards
  this.loadouts.clear();                // ✅ Will be repopulated
  this.playerAP.clear();                // ✅ Will be repopulated
  this.statusEffectContainers.clear(); // ✅ No old status icons
  this.remoteCursors.clear();           // ✅ No old cursors
  this.partySlots = [];                 // ✅ Will be recreated
  this.enemySlots = [];                 // ✅ Will be recreated
  this.actionButtons = [];              // ✅ Will be recreated
  
  // ... then initialize fresh loadouts and AP ...
}
```

---

## 🎯 **What Gets Reset vs Persisted**

### **✅ RESET (Fresh Each Battle):**
- Current turn number → Always starts at 1
- Combat phase → Always starts in 'planning'
- Player actions/plans → Empty
- Queued card actions → Empty
- Lock state → Unlocked
- UI elements → Destroyed and recreated
- Status effects → Cleared
- Enemy state → Fresh enemies created
- DOT effects → None (fresh combat state)

### **✅ PERSISTED (Across Battles):**
- Map seed → Maintains same map structure
- Visited nodes → Map progression
- Current node position → Where you are on the map
- Player data (names, classes) → Your party composition
- Loadouts → From card selection for THIS battle

---

## 🎮 **Expected Flow**

### **Battle 1:**
```
Map → Select Battle Node → Card Selection → Battle (Turn 1-5) → Victory → Map
```

### **Battle 2:**
```
Map → Select Battle Node → Card Selection → Battle (Turn 1-X) → Victory → Map
                                                    ↑
                                            FRESH TURN 1! ✅
```

---

## 🔍 **Debug Logging**

You'll now see this on each battle start:
```
🔄 Resetting battle state for new battle...
✅ Battle state reset complete
=== BATTLE SCENE INIT DEBUG ===
🔄 Battle state RESET for fresh battle
Current Turn: 1
Phase: planning
...
```

---

## ✅ **Verification**

To verify the fix works:
1. Start a battle (Turn 1)
2. Complete the battle (e.g., Turn 5)
3. Return to map
4. Select another battle node
5. Go through card selection
6. Start new battle
7. **Check console:** Should show "Turn 1" not "Turn 6"
8. **Check UI:** Should show fresh combat log, fresh HP bars

---

## 🛠️ **Technical Details**

### **Scene Lifecycle:**
```
First Battle:
  BattleScene constructor() → init(data) → create()
  
Second Battle:
  (Scene already exists, no constructor call)
  init(data) → create()
  ↑
  This is where we MUST reset state!
```

### **Why This Matters:**
- Without reset: State accumulates across battles
- Turn numbers increment forever
- Old actions might linger
- UI elements pile up
- Memory leaks possible

### **With Reset:**
- ✅ Each battle is completely independent
- ✅ No state pollution between battles
- ✅ Predictable behavior
- ✅ No memory leaks

---

## 📋 **Files Modified**

- ✅ `src/scenes/BattleScene.ts` - Added comprehensive state reset in `init()`
- ✅ `src/net/match.ts` - Added `sendMapCursor()` function (bonus fix)
- ✅ `BATTLE-RESET-FIX.md` - This documentation

---

## 🎯 **Result**

Every battle now starts **completely fresh**:
- ✅ Turn 1
- ✅ Full HP
- ✅ Fresh enemies
- ✅ New loadouts from card selection
- ✅ No leftover state from previous battles

The game now properly supports multiple battles in sequence! ⚔️✨

