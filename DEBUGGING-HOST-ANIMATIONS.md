# Debugging Host Animation Issue 🔍

## 🚨 **Issue: Host Not Seeing Animations**

The host now receives the resolution message but doesn't see the animations (cards shaking, damage numbers, etc.) that other clients see.

---

## 🔧 **Enhanced Animation Debugging Added**

I've added comprehensive logging to track the entire animation pipeline:

### **1. Timeline Building**
```javascript
// When resolution payload is received:
"Building animation timeline with effects: [{at: 0, kind: 'vfx', src: 'player_1', dst: 'enemy_1', note: 'telegraph'}, ...]"
"Timeline built with 6 effects"
```

### **2. Timeline Starting**
```javascript
// When timeline starts:
"Starting animation timeline..."
"Timeline exists but not active" // If timeline not starting
```

### **3. Animation Callbacks**
```javascript
// When effects fire:
"Animation: Telegraph from player_1 to enemy_1"
"Animation: Strike from player_1 to enemy_1 (slash)"
"Animation: Hit from player_1 to enemy_1 for 5 damage"
```

### **4. Animation Methods**
```javascript
// When animation methods are called:
"playTelegraph called: player_1 -> enemy_1"
"Playing telegraph animation on slot: [Container object]"
"playStrike called: player_1 -> enemy_1 (slash)"
"Playing strike animation on source slot: [Container object]"
"Playing strike animation on target slot: [Container object]"
```

### **5. Actor Slot Lookup**
```javascript
// When finding actor slots:
"getActorSlot called for: player_1"
"Available actors: [{id: 'player_1', side: 'party', name: 'Player1'}, {id: 'enemy_1', side: 'enemy', name: 'Shadow Beast'}]"
"Found actor: Player1 (party)"
"Party slot at index 0: found"
```

---

## 🔍 **How to Debug**

### **Step 1: Check Timeline Building**

**On HOST client console:**
1. Look for: `"Building animation timeline with effects: [...]"`
2. Check: `"Timeline built with X effects"`
3. Verify: Effects array has animation data

**Expected:**
- ✅ Timeline should be built with effects
- ✅ Effects should have proper `src`, `dst`, `kind`, `at` fields

### **Step 2: Check Timeline Starting**

**On HOST client console:**
1. Look for: `"Starting animation timeline..."`
2. Check: `"Timeline exists but not active"` (if timeline not starting)

**Expected:**
- ✅ Timeline should start successfully
- ❌ If "not active" → Timeline not starting properly

### **Step 3: Check Animation Callbacks**

**On HOST client console:**
1. Look for: `"Animation: Telegraph from ..."`
2. Look for: `"Animation: Strike from ..."`
3. Look for: `"Animation: Hit from ..."`

**Expected:**
- ✅ Animation callbacks should fire
- ❌ If missing → Timeline not processing effects

### **Step 4: Check Animation Methods**

**On HOST client console:**
1. Look for: `"playTelegraph called: ..."`
2. Look for: `"Playing telegraph animation on slot: ..."`
3. Look for: `"playStrike called: ..."`

**Expected:**
- ✅ Animation methods should be called
- ✅ Slots should be found and animations should play

### **Step 5: Check Actor Slot Lookup**

**On HOST client console:**
1. Look for: `"getActorSlot called for: ..."`
2. Check: `"Available actors: [...]"`
3. Verify: `"Found actor: ..."`
4. Check: `"Party slot at index X: found"`

**Expected:**
- ✅ Actors should be found
- ✅ Slots should be found
- ❌ If "not found" → Actor/slot mismatch

---

## 🐛 **Common Issues & Solutions**

### **1. Timeline Not Starting**
**Symptoms:**
- `"Timeline built with X effects"` appears
- `"Starting animation timeline..."` appears
- `"Timeline exists but not active"` appears

**Causes:**
- Timeline.start() not called properly
- Effects array empty or malformed
- Timeline class issue

**Solutions:**
- Check effects array has valid data
- Verify timeline.start() is called
- Check timeline class implementation

### **2. Animation Callbacks Not Firing**
**Symptoms:**
- Timeline starts but no `"Animation: ..."` logs
- Effects exist but callbacks not triggered

**Causes:**
- Timeline.update() not being called
- Effects timing issues
- Callback registration problems

**Solutions:**
- Check update() loop is running
- Verify timeline.isActive() returns true
- Check effect timing values

### **3. Actor Slots Not Found**
**Symptoms:**
- `"Actor not found: ..."` warnings
- `"Party slot at index X: not found"` warnings

**Causes:**
- Actor IDs don't match between resolution and scene
- Slots not created properly
- Index out of bounds

**Solutions:**
- Check actor IDs in resolution payload
- Verify slots are created in createBattleLayout()
- Check party/enemy arrays match

### **4. Animations Not Visible**
**Symptoms:**
- All logs appear correctly
- No visual animations on screen

**Causes:**
- Tween targets are wrong objects
- Animations too subtle to see
- Z-index or visibility issues

**Solutions:**
- Check tween targets are correct containers
- Increase animation scale/duration for testing
- Verify containers are visible

---

## 📋 **Debugging Checklist**

**For HOST client:**

1. **Check Resolution Payload:**
   ```javascript
   // Should see:
   "Resolved turn 1: {turn: 1, seed: 12345, effects: [...], post: [...]}"
   "Building animation timeline with effects: [...]"
   ```

2. **Check Timeline Creation:**
   ```javascript
   // Should see:
   "Timeline built with X effects"
   "Starting animation timeline..."
   ```

3. **Check Animation Execution:**
   ```javascript
   // Should see:
   "Animation: Telegraph from player_1 to enemy_1"
   "playTelegraph called: player_1 -> enemy_1"
   "Playing telegraph animation on slot: [Container]"
   ```

4. **Check Actor Lookup:**
   ```javascript
   // Should see:
   "getActorSlot called for: player_1"
   "Found actor: Player1 (party)"
   "Party slot at index 0: found"
   ```

---

## 🎯 **Quick Fixes**

### **If Timeline Not Starting:**
1. **Check effects array** - Should have valid animation data
2. **Verify timeline.start()** - Should be called after building
3. **Check timeline class** - Should be working properly

### **If Callbacks Not Firing:**
1. **Check update loop** - Should call timeline.update()
2. **Verify timeline.isActive()** - Should return true
3. **Check effect timing** - Should have proper `at` values

### **If Slots Not Found:**
1. **Check actor IDs** - Should match between resolution and scene
2. **Verify slot creation** - Should be created in createBattleLayout()
3. **Check arrays** - Players/enemies should match

### **If Animations Not Visible:**
1. **Check tween targets** - Should be correct containers
2. **Increase animation scale** - Make them more obvious
3. **Check container visibility** - Should be visible on screen

---

## 🚀 **Expected Flow**

**Complete successful animation flow:**
1. **Resolution received** → `"Resolved turn 1: {...}"`
2. **Timeline built** → `"Building animation timeline with effects: [...]"`
3. **Timeline starts** → `"Starting animation timeline..."`
4. **Effects fire** → `"Animation: Telegraph from ..."`
5. **Methods called** → `"playTelegraph called: ..."`
6. **Slots found** → `"Found actor: Player1 (party)"`
7. **Animations play** → Visual effects on screen
8. **Timeline completes** → `"Timeline complete, starting next planning phase"`

**Test with the enhanced logging and check each step!** The console will show exactly where the animation pipeline breaks down. 🎯



















