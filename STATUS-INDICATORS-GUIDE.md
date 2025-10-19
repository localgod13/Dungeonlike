# Status Effect Indicators Guide

## 🎨 Visual Status System

A comprehensive visual indicator system that displays active buffs and debuffs above characters during battle.

---

## ✨ Features

### **Status Icons Display:**
- **Position:** Floating above each character (party & enemies)
- **Auto-Update:** Refreshes after each turn and action
- **Multiple Effects:** Shows all active effects simultaneously
- **Duration Display:** Shows remaining turns/stacks for each effect

---

## 🔮 Supported Status Effects

### **Poison (☠️)**
- **Icon:** ☠️ (skull)
- **Color:** Green (0x00ff00)
- **Background:** Dark green (0x003300)
- **Display:** `4x2` = 4 damage for 2 turns
- **Source:** Huntress - Poison Arrow

### **Burn (🔥)**
- **Icon:** 🔥 (fire)
- **Color:** Orange-red (0xff4400)
- **Background:** Dark red (0x330000)
- **Display:** `5x2` = 5 damage for 2 turns
- **Source:** Mage - Burning Curse

### **Shield/Guard (🛡️)** - Coming Soon
- **Icon:** 🛡️ (shield)
- **Color:** Blue (0x4a90e2)
- **Background:** Dark blue (0x001133)
- **Display:** Shield value
- **Source:** Guard cards

### **Vulnerable (💔)** - Coming Soon
- **Icon:** 💔 (broken heart)
- **Color:** Purple (0xaa44aa)
- **Background:** Dark purple (0x220022)
- **Display:** Remaining turns
- **Source:** Weaken card

### **Stunned (💫)** - Coming Soon
- **Icon:** 💫 (dizzy)
- **Color:** Yellow (0xffff00)
- **Background:** Dark yellow (0x333300)
- **Display:** Stun duration
- **Source:** Bash card

---

## 📊 Status Icon Anatomy

```
┌─────────────────┐
│   [Character]   │  ← Character sprite/avatar
│                 │
│     ☠️  🔥      │  ← Status icons (multiple possible)
│    4x2  5x2     │  ← Duration/damage info
└─────────────────┘
     ↑       ↑
   Poison  Burn
```

### **Icon Structure:**
- **Background Circle:** Colored circle indicating effect type
- **Border:** Bright colored border for visibility
- **Emoji Icon:** Visual representation of the effect
- **Text Label:** Shows damage/turn × duration
  - Format: `{damage}x{turns}`
  - Example: `4x2` = 4 damage, 2 turns remaining

---

## 🎯 How It Works

### **1. DOT Effects (Poison/Burn):**
```typescript
// When Poison Arrow is played on Turn 1
Enemy gets: ☠️ 4x2

// Turn 2 starts (DOT ticks)
- Enemy takes 4 damage
- Icon updates: ☠️ 4x1

// Turn 3 starts (DOT ticks again)
- Enemy takes 4 damage  
- Icon updates and expires (removed)
```

### **2. Multiple Effects:**
If an enemy has both poison AND burn:
```
Enemy: ☠️ 4x2  🔥 5x1
       ↑        ↑
     Poison   Burn
```
Icons are displayed side-by-side with spacing.

### **3. Automatic Updates:**
Status indicators automatically update:
- ✅ After turn resolution
- ✅ When planning phase starts
- ✅ When effects are applied
- ✅ When effects expire

---

## 🛠️ Technical Implementation

### **Key Components:**

1. **`statusEffectContainers`**
   - Map storing status container for each actor
   - One container per character (party + enemies)

2. **`updateAllStatusIndicators()`**
   - Updates status icons for ALL actors
   - Called after turn resolution and phase changes

3. **`updateStatusIndicators(actorId)`**
   - Updates icons for a specific actor
   - Reads from `combatState.dots` for DOT effects
   - Clears old icons and creates new ones

4. **Status Icon Creation:**
   - Background circle with colored border
   - Emoji icon for visual identification
   - Small text showing damage × duration

---

## 🎨 Visual Design

### **Colors & Styling:**
- **Poison:** Green theme (toxic/nature)
- **Burn:** Red/orange theme (fire)
- **Guard:** Blue theme (protection)
- **Vulnerable:** Purple theme (debuff)
- **Stun:** Yellow theme (disorientation)

### **Icon Positioning:**
- **Above Character:** Y offset -70 (party) / -80 (enemies)
- **Horizontal Spacing:** 28 pixels between icons
- **Centered:** Icons centered above character
- **Icon Size:** 24 pixels diameter circles

---

## 📈 Future Enhancements

### **Planned Additions:**
- [ ] Guard/Shield indicators (🛡️)
- [ ] Vulnerable status (💔)
- [ ] Stun status (💫)
- [ ] Buff effects (✨)
- [ ] Taunt indicator (💢)
- [ ] Healing over time (💚)
- [ ] Strength buffs (💪)
- [ ] Defense buffs (🛡️)

### **Possible Features:**
- Animated icons (pulsing, glowing)
- Tooltip on hover showing full effect details
- Different icon sizes based on effect importance
- Stack indicators for multiple identical effects
- Color-coded borders for buff vs debuff

---

## 🔍 Debugging

### **Check Status Container:**
```javascript
// In browser console
scene.statusEffectContainers
// Should show Map of actorId -> Container
```

### **Verify DOT Data:**
```javascript
scene.combatState.dots
// Should show Map of actorId -> DOT effects array
```

### **Common Issues:**
1. **Icons not showing:**
   - Check if `combatState.dots` has data
   - Verify status container exists for actor
   - Check console for errors

2. **Icons not updating:**
   - Ensure `updateAllStatusIndicators()` is called
   - Check if DOT effects are persisting

3. **Wrong position:**
   - Adjust Y offset in `createPartySlot` / `createEnemySlot`
   - Container position: `new container(0, -70/80)`

---

## ✅ Summary

The status indicator system provides:
- ✨ **Visual Clarity** - See all active effects at a glance
- 🔄 **Auto-Updates** - Always shows current status
- 📊 **Information Rich** - Shows damage, duration, and type
- 🎨 **Thematic Design** - Color-coded for easy identification
- 🔮 **Extensible** - Easy to add new status types

Status indicators make combat more strategic by showing exactly what effects are active on each character!

