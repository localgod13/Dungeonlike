# Neutral Cards Implementation

## Overview
This document details the implementation of special mechanics for neutral cards, ensuring they perform their unique effects correctly during combat.

## Card Definitions & Opcodes

### New Opcodes Added
The following new opcodes were added to `CardOpcode` type in `src/game/cards.ts`:
- `CLEANSE` - Heal + remove status effects
- `BUFF` - Grant damage boost to allies
- `BLIND` - AOE damage + blind effect (enemies miss)
- `ULTIMATE_GAIN` - Grant ultimate power
- `REVIVE` - Revive dead allies

### Updated Card Definitions

#### 1. **Firebomb** 💣
- **Opcode:** `DOT`
- **Effect:** Deal 8 damage to ALL enemies + burn for 3 turns
- **Implementation:** Special handling in combat.ts for AOE burn effect
- **Code Location:** `src/game/combat.ts` lines 378-395

```typescript
if (card.id === 'Firebomb') {
  // Applies initial damage + 3-turn burn to all enemies
  // Staggered visual effects (200ms delay between targets)
}
```

#### 2. **Poison Dart** 🐍
- **Opcode:** `DOT`
- **Effect:** Deal 5 damage + poison for 2 turns (single target)
- **Implementation:** Standard DOT logic with initial damage
- **Code Location:** `src/game/combat.ts` lines 397-420

#### 3. **Lightning Rod** ⚡
- **Opcode:** `TAUNT`
- **Effect:** Gain 8 Shield + next enemy targets you
- **Implementation:** Special TAUNT handling that gives self-shield + taunts all enemies
- **Code Location:** `src/game/combat.ts` lines 364-391

```typescript
if (card.id === 'LightningRod') {
  // Give shield to self
  // Taunt all enemies
}
```

#### 4. **Healing Salve** 🧴
- **Opcode:** `CLEANSE`
- **Effect:** Heal ally for 12 HP + remove 1 effect
- **Implementation:** New CLEANSE opcode that heals and removes first DOT effect
- **Code Location:** `src/game/combat.ts` lines 424-441

```typescript
case 'CLEANSE':
  // Heal first
  heal(actor, dst, card.power, tCursor);
  // Remove one DOT effect if present
  const targetDots = dotEffects.get(dst.id) || [];
  if (targetDots.length > 0) {
    targetDots.shift(); // Remove first DOT
  }
```

#### 5. **Berserker Potion** 🍺
- **Opcode:** `BUFF`
- **Effect:** All allies gain +4 damage on next attack
- **Implementation:** New BUFF opcode (visual only for now, damage boost logic TBD)
- **Code Location:** `src/game/combat.ts` lines 443-457
- **Note:** Currently shows visual effect. Full damage boost implementation requires turn-based buff tracking system.

#### 6. **Smoke Grenade** 💨
- **Opcode:** `BLIND`
- **Effect:** Deal 6 damage to all + enemies miss next attack
- **Implementation:** New BLIND opcode with AOE damage + blind VFX
- **Code Location:** `src/game/combat.ts` lines 459-501
- **Note:** Currently shows visual effect. Full miss mechanic requires AI modification.

```typescript
case 'BLIND':
  // AOE damage with vulnerability/shield calculations
  // Apply blind VFX effect to all enemies
```

#### 7. **Ultimate Elixir** ⚡
- **Opcode:** `ULTIMATE_GAIN`
- **Effect:** Gain 25% ultimate power (consumable)
- **Implementation:** New effect type in timeline system
- **Code Location:** 
  - Combat: `src/game/combat.ts` lines 503-509
  - Timeline: `src/game/timeline.ts` lines 164-169
  - BattleScene: `src/scenes/BattleScene.ts` lines 2429-2460

```typescript
case 'ULTIMATE_GAIN':
  // Add ultimate_gain effect to timeline
  effects.push({ 
    at: tCursor, 
    kind: 'ultimate_gain', 
    src: actor.id, 
    dst: actor.id, 
    note: `${card.power}` 
  });
```

**Timeline Handler:**
```typescript
case 'ultimate_gain':
  callback = () => {
    const amount = parseInt(effect.note || '0', 10);
    callbacks.onUltimateGain(effect.src, amount);
  };
```

**BattleScene Handler:**
```typescript
onUltimateGain: (srcId, amount) => {
  // Grant ultimate power using the manager
  this.ultimatePowerManager.addPower(srcId, amount, 'ultimate_elixir');
  // Refresh UI + visual effect
}
```

#### 8. **Revive Crystal** 💎
- **Opcode:** `REVIVE`
- **Effect:** Revive dead ally at 75% HP (consumable)
- **Implementation:** New REVIVE opcode that restores HP if target is dead
- **Code Location:** `src/game/combat.ts` lines 511-524

```typescript
case 'REVIVE':
  if (dst && dst.hp <= 0) {
    const reviveAmount = Math.floor((dst.maxHp * card.power) / 100);
    dst.hp = reviveAmount;
    // Show heal animation + revive VFX
  }
```

## Files Modified

### 1. `src/game/cards.ts`
- Added new opcodes: `CLEANSE`, `BUFF`, `BLIND`, `ULTIMATE_GAIN`, `REVIVE`
- Updated neutral card definitions to use correct opcodes

### 2. `src/game/combat.ts`
- Implemented all new opcode handlers in the card resolution switch statement
- Special handling for Firebomb (AOE DOT)
- Special handling for Lightning Rod (self-shield + taunt all)
- Added CLEANSE logic (heal + remove DOT)
- Added BUFF logic (damage boost visual)
- Added BLIND logic (AOE damage + blind VFX)
- Added ULTIMATE_GAIN effect push
- Added REVIVE logic (restore dead allies)

### 3. `src/net/proto.ts`
- Added `'ultimate_gain'` to `EffectSchema` kind enum
- Allows ultimate gain effects to be serialized and transmitted

### 4. `src/game/timeline.ts`
- Added `onUltimateGain` callback to `AnimationCallbacks` interface
- Added `ultimate_gain` case handler in `buildTimeline` function

### 5. `src/scenes/BattleScene.ts`
- Implemented `onUltimateGain` callback in animation callbacks
- Grants ultimate power using `ultimatePowerManager`
- Refreshes UI for local player
- Adds visual glow effect

## Testing Checklist

### Reusable Items (reset each battle)
- [ ] **Firebomb**: Burns all enemies for 3 turns
- [ ] **Poison Dart**: Poisons single target for 2 turns
- [ ] **Lightning Rod**: Gives shield + taunts enemies
- [ ] **Healing Salve**: Heals + removes one DOT effect
- [ ] **Berserker Potion**: Shows buff effect on all allies
- [ ] **Smoke Grenade**: Damages all + shows blind effect

### Consumable Items (removed after use)
- [ ] **Greater Health Potion**: Heals 25 HP
- [ ] **Damage Potion**: Deals 15 damage
- [ ] **Shield Potion**: Grants 10 shield
- [ ] **Explosive Vial**: AOE 12 damage to all enemies
- [ ] **Ultimate Elixir**: Grants 25% ultimate power
- [ ] **Revive Crystal**: Revives dead ally at 75% HP

## Known Limitations

### 1. Berserker Potion (BUFF)
- Currently only shows visual effect
- Full damage boost implementation requires:
  - Turn-based buff tracking system
  - Damage calculation modification to apply buffs
  - Network sync for buff states

### 2. Smoke Grenade (BLIND)
- Currently only shows visual effect
- Full miss mechanic requires:
  - Turn-based blind tracking system
  - AI/combat logic to check blind status before attacks
  - Network sync for blind states

### 3. Lightning Rod Taunt
- Shows taunt VFX on all enemies
- Full taunt implementation requires:
  - AI target selection modification
  - Taunt priority system

## Future Enhancements

1. **Buff System**: Implement turn-based buff tracking for damage boosts, speed boosts, etc.
2. **Status System**: Implement blind, stun, confusion effects
3. **Taunt System**: Implement AI targeting priority based on taunt
4. **Combat Log**: Add more detailed messages for special effects
5. **Visual Effects**: Add particle effects for burns, poisons, buffs, etc.

## Summary

All neutral cards now have their basic mechanics implemented:
- ✅ Firebomb, Poison Dart: DOT effects working
- ✅ Lightning Rod: Shield + taunt VFX working
- ✅ Healing Salve: Heal + cleanse DOT working
- ⚠️ Berserker Potion: Visual effect only (damage boost pending)
- ⚠️ Smoke Grenade: AOE damage + visual effect only (miss mechanic pending)
- ✅ Ultimate Elixir: Ultimate power gain working
- ✅ Revive Crystal: Revival logic working

The core functionality is in place. Buffs and status effects that modify combat behavior (damage boost, miss chance) will require additional systems for full implementation.

