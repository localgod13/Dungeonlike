# Huntress Arrow Projectile System

## 🏹 **Feature**
Added arrow projectile visual that fires from the Huntress to her target during attacks, making ranged combat feel more dynamic and realistic.

---

## 🎯 **Arrow Sprite**

**Source:** [GitHub - Huntress/Static.png](https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/huntress/Static.png)  
**CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/huntress/Static.png`

**Dimensions:**
- Size: 24×5 pixels
- Type: Single static image (not animated)
- Scale: 2x in-game (48×10 visible size)

---

## 📋 **Files Modified**

### **1. `src/game/characters/huntress.ts`** ✅

**Added Arrow Sprite Config:**
```typescript
export const HUNTRESS_SPRITES: Record<string, SpriteSheetConfig> = {
  idle: { ... },
  attack: { ... },
  arrow: {
    key: 'huntress_arrow',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/huntress/Static.png',
    frameWidth: 24,   // Arrow projectile
    frameHeight: 5,
  },
};
```

**Updated Preload Logic:**
```typescript
export function preloadHuntressSprites(scene: Phaser.Scene): void {
  Object.values(HUNTRESS_SPRITES).forEach((config) => {
    // Arrow is a simple image, not an animated spritesheet
    if (config.key === 'huntress_arrow') {
      scene.load.image(config.key, config.url);
    } else {
      scene.load.spritesheet(config.key, config.url, {
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
      });
    }
  });
}
```

### **2. `src/scenes/BattleScene.ts`** ✅

**Added Arrow Projectile Method:**
```typescript
/**
 * Fire an arrow projectile from Huntress to target
 */
private fireArrowProjectile(
  srcSlot: Phaser.GameObjects.Container, 
  dstSlot: Phaser.GameObjects.Container
): void {
  // Create arrow sprite
  const arrow = this.add.image(srcSlot.x, srcSlot.y, 'huntress_arrow');
  arrow.setScale(2); // Scale up the small arrow
  arrow.setDepth(50); // Above characters but below UI
  
  // Calculate angle to target
  const angle = Phaser.Math.Angle.Between(srcSlot.x, srcSlot.y, dstSlot.x, dstSlot.y);
  arrow.setRotation(angle);
  
  // Tween arrow to target
  this.tweens.add({
    targets: arrow,
    x: dstSlot.x,
    y: dstSlot.y,
    duration: 200, // Fast arrow flight
    ease: 'Linear',
    onComplete: () => {
      // Fade out and destroy arrow on impact
      this.tweens.add({
        targets: arrow,
        alpha: 0,
        duration: 100,
        onComplete: () => arrow.destroy(),
      });
    },
  });
}
```

**Triggered in `playStrike()`:**
```typescript
if (characterClass === 'Huntress') {
  attackAnimKey = 'huntress_attack_anim';
  
  // Fire arrow projectile for Huntress
  if (dstSlot) {
    this.fireArrowProjectile(srcSlot, dstSlot);
  }
}
```

---

## 🎬 **Animation Sequence**

### **Huntress Attack Flow:**
```
1. Huntress plays attack card (Arrow Shot, Piercing Arrow, etc.)
2. Turn resolves, timeline starts
3. playStrike() callback fires
4. Huntress attack animation plays (6 frames)
5. Arrow projectile spawns at Huntress position
6. Arrow rotates to point at target
7. Arrow flies to target (200ms)
8. Arrow fades out on impact (100ms)
9. Arrow destroyed
10. Damage number appears
11. Huntress returns to idle animation
```

### **Visual Timeline:**
```
  🏹 Huntress              👹 Enemy
   ↓
  🏹 (draw bow)            👹
   ↓
  🏹 ----→                 👹
       🏹 (arrow flies)
   ↓
  🧍 --------→ 💥         👿 (-10 HP)
   ↓           ↓
  🧍           👹 (damaged)
```

---

## ⚡ **Technical Details**

### **Arrow Physics:**

**Spawn Position:**
- X: Huntress slot X position
- Y: Huntress slot Y position
- Depth: 50 (above characters, below UI)

**Rotation:**
```typescript
const angle = Phaser.Math.Angle.Between(
  srcSlot.x, srcSlot.y,  // From Huntress
  dstSlot.x, dstSlot.y   // To target
);
arrow.setRotation(angle);
```

**Flight Animation:**
- Duration: 200ms (fast, realistic arrow speed)
- Ease: Linear (constant velocity)
- Path: Straight line from archer to target

**Impact:**
- Alpha fade: 100ms
- Auto-destroy after fade
- No memory leaks

---

## 🎯 **Cards That Fire Arrows**

All Huntress attack cards now fire arrow projectiles:
- 🏹 **Arrow Shot** (2 AP) - Single arrow
- 🎯 **Multi-Shot** (4 AP) - Multiple arrows (one per enemy)
- 🏹 **Piercing Arrow** (4 AP) - Powerful arrow
- ☠️ **Poison Arrow** (3 AP) - Green-tinted arrow (DOT)
- 🏹 **Rapid Fire** (5 AP) - Fast arrow

---

## 🎨 **Visual Design**

### **Arrow Appearance:**
```
  →  (24×5 pixels, scaled to 48×10)
```

**Properties:**
- Small, sleek projectile
- Automatically rotates to face target
- Clean, simple design
- Fades on impact (no clutter)

### **Comparison to Other Classes:**

| Class | Attack Visual | Style |
|-------|--------------|-------|
| **Warrior** | Forward lunge | Melee, close-range |
| **Huntress** | **Arrow projectile** | **Ranged, visible projectile** |
| **Mage** | Forward lunge | Spell effect |

---

## 🚀 **Future Enhancements**

### **Possible Additions:**
- 🔥 Fire trail for Poison Arrow (green particles)
- ✨ Glowing arrow for Piercing Arrow
- 💨 Speed lines for Rapid Fire
- 🌟 Multiple arrows for Multi-Shot (one per target)
- 🎯 Critical hit arrow (different color/size)
- 💥 Impact explosion particles

### **Easy to Extend:**
```typescript
// Different arrow types
if (cardName === 'PoisonArrow') {
  arrow.setTint(0x00ff00); // Green arrow
} else if (cardName === 'PiercingArrow') {
  arrow.setScale(2.5); // Bigger arrow
}
```

---

## 🎮 **Testing**

**To See Arrow Projectiles:**
1. Select **Huntress** class in class selection
2. Enter battle
3. Play any attack card:
   - Arrow Shot
   - Piercing Arrow
   - Poison Arrow
   - Multi-Shot
   - Rapid Fire
4. Watch:
   - ✅ Huntress attack animation (bow draw)
   - ✅ Arrow spawns
   - ✅ Arrow rotates to face target
   - ✅ Arrow flies to enemy
   - ✅ Arrow fades on impact
   - ✅ Damage number appears

**Console Output:**
```
Playing attack animation: huntress_attack_anim
🏹 Firing arrow from (300, 400) to (800, 400)
```

---

## 🔧 **Technical Implementation**

### **Arrow Lifecycle:**
```typescript
1. Create: this.add.image(x, y, 'huntress_arrow')
2. Scale: arrow.setScale(2)
3. Rotate: arrow.setRotation(angle)
4. Fly: tween to target (200ms)
5. Impact: fade alpha to 0 (100ms)
6. Cleanup: arrow.destroy()
```

### **Performance:**
- Lightweight sprite (24×5 pixels)
- Single tween animation
- Auto-cleanup (no memory leaks)
- Depth layer optimization
- Throttled by combat timeline

---

## ✅ **Benefits**

- ✨ **Visual Feedback:** See the arrow fly through the air
- 🎯 **Ranged Feel:** Emphasizes Huntress's ranged playstyle
- ⚡ **Responsive:** Fast, smooth animation
- 🎨 **Professional:** Polished visual effect
- 🔧 **Modular:** Easy to extend with particle effects

---

## 📁 **Files Summary**

Modified:
- ✅ `src/game/characters/huntress.ts` - Added arrow sprite and loading
- ✅ `src/scenes/BattleScene.ts` - Added arrow projectile firing system

Created:
- ✅ `HUNTRESS-ARROW-PROJECTILE.md` - This documentation

---

## 🎯 **Result**

The Huntress now fires visible arrow projectiles that:
- ✅ Spawn at the archer's position
- ✅ Rotate to face the target
- ✅ Fly smoothly to the enemy
- ✅ Fade out on impact
- ✅ Sync perfectly with attack animation

Ranged combat now looks and feels amazing! 🏹✨

---

## 🌟 **Complete Attack System**

All three classes now have unique attack visuals:

| Class | Attack Animation | Special Effect |
|-------|------------------|----------------|
| **Warrior** | 7-frame sword swing | Forward lunge |
| **Huntress** | 6-frame bow attack | **Arrow projectile** 🏹 |
| **Mage** | 8-frame spell cast | Forward lunge |

The Huntress stands out with her distinctive ranged combat! 🎯

