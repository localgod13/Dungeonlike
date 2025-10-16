# Battle Action Selection & Turn Lock Guide 🎮

## ✅ **Fixes Implemented**

The BattleScene now has clear visual feedback and an explicit "Lock Turn" button!

---

## 🎯 **How to Use Actions**

### **Step 1: Select an Action**
Click one of the 4 action buttons:
- **⚔️ Attack** (Red) - Attack an enemy
- **🛡️ Guard** (Blue) - Reduce incoming damage
- **✨ Skill** (Purple) - Heal an ally
- **⏱️ Skip** (Grey) - Do nothing

**Visual Feedback:**
- ✅ Button gets **yellow border** highlight
- ✅ Text appears: *"Select target for Attack..."* or *"Guard selected - Ready to lock!"*

---

### **Step 2: Select Target (if needed)**

**For Attack & Skill:**
1. **Yellow highlights** appear around valid targets
2. **Hover** over target → highlight glows brighter
3. **Click** target → Target selected!
4. Text updates: *"Attack → Shadow Beast - Ready to lock!"*

**For Guard & Skip:**
- No target needed! Skip straight to Step 3.

**Need to Change?**
- Click **Cancel** button to go back and choose a different action

---

### **Step 3: Lock Your Turn**

After selecting action (and target if needed):
1. **🔒 LOCK TURN** button appears at bottom
2. Button **pulses** to grab your attention
3. **Click** the button to lock in your action

**Confirmation:**
- ✅ Green text: *"✓ Attack locked! Waiting for others..."*
- ✅ Your portrait shows action icon (⚔️🛡️✨⏱️)
- ✅ Lock indicator (✓) appears under your portrait

---

## ⏱️ **Turn Timer**

**30-second timer** per planning phase:
- When timer expires → Host auto-commits turn
- Missing players default to **Guard**
- Shows in console: *"Turn timer expired, forcing commit..."*

---

## 🎬 **What Happens After All Players Lock?**

### **Host Auto-Resolution:**
1. Host detects all players have locked
2. Host runs deterministic combat simulation
3. Host broadcasts `resolve_turn` to all clients

### **Synchronized Animation:**
1. **Resolving Phase** begins (orange text)
2. **Timeline plays** with effects:
   - Telegraph → Strike → Damage numbers
   - All clients see **identical animations**
3. **HP bars update** across all clients
4. **Next turn** begins automatically

---

## 🎮 **Example Flow**

```
1. Click ⚔️ Attack
   → Button gets yellow border
   → Text: "Select target for Attack..."

2. Click enemy
   → Yellow highlight disappears
   → Text: "Attack → Shadow Beast - Ready to lock!"
   → 🔒 LOCK TURN button appears (pulsing)

3. Click 🔒 LOCK TURN
   → Text: "✓ Attack locked! Waiting for others..."
   → ⚔️ icon appears under your portrait
   → ✓ badge appears under your portrait

4. Wait for other players...
   → Other players' portraits show their actions
   → When all ready → Host auto-resolves

5. Resolving Phase
   → Phase changes to "Resolving" (orange)
   → Animations play (identical on all clients)
   → Damage numbers float up
   → HP bars update

6. Next Turn
   → Phase returns to "Planning" (blue)
   → All locks cleared
   → 30-second timer resets
   → Repeat!
```

---

## 🐛 **Troubleshooting**

### **"Nothing happens when I click action button!"**
**Check:**
- Is phase "Planning"? (blue text at top)
- Are you already locked? (✓ badge showing?)
- Console logs: "Selected action: Attack"

### **"I can't see the Lock button!"**
**Check:**
- Did you select a target (for Attack/Skill)?
- Text should say: "Ready to lock!"
- Console logs: "Selected target: Shadow Beast"

### **"Turn won't resolve!"**
**Check:**
- Are all players locked? (all portraits show ✓)
- Is host still in the game?
- Console logs: "Turn committed" → "Resolved turn"

### **"Animations are different on each tab!"**
**This should never happen!**
- Same seed → Same RNG → Same results
- If it happens, check console for errors
- Verify all clients received `resolve_turn` message

---

## 🎨 **Visual Indicators**

### **Action Buttons**
- **Normal**: White border (2px)
- **Selected**: Yellow border (4px)
- **Hover**: Scale 1.1

### **Target Highlights**
- **Normal**: Yellow overlay (30% opacity)
- **Hover**: Yellow overlay (50% opacity)
- **Border**: Yellow (3px)

### **Lock Button**
- **Color**: Green (#27ae60)
- **Animation**: Pulsing scale (1.0 → 1.05)
- **Hover**: Brighter green (#2ecc71)

### **Status Text**
- **Pending**: Orange (#f39c12)
- **Locked**: Green (#27ae60)
- **Error**: Red (#e74c3c)

### **Portrait Indicators**
- **Action Icon**: Emoji (⚔️🛡️✨⏱️)
- **Lock Badge**: "✓" in orange

---

## 🚀 **Summary**

**Before:**
- ❌ No visual feedback when clicking actions
- ❌ No clear way to end turn
- ❌ Confusing when action was locked

**Now:**
- ✅ Yellow border highlights selected action
- ✅ Text explains what's happening
- ✅ Big green "🔒 LOCK TURN" button
- ✅ Clear confirmation when locked
- ✅ 30-second auto-commit timer
- ✅ Visual indicators on all portraits

**The combat flow is now crystal clear!** 🎯



