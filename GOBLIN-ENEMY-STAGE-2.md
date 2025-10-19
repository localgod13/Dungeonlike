# Goblin Enemy & Stage-Based Encounters

## 🧌 **New Enemy: Goblin**

Added Goblin enemy type with idle animation, and implemented stage-based enemy spawning system!

---

## 🎨 **Goblin Sprite**

**Source:** [GitHub - Enemies/goblin/IDLE.png](https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/Enemies/goblin/IDLE.png)  
**CDN URL:** `https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/goblin/IDLE.png`

**Dimensions:**
- Total Size: 696×78 pixels
- Layout: 1 row, 6 columns
- Frame Size: 116×78 pixels (696÷6)
- Frame Rate: 8 FPS (moderate pace)
- Loop: Infinite (continuous idle)

---

## 📋 **Files Created/Modified**

### **Created:**
1. ✅ `src/game/enemies/goblin.ts` - Goblin enemy module

### **Modified:**
2. ✅ `src/game/enemySprites.ts` - Added Goblin to enemy system
3. ✅ `src/scenes/BattleScene.ts` - Stage-based enemy generation

---

## 🎯 **Stage-Based Enemy System**

### **Stage 1: Flying Demon**
```javascript
{
  enemies: 1,
  type: 'Flying Demon',
  hp: 50,
}
```
**Challenge:** Learn the basics, single target

### **Stage 2: Two Goblins** 
```javascript
{
  enemies: 2,
  types: ['Goblin Warrior', 'Goblin Archer'],
  hp: [40, 35],
}
```
**Challenge:** Multiple targets, target prioritization

### **Stage 3+: Scaled Difficulty**
```javascript
{
  enemies: 1-3 (scales with stage),
  type: 'Goblin',
  hp: 40 + (stage × 5), // HP increases per stage
}
```
**Challenge:** Increasing difficulty, more enemies

---

## 🔧 **Implementation**

### **generateEnemiesForStage() Method:**
```typescript
private generateEnemiesForStage(stage: number): Actor[] {
  console.log(`🎯 Generating enemies for Stage ${stage}`);
  
  switch (stage) {
    case 1:
      // Stage 1: Single Flying Demon
      return [{
        id: 'enemy_1',
        side: 'enemy',
        name: 'Flying Demon',
        hp: 50,
        maxHp: 50,
        ap: 5,
      }];
    
    case 2:
      // Stage 2: Two Goblins
      return [
        {
          id: 'enemy_1',
          side: 'enemy',
          name: 'Goblin Warrior',
          hp: 40,
          maxHp: 40,
          ap: 5,
        },
        {
          id: 'enemy_2',
          side: 'enemy',
          name: 'Goblin Archer',
          hp: 35,
          maxHp: 35,
          ap: 5,
        },
      ];
    
    default:
      // Stage 3+: Scale difficulty
      const enemyCount = Math.min(1 + Math.floor(stage / 2), 3);
      const baseHP = 40 + (stage * 5);
      
      return Array.from({ length: enemyCount }, (_, i) => ({
        id: `enemy_${i + 1}`,
        side: 'enemy',
        name: `Goblin ${i + 1}`,
        hp: baseHP,
        maxHp: baseHP,
        ap: 5,
      }));
  }
}
```

### **Called in create():**
```typescript
// Create enemies based on stage
this.enemies = this.generateEnemiesForStage(this.currentStage);
```

---

## 📊 **Enemy Scaling Table**

| Stage | Enemies | Type | HP Per Enemy | Total HP |
|-------|---------|------|-------------:|:--------:|
| **1** | 1 | Flying Demon | 50 | 50 |
| **2** | 2 | Goblins | 40, 35 | 75 |
| **3** | 2 | Goblins | 55 each | 110 |
| **4** | 2 | Goblins | 60 each | 120 |
| **5** | 3 | Goblins | 65 each | 195 |
| **6** | 3 | Goblins | 70 each | 210 |

**Scaling Formula:**
- Enemy Count: `min(1 + floor(stage / 2), 3)`
- Enemy HP: `40 + (stage × 5)`
- Max Enemies: 3 (cap)

---

## 🧌 **Goblin Features**

### **Animation:**
- 6-frame idle animation
- 8 FPS (moderate pace)
- Smooth looping
- No floating effect (ground-based enemy)

### **Visual Style:**
- Smaller than Flying Demon
- Ground-dwelling creature
- Animated idle stance

---

## 🎮 **Battle Progression**

### **Stage 1:**
```
🧍 🧍 🧍 Party    vs    👿 Flying Demon
```
Single enemy, learn mechanics

### **Stage 2:**
```
🧍 🧍 🧍 Party    vs    🧌 Goblin Warrior
                        🧌 Goblin Archer
```
Multiple enemies, AOE strategies matter

### **Stage 3+:**
```
🧍 🧍 🧍 Party    vs    🧌 Goblin 1 (55 HP)
                        🧌 Goblin 2 (55 HP)
```
Scaling challenge

---

## ✨ **Strategic Implications**

### **Stage 2 Tactics:**
**Two Enemies = New Strategy:**
- AOE cards more valuable (Cleave, Flame Nova, Multi-Shot)
- Target prioritization matters (kill weaker Archer first?)
- Guard/taunt abilities can protect team
- DOT effects can whittle down both

**Example Strategy:**
1. Mage uses Flame Nova (AOE 6 damage to both)
2. Huntress uses Multi-Shot (AOE 3 damage to both)
3. Warrior focuses down Goblin Archer (weaker HP)
4. Victory with less total damage taken

---

## 🎨 **Visual Layout**

### **Stage 2 Battle Screen:**
```
Top Right:
  Stage 2  ← Gold
  Turn 1   ← White

Center:
  🧍 🧍 🧍         🧌 🧌
  Warriors       Goblins
```

**Enemy Positions:**
- Multiple enemies spread horizontally
- Each has own sprite animation
- Independent HP bars
- Individual targeting

---

## 🔍 **Console Logs**

**Stage 1:**
```
🎯 Generating enemies for Stage 1
Creating 1 enemy: Flying Demon (50 HP)
✓ Using sprite for enemy: Flying Demon (FlyingDemon)
```

**Stage 2:**
```
🎯 Generating enemies for Stage 2
Creating 2 enemies:
  - Goblin Warrior (40 HP)
  - Goblin Archer (35 HP)
✓ Using sprite for enemy: Goblin Warrior (Goblin)
✓ Using sprite for enemy: Goblin Archer (Goblin)
```

---

## 📈 **Difficulty Curve**

### **Total Enemy HP by Stage:**
```
Stage 1:  50 HP  (1 enemy)
Stage 2:  75 HP  (2 enemies) ← 50% increase
Stage 3: 110 HP  (2 enemies) ← 47% increase
Stage 4: 120 HP  (2 enemies) ← 9% increase
Stage 5: 195 HP  (3 enemies) ← 63% increase
Stage 6: 210 HP  (3 enemies) ← 8% increase
```

**Balanced Progression:**
- Clear difficulty steps
- Stage 2 teaches multi-target combat
- Stage 5 introduces 3-enemy fights
- HP scales steadily

---

## 🚀 **Easy to Extend**

### **Add More Stage-Specific Encounters:**
```typescript
case 3:
  return [{
    id: 'enemy_1',
    name: 'Skeleton King',
    hp: 80,
    ...
  }];

case 4:
  return [
    { name: 'Slime', hp: 30 },
    { name: 'Slime', hp: 30 },
    { name: 'Slime', hp: 30 },
  ];
```

### **Boss Encounters:**
```typescript
case 10:
  return [{
    id: 'boss_1',
    name: 'Dragon',
    hp: 200,
    ...
  }];
```

---

## ✅ **Files Summary**

**Created:**
- ✅ `src/game/enemies/goblin.ts` - Goblin enemy module
- ✅ `GOBLIN-ENEMY-STAGE-2.md` - This documentation

**Modified:**
- ✅ `src/game/enemySprites.ts` - Added Goblin support
- ✅ `src/scenes/BattleScene.ts` - Stage-based enemy generation

---

## 🎯 **Result**

**Stage 1 Battle:**
- 1 Flying Demon (50 HP)
- Hovering animation
- Good intro battle

**Stage 2 Battle:**
- 2 Goblins (40 HP + 35 HP)
- Both with idle animations
- Increased challenge
- Teaches multi-target strategy

**Stage 3+ Battles:**
- Auto-scaling difficulty
- More enemies and HP as stages increase
- Keeps game challenging

---

## 🎮 **Testing Checklist**

- [ ] Stage 1: Fight Flying Demon
- [ ] Win and return to map
- [ ] Select another battle node
- [ ] Stage 2: See 2 animated Goblins
- [ ] Both Goblins have animations
- [ ] Can target each individually
- [ ] AOE cards hit both
- [ ] Stage counter shows "Stage 2"

---

Your game now has **progressive difficulty** with stage-based enemy encounters! 🧌✨

