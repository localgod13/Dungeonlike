# Debugging "Failed to Lock Action" Error 🔍

## 🚨 **Issue Identified**

One player shows "Failed to lock action! Try again." while another shows "Attack locked! Waiting for others..."

This suggests a **network or authentication issue** preventing one client from sending the action plan.

---

## 🔧 **Enhanced Debugging Added**

I've added comprehensive logging and error handling to identify the exact cause:

### **New Console Logs:**
```javascript
// When locking action:
"Locking action: {by: 'player_1', type: 'Attack', target: 'enemy_1'}"
"Sending to lobby: abc123, turn: 1"
"Player actor: {id: 'player_1', userId: 'user_123', ...}"

// In sendPlan function:
"sendPlan called: lobbyId=abc123, plan={...}, turn=1"
"Current userId: user_123"
"Sending message: {t: 'action_vote', plan: {...}, userId: 'user_123', turn: 1}"
"Channel send result: {status: 'ok'}"
"Sent action plan: Attack for turn 1"

// On error:
"Failed to send action plan: Error: Not authenticated - userId is null"
"Error details: {lobbyId: 'abc123', userId: null, currentTurn: 1, ...}"
```

---

## 🔍 **How to Debug**

### **Step 1: Check Console Logs**

**On the FAILING client:**
1. Open **Developer Tools** (F12)
2. Go to **Console** tab
3. Try to lock an action
4. Look for these specific logs:

```javascript
// ✅ GOOD - Should see:
"Locking action: {by: 'player_1', type: 'Attack', target: 'enemy_1'}"
"Sending to lobby: abc123, turn: 1"
"Current userId: user_123"
"Action plan sent successfully!"

// ❌ BAD - Common errors:
"Current userId: null"  // Authentication issue
"Error in channel.send: ..."  // Network issue
"Player actor not found for userId: ..."  // Player data issue
```

### **Step 2: Compare with Working Client**

**On the WORKING client:**
- Check if logs are identical
- Look for any differences in userId, lobbyId, or player data

---

## 🐛 **Common Causes & Solutions**

### **1. Authentication Issue**
**Symptoms:**
- `"Current userId: null"`
- `"Not authenticated - userId is null"`

**Solutions:**
```javascript
// Check if user is signed in
const userId = await getCurrentUserId();
console.log('Current user:', userId);

// If null, refresh the page or re-authenticate
```

### **2. Network/Connection Issue**
**Symptoms:**
- `"Error in channel.send: ..."`
- `"Network error sending action plan: ..."`

**Solutions:**
- Check internet connection
- Verify Supabase is accessible
- Try refreshing the page

### **3. Player Data Mismatch**
**Symptoms:**
- `"Player actor not found for userId: ..."`
- Different userId between clients

**Solutions:**
- Verify all players joined the same lobby
- Check if player data is consistent across clients

### **4. Turn Number Mismatch**
**Symptoms:**
- `"Sending to lobby: abc123, turn: 1"` on one client
- `"Sending to lobby: abc123, turn: 2"` on another

**Solutions:**
- Ensure all clients are on the same turn
- Check if any client missed a turn resolution

---

## 🛠️ **Enhanced Error Messages**

The error messages are now more specific:

- **❌ Authentication error! Refresh and try again.**
- **❌ Network error! Check connection.**
- **❌ Player not found! Refresh and try again.**
- **❌ Failed to lock action! Try again.**

---

## 🔄 **Retry Mechanism**

After a failed attempt:
1. **Red error message** appears
2. **🔄 RETRY button** appears after 2 seconds
3. **Click RETRY** to try again
4. **Auto-hide** after 5 seconds

---

## 📋 **Debugging Checklist**

**For the FAILING client:**

1. **Check Authentication:**
   ```javascript
   // In console:
   const userId = await getCurrentUserId();
   console.log('UserId:', userId);
   ```

2. **Check Lobby Data:**
   ```javascript
   // In console:
   console.log('LobbyId:', this.lobbyId);
   console.log('Players:', this.players);
   console.log('Current Turn:', this.currentTurn);
   ```

3. **Check Network:**
   ```javascript
   // In console:
   const supabase = getSupabase();
   console.log('Supabase client:', supabase);
   ```

4. **Check Player Actor:**
   ```javascript
   // In console:
   const playerActor = this.players.find(p => p.userId === this.userId);
   console.log('Player actor:', playerActor);
   ```

---

## 🎯 **Quick Fixes**

### **If Authentication Issue:**
1. **Refresh the page** on the failing client
2. **Re-enter name** and join lobby again
3. **Check .env file** has correct Supabase credentials

### **If Network Issue:**
1. **Check internet connection**
2. **Try different browser/incognito mode**
3. **Disable ad blockers** temporarily

### **If Player Data Issue:**
1. **All players leave lobby**
2. **Host creates new lobby**
3. **All players join fresh**

---

## 📊 **Expected Behavior**

**SUCCESSFUL flow:**
1. Click action → Yellow border
2. Select target → Yellow highlight
3. Click Lock → Loading spinner
4. Success → Green "✓ Attack locked!"

**FAILED flow:**
1. Click action → Yellow border
2. Select target → Yellow highlight  
3. Click Lock → Loading spinner
4. Error → Red "❌ Failed to lock action!"
5. Retry button appears

---

## 🚀 **Next Steps**

1. **Test with the enhanced logging**
2. **Check console on both clients**
3. **Compare the logs** to identify the difference
4. **Apply the appropriate fix** based on the error type

The enhanced debugging should pinpoint exactly why one client fails while another succeeds! 🎯










