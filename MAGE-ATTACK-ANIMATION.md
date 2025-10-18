# Mage Attack Animation Implementation

## ✨ **Feature**
Added wizard attack sprite sheet animation that plays when the Mage character performs attacks in battle.

---

## 🎨 **Sprite Sheet Details**

**Source:** GitHub - localgod13/Dungeonlike  
**CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/wizard2/Attack.png`

**Dimensions:**
- Total Size: 1200×150 pixels
- Frames: 8 columns, 1 row
- Frame Size: 150×150 pixels each
- Frame Rate: 12 FPS
- Repeat: 0 (plays once, then returns to idle)

---

## 📋 **Files Modified**

### **1. `src/game/characters/mage.ts`** ✅

**Added Attack Sprite Sheet:**
```typescript
export const MAGE_SPRITES: Record<string, SpriteSheetConfig> = {
  idle: {
    key: 'mage_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/wizard2/Idle.png',
    frameWidth: 150,
    frameHeight: 150,
  },
  attack: {
    key: 'mage_attack',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/wizard2/Attack.png',
    frameWidth: 150,  // 1200 / 8 columns
    frameHeight: 150, // 1 row
  },
};
```

**Added Attack Animation Config:**
```typescript
export const MAGE_ANIMATIONS: Record<string, AnimationConfig> = {
  idle: {
    key: 'mage_idle_anim',
    spriteKey: 'mage_idle',
    frameCount: 8,
    frameRate: 8,
    repeat: -1, // Loop forever
  },
  attack: {
    key: 'mage_attack_anim',
    spriteKey: 'mage_attack',
    frameCount: 8,
    frameRate: 12,
    repeat: 0, // Play once
  },
};
```

### **2. `src/scenes/BattleScene.ts`** ✅

**Added Attack Animation Trigger in `playStrike()`:**
```typescript
private playStrike(srcId: ActorId, dstId: ActorId, note?: string): void {
  const srcSlot = this.getActorSlot(srcId);
  
  if (srcSlot) {
    // Try to play attack animation on character sprite
    const actor = [...this.players, ...this.enemies].find(a => a.id === srcId);
    if (actor && actor.side === 'party') {
      const battleActor = actor as BattleActor;
      const characterClass = battleActor.selectedClass;
      
      // Find sprite in the container
      const sprite = srcSlot.list.find(obj => obj.type === 'Sprite') as Phaser.GameObjects.Sprite;
      
      if (sprite && characterClass) {
        // Determine attack animation key based on class
        let attackAnimKey: string | null = null;
        
        if (characterClass === 'Mage') {
          attackAnimKey = 'mage_attack_anim';
        } else if (characterClass === 'Warrior') {
          attackAnimKey = 'warrior_attack_anim';
        } else if (characterClass === 'Huntress') {
          attackAnimKey = 'huntress_attack_anim';
        }
        
        if (attackAnimKey && this.anims.exists(attackAnimKey)) {
          console.log(`Playing attack animation: ${attackAnimKey}`);
          sprite.play(attackAnimKey);
          
          // Return to idle after attack animation completes
          sprite.once('animationcomplete', () => {
            const idleKey = `${characterClass.toLowerCase()}_idle_anim`;
            if (this.anims.exists(idleKey)) {
              sprite.play(idleKey);
            }
          });
        }
      }
    }
    
    // Strike animation - forward movement (slowed for visibility)
    this.tweens.add({
      targets: srcSlot,
      x: srcSlot.x + 20,
      duration: 250,
      yoyo: true,
      ease: 'Power2',
    });
  }
  
  // ... hit animation on target ...
}
```

---

## 🎯 **How It Works**

### **Attack Flow:**

**1. Mage Attacks Enemy:**
```
1. Mage plays attack card (Fireball, Inferno, etc.)
2. Turn resolves and timeline starts
3. playStrike() is called for the Mage
4. System finds Mage sprite in party slot
5. Plays 'mage_attack_anim' (8 frames @ 12 FPS)
6. Attack animation plays (0.67 seconds)
7. animationcomplete event fires
8. Returns to 'mage_idle_anim' automatically
```

### **Animation Sequence:**
```
Idle → Attack → Idle
 🧙     ⚡      🧙
(loop)  (once)  (loop)
```

---

## 🎬 **Animation Timing**

- **Frame Count:** 8 frames
- **Frame Rate:** 12 FPS
- **Duration:** ~667ms (8 frames ÷ 12 FPS)
- **Repeat:** 0 (plays once)
- **Return:** Auto-returns to idle animation

---

## 🔮 **Trigger Conditions**

The Mage attack animation plays when:
- ✅ Mage character attacks (any attack card)
- ✅ Sprite exists in the party slot
- ✅ Attack animation is loaded and available
- ✅ During the `onStrike` callback in combat timeline

**Cards That Trigger Attack Animation:**
- Fireball
- Flame Nova  
- Inferno
- Burning Curse (DOT application)
- Meteor Strike
- Any damage-dealing Mage card

---

## 🛠️ **Extensibility**

### **Easy to Add More Animations:**

**For Warrior:**
```typescript
// In warrior.ts
attack: {
  key: 'warrior_attack',
  url: 'https://cdn.jsdelivr.net/gh/.../Warrior/Attack.png',
  frameWidth: 162,
  frameHeight: 162,
},
```

**For Huntress:**
```typescript
// In huntress.ts
attack: {
  key: 'huntress_attack',
  url: 'https://cdn.jsdelivr.net/gh/.../Huntress/Attack.png',
  frameWidth: 150,
  frameHeight: 150,
},
```

The system automatically detects and plays the correct attack animation based on the character's class!

---

## 🎨 **Visual Result**

**Before:** Mage just moved forward during attacks (generic tween)  
**After:** Mage plays full 8-frame attack animation showing spell casting! ⚡🔥

---

## ✅ **Verification**

To test the animation:
1. Start a battle as the Mage class
2. Play any attack card (Fireball, Inferno, etc.)
3. Watch the Mage sprite
4. Should see 8-frame attack animation
5. Returns to idle loop after completing

Console output:
```
Playing attack animation: mage_attack_anim
Created Mage animation: mage_attack_anim
```

---

## 📁 **Files Modified**

- ✅ `src/game/characters/mage.ts` - Added attack spritesheet and animation config
- ✅ `src/scenes/BattleScene.ts` - Hooked attack animation to playStrike()
- ✅ `MAGE-ATTACK-ANIMATION.md` - This documentation

---

## 🚀 **Future Additions**

Ready to add:
- 🗡️ Warrior attack animations
- 🏹 Huntress attack animations
- 💔 Hurt/damage taken animations
- 💀 Death animations
- 🛡️ Guard/defend animations
- 🎯 Special ability animations

The system is modular and ready to expand! 🧙‍♂️✨

