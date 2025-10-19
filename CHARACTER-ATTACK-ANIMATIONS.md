# Character Attack Animations - Complete System

## ✨ **All Character Classes Now Have Attack Animations**

Each character class has a unique attack animation that plays when they perform combat actions!

---

## 🎨 **Sprite Sheet Specifications**

### **⚔️ WARRIOR**
- **Source:** [GitHub - Warrior/Attack1.png](https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/warrior/Attack1.png)
- **CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/warrior/Attack1.png`
- **Total Size:** 1134×162 pixels
- **Layout:** 1 row, 7 columns
- **Frame Size:** 162×162 pixels
- **Frame Rate:** 14 FPS (fast, powerful strikes)
- **Animation Key:** `warrior_attack_anim`

### **🏹 HUNTRESS**
- **Source:** [GitHub - Huntress/Attack.png](https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/huntress/Attack.png)
- **CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/huntress/Attack.png`
- **Total Size:** 600×100 pixels
- **Layout:** 1 row, 6 columns
- **Frame Size:** 100×100 pixels
- **Frame Rate:** 12 FPS (swift, agile attacks)
- **Animation Key:** `huntress_attack_anim`

### **🔥 MAGE**
- **Source:** [GitHub - Wizard2/Attack.png](https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/wizard2/Attack.png)
- **CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/wizard2/Attack.png`
- **Total Size:** 1200×150 pixels
- **Layout:** 1 row, 8 columns
- **Frame Size:** 150×150 pixels
- **Frame Rate:** 12 FPS (mystical spell casting)
- **Animation Key:** `mage_attack_anim`

---

## 📋 **Files Modified**

### **Character Sprite Modules:**
1. ✅ `src/game/characters/warrior.ts` - Added attack spritesheet and animation
2. ✅ `src/game/characters/huntress.ts` - Added attack spritesheet and animation
3. ✅ `src/game/characters/mage.ts` - Added attack spritesheet and animation

### **Battle System:**
4. ✅ `src/scenes/BattleScene.ts` - Auto-detects class and plays appropriate attack animation

---

## 🎬 **Animation Flow**

### **Idle → Attack → Idle**
```
🧍 Idle Animation (looping)
  ↓ Attack card played
⚡ Attack Animation (plays once)
  ↓ animationcomplete event
🧍 Idle Animation (resumes looping)
```

### **Example: Mage Casts Fireball**
```
Turn X:
1. Mage selects Fireball card
2. Player locks action
3. Turn resolves
4. Timeline plays effects
5. playStrike() callback fires
6. System detects: Mage class
7. Plays: 'mage_attack_anim'
8. 8 frames @ 12 FPS = 0.67 seconds
9. Animation completes
10. Returns to: 'mage_idle_anim'
```

---

## 🎯 **Trigger System**

### **Automatic Class Detection:**
```typescript
// In playStrike() callback:
const characterClass = battleActor.selectedClass;

if (characterClass === 'Mage') {
  attackAnimKey = 'mage_attack_anim';
} else if (characterClass === 'Warrior') {
  attackAnimKey = 'warrior_attack_anim';
} else if (characterClass === 'Huntress') {
  attackAnimKey = 'huntress_attack_anim';
}

sprite.play(attackAnimKey);

// Auto-return to idle
sprite.once('animationcomplete', () => {
  sprite.play(`${characterClass.toLowerCase()}_idle_anim`);
});
```

---

## 🃏 **Cards That Trigger Attack Animations**

### **⚔️ Warrior Attack Cards:**
- Slash (3 AP) - 7 damage
- Heavy Strike (4 AP) - 11 damage
- Cleave (5 AP) - AOE 5 damage

### **🏹 Huntress Attack Cards:**
- Arrow Shot (2 AP) - 5 damage
- Multi-Shot (4 AP) - AOE 3 damage
- Piercing Arrow (4 AP) - 10 damage
- Poison Arrow (3 AP) - DOT 4×2
- Rapid Fire (5 AP) - 13 damage

### **🔥 Mage Attack Cards:**
- Fireball (3 AP) - 8 damage
- Flame Nova (5 AP) - AOE 6 damage
- Inferno (4 AP) - 12 damage
- Burning Curse (3 AP) - DOT 5×2
- Meteor Strike (6 AP) - 16 damage

---

## ⚡ **Performance Details**

### **Animation Durations:**
| Class | Frames | FPS | Duration | Style |
|-------|--------|-----|----------|-------|
| **Warrior** | 7 | 14 | ~0.5s | Fast, powerful |
| **Huntress** | 6 | 12 | ~0.5s | Swift, agile |
| **Mage** | 8 | 12 | ~0.67s | Mystical, flowing |

### **Optimization:**
- Sprites loaded once during preload
- Animations created once during scene creation
- Reused across multiple attacks
- Event-driven idle return (no polling)

---

## 🎨 **Visual Comparison**

### **Warrior Attack:**
```
🧍 → 🗡️ → 💥 → 🗡️ → 💪 → 🗡️ → 🧍
Idle  Swing  Strike  Follow  Power  Finish  Idle
```
7 frames of powerful melee combat

### **Huntress Attack:**
```
🧍 → 🏹 → 🎯 → 💨 → ➡️ → 🏹 → 🧍
Idle  Draw   Aim   Release Arrow  Ready  Idle
```
6 frames of ranged archery

### **Mage Attack:**
```
🧍 → 🔮 → ✨ → 🌟 → ⚡ → 🔥 → 💫 → ✋ → 🧍
Idle  Focus  Charge  Power  Cast  Blast  Release End  Idle
```
8 frames of spell casting

---

## 🔧 **Technical Implementation**

### **Character Module Structure:**
```typescript
// Each character file (warrior.ts, huntress.ts, mage.ts):

export const [CLASS]_SPRITES = {
  idle: { key, url, frameWidth, frameHeight },
  attack: { key, url, frameWidth, frameHeight },
};

export const [CLASS]_ANIMATIONS = {
  idle: { key, spriteKey, frameCount, frameRate, repeat: -1 },
  attack: { key, spriteKey, frameCount, frameRate, repeat: 0 },
};
```

### **BattleScene Integration:**
```typescript
// Automatic sprite detection and animation playback
const sprite = srcSlot.list.find(obj => obj.type === 'Sprite');
const attackAnimKey = `${characterClass.toLowerCase()}_attack_anim`;

if (this.anims.exists(attackAnimKey)) {
  sprite.play(attackAnimKey);
  sprite.once('animationcomplete', () => {
    sprite.play(`${characterClass.toLowerCase()}_idle_anim`);
  });
}
```

---

## 🎮 **Testing**

### **For Each Class:**

**1. Warrior:**
- Select Warrior in class selection
- Enter battle
- Play any attack card (Slash, Heavy Strike, etc.)
- Watch 7-frame sword attack animation

**2. Huntress:**
- Select Huntress in class selection
- Enter battle
- Play any attack card (Arrow Shot, Piercing Arrow, etc.)
- Watch 6-frame bow attack animation

**3. Mage:**
- Select Mage in class selection
- Enter battle
- Play any attack card (Fireball, Inferno, etc.)
- Watch 8-frame spell casting animation

---

## 📊 **Frame Breakdown**

### **Warrior (7 frames @ 14 FPS):**
```
Frame 0: Ready stance
Frame 1: Wind up
Frame 2: Swing start
Frame 3: Mid-swing
Frame 4: Impact
Frame 5: Follow-through
Frame 6: Recovery → back to idle
```

### **Huntress (6 frames @ 12 FPS):**
```
Frame 0: Ready stance
Frame 1: Draw arrow
Frame 2: Pull back
Frame 3: Aim
Frame 4: Release
Frame 5: Follow-through → back to idle
```

### **Mage (8 frames @ 12 FPS):**
```
Frame 0: Ready stance
Frame 1: Hand raise
Frame 2: Energy gather
Frame 3: Charge
Frame 4: Cast
Frame 5: Spell release
Frame 6: Energy dissipate
Frame 7: Recovery → back to idle
```

---

## ✅ **Benefits**

- ✨ **Visual Feedback:** Each class has unique attack style
- ⚡ **Responsive:** Animations are fast and snappy
- 🎯 **Automatic:** Works for all attack cards
- 🔄 **Seamless:** Smooth transitions back to idle
- 🎨 **Thematic:** Matches class identity (melee/ranged/magic)
- 📦 **Efficient:** Sprite sheets loaded once, reused many times

---

## 🚀 **Future Enhancements**

Ready to add:
- 💔 Hurt/damage taken animations
- 💀 Death animations
- 🛡️ Guard/defend animations
- 🎯 Critical hit animations
- ✨ Special ability animations
- 🏃 Dodge/evade animations

The modular system makes it easy to expand! Just add new sprite sheets to the character modules and they'll automatically integrate. 🎮

---

## 📁 **Files Summary**

Modified:
- ✅ `src/game/characters/warrior.ts`
- ✅ `src/game/characters/huntress.ts`
- ✅ `src/game/characters/mage.ts`
- ✅ `src/scenes/BattleScene.ts`

Created:
- ✅ `CHARACTER-ATTACK-ANIMATIONS.md`

---

All three character classes now have beautiful attack animations that play automatically during combat! ⚔️🏹🔥

