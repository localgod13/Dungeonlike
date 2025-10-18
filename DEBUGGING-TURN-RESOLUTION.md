# Debugging Turn Resolution Issue 🔍

## 🚨 **Issue: Nothing Happens After Both Players Lock**

Both players can lock their actions successfully, but the turn doesn't resolve automatically.

---

## 🔧 **Enhanced Debugging Added**

I've added comprehensive logging to track the entire turn resolution flow:

### **1. Host Detection Logic**
```javascript
// When host locks their action:
"Host checking if all players committed..."
"Current plans: [['player_1', {by: 'player_1', type: 'Attack', target: 'enemy_1'}]]"
"All players: [{id: 'player_1', name: 'Player1'}, {id: 'player_2', name: 'Player2'}]"
"All committed: false"
"Still waiting for: ['Player2']"

// When other player locks:
"Received action vote: Guard from user_456 for turn 1"
"Updated player plans: [['player_1', {...}], ['player_2', {...}]]"
"All committed: true"
"All players committed! Host will resolve turn..."
```

### **2. Turn Resolution Process**
```javascript
// Host commitTurn():
"Committing turn..."
"Current plans: [['player_1', {...}], ['player_2', {...}]]"
"Sending commit turn message..."
"Commit message sent successfully"
"Resolving turn with plans: [{by: 'player_1', type: 'Attack', ...}, {by: 'player_2', type: 'Guard'}]"
"Generated resolution payload: {turn: 1, seed: 12345, order: [...], effects: [...], post: [...]}"
"Sending resolve turn message..."
"Resolve message sent successfully"
```

### **3. Animation Timeline**
```javascript
// All clients handleResolveTurn():
"Resolved turn 1: {turn: 1, seed: 12345, ...}"
"Updated combat state: {turn: 1, party: [...], enemies: [...]}"
"Starting turn 2"
"Starting animation timeline..."
```

---

## 🔍 **How to Debug**

### **Step 1: Check Host Detection**

**On the HOST client console:**
1. Lock your action first
2. Look for: `"Host checking if all players committed..."`
3. Check: `"All committed: false"` and `"Still waiting for: ['Player2']"`

**Expected:**
- ✅ Host should detect when all players locked
- ✅ Should see `"All players committed! Host will resolve turn..."`

### **Step 2: Check Turn Resolution**

**On the HOST client console:**
1. Look for: `"Committing turn..."`
2. Check: `"Sending commit turn message..."`
3. Verify: `"Commit message sent successfully"`
4. Check: `"Resolving turn with plans: [...]"`
5. Verify: `"Resolve message sent successfully"`

**Expected:**
- ✅ All steps should complete without errors
- ✅ Resolution payload should be generated

### **Step 3: Check Message Reception**

**On ALL clients console:**
1. Look for: `"Received combat message: {t: 'commit_turn', turn: 1}"`
2. Look for: `"Received combat message: {t: 'resolve_turn', payload: {...}}"`

**Expected:**
- ✅ All clients should receive both messages
- ✅ No Zod validation errors

### **Step 4: Check Animation Timeline**

**On ALL clients console:**
1. Look for: `"Resolved turn 1: {...}"`
2. Check: `"Starting animation timeline..."`
3. Verify: `"Starting turn 2"`

**Expected:**
- ✅ Timeline should start and play animations
- ✅ Next turn should begin

---

## 🐛 **Common Issues & Solutions**

### **1. Host Not Detecting All Players**
**Symptoms:**
- `"All committed: false"` even when both players locked
- `"Still waiting for: ['Player2']"` persists

**Causes:**
- Player IDs don't match between clients
- Host's own action not counted
- Wrong turn number

**Solutions:**
```javascript
// Check player IDs match:
console.log('Host players:', this.players.map(p => ({ id: p.id, name: p.name })));
console.log('Host plans:', Array.from(this.playerPlans.entries()));

// Should see same IDs in both arrays
```

### **2. Commit/Resolve Messages Not Sent**
**Symptoms:**
- `"Committing turn..."` appears but no further logs
- Network errors in console

**Causes:**
- Supabase connection issues
- Channel subscription problems
- Authentication errors

**Solutions:**
- Check internet connection
- Verify Supabase credentials
- Try refreshing both clients

### **3. Messages Not Received**
**Symptoms:**
- Host sends messages but clients don't receive them
- `"Received combat message:"` logs missing

**Causes:**
- Channel subscription issues
- Message filtering (self: false)
- Network latency

**Solutions:**
- Check channel subscription status
- Verify lobby IDs match
- Wait a few seconds for network delay

### **4. Timeline Not Starting**
**Symptoms:**
- `"Resolved turn 1: {...}"` appears
- `"Starting animation timeline..."` missing
- No animations play

**Causes:**
- Timeline not built properly
- Animation callbacks missing
- Phase not updated

**Solutions:**
- Check `buildAnimationTimeline()` is called
- Verify animation callbacks exist
- Ensure phase changes to 'resolving'

---

## 📋 **Debugging Checklist**

**For HOST client:**

1. **Check Host Detection:**
   ```javascript
   // Should see:
   "Host checking if all players committed..."
   "All committed: true"
   "All players committed! Host will resolve turn..."
   ```

2. **Check Turn Resolution:**
   ```javascript
   // Should see:
   "Committing turn..."
   "Sending commit turn message..."
   "Commit message sent successfully"
   "Resolving turn with plans: [...]"
   "Resolve message sent successfully"
   ```

3. **Check Message Broadcasting:**
   ```javascript
   // Should see:
   "Sent commit turn: 1"
   "Sent resolve turn: 1 with X effects"
   ```

**For ALL clients:**

1. **Check Message Reception:**
   ```javascript
   // Should see:
   "Received combat message: {t: 'commit_turn', turn: 1}"
   "Received combat message: {t: 'resolve_turn', payload: {...}}"
   ```

2. **Check Resolution Handling:**
   ```javascript
   // Should see:
   "Resolved turn 1: {...}"
   "Updated combat state: {...}"
   "Starting turn 2"
   "Starting animation timeline..."
   ```

---

## 🎯 **Quick Fixes**

### **If Host Not Detecting:**
1. **Check player IDs** - Should match between clients
2. **Verify turn numbers** - Should be same on all clients
3. **Check host flag** - `this.isHost` should be true

### **If Messages Not Sent:**
1. **Check network** - Try refreshing both clients
2. **Verify lobby ID** - Should be same on all clients
3. **Check authentication** - User should be signed in

### **If Timeline Not Playing:**
1. **Check effects array** - Should have animation effects
2. **Verify callbacks** - Animation functions should exist
3. **Check timeline** - Should be created and started

---

## 🚀 **Expected Flow**

**Complete successful flow:**
1. **Player 1 locks** → Host detects: `"Still waiting for: ['Player2']"`
2. **Player 2 locks** → Host detects: `"All players committed!"`
3. **Host commits** → `"Committing turn..."` → `"Resolve message sent successfully"`
4. **All clients receive** → `"Resolved turn 1: {...}"` → `"Starting animation timeline..."`
5. **Animations play** → Damage numbers, effects, etc.
6. **Next turn begins** → `"Starting turn 2"` → Back to planning phase

**Test with the enhanced logging and check each step!** 🎯













