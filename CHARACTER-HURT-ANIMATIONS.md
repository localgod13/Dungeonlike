# Character Hurt Animations - Complete System

## 💔 **Feature**
Added damage/hurt animations for all character classes that play when they take damage in combat.

---

## 🎨 **Hurt Animation Sprite Sheets**

### **⚔️ WARRIOR - Take Hit**
- **Source:** [GitHub - Warrior/Take hit.png](https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/warrior/Take%20hit.png)
- **CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/warrior/Take hit.png`
- **Total Size:** 485×162 pixels
- **Layout:** 1 row, 3 columns
- **Frame Size:** 162×162 pixels (rounded from 485÷3)
- **Frame Rate:** 10 FPS
- **Animation Key:** `warrior_hurt_anim`

### **🏹 HUNTRESS - Get Hit**
- **Source:** [GitHub - Huntress/Get Hit.png](https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/huntress/Get%20Hit.png)
- **CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/huntress/Get Hit.png`
- **Total Size:** 300×100 pixels
- **Layout:** 1 row, 3 columns
- **Frame Size:** 100×100 pixels
- **Frame Rate:** 10 FPS
- **Animation Key:** `huntress_hurt_anim`

### **🔥 MAGE - Take Hit**
- **Source:** [GitHub - Wizard2/Take Hit.png](https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/wizard2/Take%20Hit.png)
- **CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/wizard2/Take Hit.png`
- **Total Size:** 600×150 pixels
- **Layout:** 1 row, 4 columns
- **Frame Size:** 150×150 pixels
- **Frame Rate:** 10 FPS
- **Animation Key:** `mage_hurt_anim`

---

## 📋 **Files Modified**

### **Character Sprite Modules:**
1. ✅ `src/game/characters/warrior.ts` - Added hurt spritesheet and animation
2. ✅ `src/game/characters/huntress.ts` - Added hurt spritesheet and animation
3. ✅ `src/game/characters/mage.ts` - Added hurt spritesheet and animation

### **Battle System:**
4. ✅ `src/scenes/BattleScene.ts` - Added hurt animation trigger in `playHit()`

---

## 🎬 **Animation Flow**

### **Complete Combat Animation Cycle:**
```
Idle → Attack → Idle → (gets hit) → Hurt → Idle
 🧍     ⚡      🧍         💥          💔     🧍
```

### **Damage Sequence:**
```
1. Enemy/Player attacks
2. Attack animation plays
3. Projectile/effect flies (if ranged)
4. Hit callback fires
5. Target's hurt animation plays
6. Damage number appears and floats up
7. HP bar decreases
8. Hurt animation completes (3-4 frames)
9. Returns to idle animation
```

---

## 🎯 **How It Works**

### **In `playHit()` Method:**
```typescript
private playHit(srcId: ActorId, dstId: ActorId, damage: number): void {
  const dstSlot = this.getActorSlot(dstId);
  
  if (dstSlot) {
    // Find the character being hit
    const actor = [...this.players, ...this.enemies].find(a => a.id === dstId);
    
    if (actor && actor.side === 'party') {
      const characterClass = battleActor.selectedClass;
      const sprite = dstSlot.list.find(obj => obj.type === 'Sprite');
      
      // Play hurt animation based on class
      if (characterClass === 'Mage') {
        sprite.play('mage_hurt_anim');
      } else if (characterClass === 'Warrior') {
        sprite.play('warrior_hurt_anim');
      } else if (characterClass === 'Huntress') {
        sprite.play('huntress_hurt_anim');
      }
      
      // Auto-return to idle when done
      sprite.once('animationcomplete', () => {
        sprite.play(`${characterClass.toLowerCase()}_idle_anim`);
      });
    }
    
    // Show damage number
    // ...
  }
}
```

---

## 🎨 **Visual Comparison**

### **Hurt Animation Frames:**

| Class | Frames | FPS | Duration | Visual Style |
|-------|--------|-----|----------|--------------|
| **Warrior** | 3 | 10 | 0.3s | Stagger, shield impact |
| **Huntress** | 3 | 10 | 0.3s | Recoil, agile dodge |
| **Mage** | 4 | 10 | 0.4s | Flinch, robes flutter |

### **Frame Breakdown:**

**Warrior Hurt (3 frames):**
```
Frame 0: Impact start (stumble back)
Frame 1: Mid-recoil (defensive pose)
Frame 2: Recovery → returns to idle
```

**Huntress Hurt (3 frames):**
```
Frame 0: Hit reaction (quick flinch)
Frame 1: Dodge motion (agile)
Frame 2: Stabilize → returns to idle
```

**Mage Hurt (4 frames):**
```
Frame 0: Impact (robes ripple)
Frame 1: Stagger back (energy disrupted)
Frame 2: Regain balance
Frame 3: Recover → returns to idle
```

---

## ⚡ **When Hurt Animations Play**

### **Triggered By:**
- ✅ Enemy attacks hitting player characters
- ✅ DOT (poison/burn) damage ticks
- ✅ AOE damage effects
- ✅ Any damage dealt to party members

### **NOT Triggered For:**
- ❌ Enemies taking damage (enemies don't have hurt animations yet)
- ❌ Healing effects (different callback)
- ❌ Shield/guard effects (different visual)
- ❌ Zero damage hits

---

## 🎮 **Complete Animation System**

### **All Character Animations:**

| Class | Idle | Attack | Hurt | Total |
|-------|------|--------|------|-------|
| **Warrior** | ✅ 10f | ✅ 7f | ✅ 3f | 3 anims |
| **Huntress** | ✅ 10f | ✅ 6f | ✅ 3f | 3 anims |
| **Mage** | ✅ 8f | ✅ 8f | ✅ 4f | 3 anims |

### **Special Effects:**
| Class | Attack Effect | Hurt Effect |
|-------|--------------|-------------|
| **Warrior** | Sword swing | Shield impact |
| **Huntress** | Arrow projectile 🏹 | Quick dodge |
| **Mage** | Spell cast | Robes flutter |

---

## 🎬 **Example Combat Sequence**

### **Scenario: Enemy Attacks Mage**

```
Turn 2:
1. Enemy's turn in initiative
2. Enemy attacks Mage
3. Telegraph animation (enemy scales up)
4. Strike animation (enemy lunges)
5. Hit callback fires for Mage
6. ⚡ Mage hurt animation plays (4 frames @ 10 FPS)
7. Damage number appears: "-8"
8. HP bar decreases
9. Mage hurt animation completes
10. Mage returns to idle loop
```

**Visual Timeline:**
```
👹 Enemy      🧙 Mage
 ↓             🧙 (idle)
💥 → → →      🧙
 ↓             ↓
👹          💔 Mage (hurt anim)
             -8
 ↓             ↓
👹            🧙 (back to idle)
```

---

## 🔧 **Technical Implementation**

### **Sprite Sheet Loading:**
```typescript
// Each character module automatically loads hurt sprites
export const [CLASS]_SPRITES = {
  idle: { ... },
  attack: { ... },
  hurt: { ... },  // NEW!
};
```

### **Animation Creation:**
```typescript
// Animations auto-created in createCharacterAnimations()
export const [CLASS]_ANIMATIONS = {
  idle: { repeat: -1 },   // Loop
  attack: { repeat: 0 },  // Once
  hurt: { repeat: 0 },    // Once → idle
};
```

### **Auto-Return to Idle:**
```typescript
sprite.play(hurtAnimKey);

sprite.once('animationcomplete', () => {
  sprite.play(`${characterClass}_idle_anim`);
});
```

---

## 🎯 **Benefits**

- ✨ **Visual Feedback:** See when characters take damage
- 💔 **Impact Feel:** Damage feels more impactful
- 🎨 **Class Identity:** Each class reacts uniquely
- ⚡ **Responsive:** Fast animations (0.3-0.4s)
- 🔄 **Seamless:** Auto-returns to idle
- 🎯 **Automatic:** Works for all damage sources

---

## 🔍 **Debug Logging**

When a character takes damage, you'll see:
```
💔 Playing hurt animation: warrior_hurt_anim
=== HIT ANIMATION CALLBACK ===
Animation: Hit from enemy_1 to player_1 for 8 damage
Player hits Enemy for 8 damage!
```

---

## 🚀 **Future Enhancements**

### **Easy to Add:**
- 💀 Death animations (when HP reaches 0)
- 🛡️ Block/parry animations (when guarded)
- ⭐ Critical hit animations (bigger reactions)
- 🩹 Heal animations (positive reaction)
- 😵 Stun animations (dizzy effect)

### **Possible Effects:**
- Screen shake on critical hits
- Blood/impact particles
- Sound effects per class
- Different hurt animations based on damage amount
- Flash/blink effect on impact

---

## ✅ **Testing**

**To See Hurt Animations:**

**1. Test as Warrior:**
- Select Warrior class
- Enter battle
- Let enemy attack you
- Watch 3-frame hurt animation

**2. Test as Huntress:**
- Select Huntress class
- Enter battle  
- Let enemy attack you
- Watch 3-frame agile flinch

**3. Test as Mage:**
- Select Mage class
- Enter battle
- Let enemy attack you
- Watch 4-frame robes flutter

---

## 📊 **Complete Animation System**

All three classes now have **complete animation sets**:

### **Animation State Machine:**
```
      ┌─────────┐
      │  IDLE   │ ←──────────┐
      └─────────┘            │
           ↓                 │
      ┌─────────┐            │
      │ ATTACK  │ ───────────┤
      └─────────┘            │
           ↓                 │
      ┌─────────┐            │
      │  IDLE   │            │
      └─────────┘            │
           ↓                 │
      ┌─────────┐            │
      │  HURT   │ ───────────┘
      └─────────┘
```

---

## 📁 **Files Summary**

### **Modified:**
- ✅ `src/game/characters/warrior.ts` - Added hurt sprite and animation
- ✅ `src/game/characters/huntress.ts` - Added hurt sprite and animation
- ✅ `src/game/characters/mage.ts` - Added hurt sprite and animation
- ✅ `src/scenes/BattleScene.ts` - Added hurt animation trigger

### **Created:**
- ✅ `CHARACTER-HURT-ANIMATIONS.md` - This documentation

---

## 🎯 **Result**

All three character classes now have **full combat animation sets**:

| Animation | Warrior | Huntress | Mage |
|-----------|---------|----------|------|
| **Idle** | ✅ Loop | ✅ Loop | ✅ Loop |
| **Attack** | ✅ 7f | ✅ 6f + 🏹 | ✅ 8f |
| **Hurt** | ✅ 3f | ✅ 3f | ✅ 4f |

Combat now feels **alive and reactive** with characters showing visual feedback for both attacking and taking damage! 💪✨

Test it in battle and watch your characters react to hits! 💔

