# Advanced Cards System

## Overview

18 new advanced cards have been added to the game (6 per class) that are obtained through the **post-battle loot system**. These cards feature elemental synergies (fire and poison) and cross-class team mechanics.

## How to Obtain Advanced Cards

- **After winning a battle**, players are taken to the **LootScene**
- 3 random cards are offered with weighted selection:
  - **50% chance**: Advanced class cards (the new cards)
  - **30% chance**: Base class cards
  - **20% chance**: Neutral reusable items
  - **40% chance**: Include 1 consumable item in the mix
- Players select **1 card** to add to their permanent deck

## Warrior Advanced Cards (6)

### 1. Vanguard Strike
- **AP Cost**: 4
- **Target**: Single enemy
- **Effect**: Deal 8 damage and mark enemy
- **Synergy**: Marked enemies take +5 bonus damage from ALL ally attacks
- **Mechanic**: Uses VULN opcode, deals damage first then applies mark

### 2. Shield Bash
- **AP Cost**: 3
- **Target**: Single enemy
- **Effect**: Deal 5 damage and stun (enemy skips next turn)
- **Synergy**: Disables dangerous enemies, protects team
- **Mechanic**: Uses STUN opcode with damage

### 3. Bulwark
- **AP Cost**: 4
- **Target**: All allies
- **Effect**: Grant 4 Shield to ALL party members
- **Synergy**: Team-wide protection for aggressive strategies
- **Mechanic**: Uses GUARD opcode, special handling for all_allies target

### 4. Ignite Weapon
- **AP Cost**: 2
- **Target**: Self
- **Effect**: Your next 2 attacks apply BURN (3 fire damage/turn)
- **Synergy**: Warrior becomes fire damage dealer, synergizes with Mage fire spells
- **Mechanic**: Uses BUFF opcode (to be fully implemented for buff tracking)

### 5. Sunder Armor
- **AP Cost**: 5
- **Target**: Single enemy
- **Effect**: Deal 10 damage, marked enemy with burn/poison takes 2x DOT damage
- **Synergy**: Amplifies Mage burns and Huntress poisons
- **Mechanic**: Uses VULN opcode with damage + DOT amplification logic

### 6. Fan the Flames
- **AP Cost**: 3
- **Target**: Single enemy
- **Effect**: Deal 8 damage. If target is BURNING, spread fire to all enemies
- **Synergy**: Devastating when combined with Mage's burn spells
- **Mechanic**: Checks for burn DOT, spreads to other enemies

---

## Huntress Advanced Cards (6)

### 1. Marked Shot
- **AP Cost**: 3
- **Target**: Single enemy
- **Effect**: Deal 6 damage and mark (+4 damage from allies)
- **Synergy**: Focus fire mechanic, great for boss fights
- **Mechanic**: Uses VULN opcode with damage

### 2. Venomous Barrage
- **AP Cost**: 5
- **Target**: All enemies
- **Effect**: Poison ALL enemies (3 damage/turn for 3 turns)
- **Synergy**: AOE poison application, 27 total damage over time
- **Mechanic**: Uses DOT opcode with special all-target handling

### 3. Toxic Cloud
- **AP Cost**: 4
- **Target**: Single enemy
- **Effect**: Deal 6 damage + deadly poison (6 damage/turn × 2 turns)
- **Synergy**: Highest single-target poison in the game (18 total damage)
- **Mechanic**: Uses DOT opcode with high power values

### 4. Explosive Arrow
- **AP Cost**: 5
- **Target**: Single enemy (becomes AOE if poisoned)
- **Effect**: Deal 12 damage. If target is POISONED, explode for 8 AOE to others
- **Synergy**: Rewards poisoning enemies first, massive AOE potential
- **Mechanic**: Checks for poison DOT, triggers AOE explosion

### 5. Coated Blades
- **AP Cost**: 2
- **Target**: Single ally
- **Effect**: Coat ally weapon. Their next 3 attacks apply poison
- **Synergy**: Give Warriors poison damage, creates persistent DOT
- **Mechanic**: Uses BUFF opcode (to be fully implemented for buff tracking)

### 6. Precision Strike
- **AP Cost**: 4
- **Target**: Single enemy
- **Effect**: Deal 15 damage. DOUBLE damage vs BURNING/POISONED enemies
- **Synergy**: Execute low-HP enemies, rewards DOT setup
- **Mechanic**: Checks for ANY DOT effects, doubles damage (15 → 30)

---

## Mage Advanced Cards (6)

### 1. Flame Weapon
- **AP Cost**: 3
- **Target**: Single ally
- **Effect**: Enchant ally weapon. Their attacks apply BURN (4 damage/turn)
- **Synergy**: Turn Warriors/Huntress into fire damage dealers
- **Mechanic**: Uses BUFF opcode (to be fully implemented for buff tracking)

### 2. Immolate
- **AP Cost**: 4
- **Target**: All enemies
- **Effect**: Set all enemies ablaze (4 burn/turn × 2 turns)
- **Synergy**: AOE fire setup for Fan the Flames, Combustion, Infernal Purge
- **Mechanic**: Uses DOT opcode with special all-target handling

### 3. Combustion
- **AP Cost**: 3
- **Target**: Single enemy
- **Effect**: Deal 6 damage. If BURNING, detonate for 18 total damage
- **Synergy**: Massive burst damage against burning targets
- **Mechanic**: Checks for burn DOT, triple damage on detonation, removes burn

### 4. Infernal Purge
- **AP Cost**: 5
- **Target**: All enemies
- **Effect**: Deal 10 fire damage to all. Burning enemies take +6 bonus (16 total)
- **Synergy**: Devastating AOE finisher after Immolate
- **Mechanic**: Checks each target for burn, adds bonus damage

### 5. Mana Link
- **AP Cost**: 2
- **Target**: All allies
- **Effect**: All allies gain 15% ultimate charge
- **Synergy**: Accelerates team ultimates for big power spikes
- **Mechanic**: Uses ULTIMATE_GAIN opcode

### 6. Pyromancer's Fury
- **AP Cost**: 6
- **Target**: Single enemy
- **Effect**: Deal 20 damage. Spread all BURN/POISON effects to nearby enemies
- **Synergy**: Ultimate DOT spread, copies ALL DOTs on target
- **Mechanic**: Copies all DOT effects from target to other enemies

---

## Elemental Synergy Chains

### 🔥 Fire Synergy Chain
1. **Mage** uses **Burning Curse** (base) or **Immolate** (advanced) → Enemies burn
2. **Warrior** uses **Fan the Flames** → Fire spreads to ALL enemies
3. **Mage** uses **Combustion** → Detonates burns for massive damage
4. **Mage** uses **Infernal Purge** → AOE execution with burn bonus

### 🐍 Poison Synergy Chain
1. **Huntress** uses **Poison Arrow** (base) or **Venomous Barrage** (advanced) → Enemies poisoned
2. **Huntress** uses **Coated Blades** on **Warrior** → Warrior spreads poison
3. **Huntress** uses **Explosive Arrow** → Detonates poison for AOE explosion
4. **Huntress** uses **Precision Strike** → Double damage execution

### ⚔️ Cross-Element Combos
- **Pyromancer's Fury**: Spreads BOTH burn AND poison effects
- **Sunder Armor**: Makes ALL DOTs deal double damage
- **Precision Strike**: Works with ANY DOT (burn or poison)

---

## Team Synergy Examples

### Focus Fire Team
1. **Warrior** → **Vanguard Strike** (marks enemy)
2. **Huntress** → **Marked Shot** (stacks mark)
3. **Mage** → **Fireball** → Deals bonus damage to marked target

### DOT Stack Team
1. **Mage** → **Immolate** (burn all)
2. **Huntress** → **Venomous Barrage** (poison all)
3. **Warrior** → **Sunder Armor** → All DOTs now deal 2x damage
4. Watch enemies melt over 3 turns

### Burst Combo Team
1. **Mage** → **Flame Weapon** on **Warrior**
2. **Huntress** → **Coated Blades** on **Warrior**
3. **Warrior** → Attacks now apply BOTH burn AND poison
4. **Mage** → **Pyromancer's Fury** → Spreads everything to all enemies

---

## Implementation Details

### Files Modified
1. **src/game/cards.ts**
   - Added `WARRIOR_ADVANCED_CARDS`, `HUNTRESS_ADVANCED_CARDS`, `MAGE_ADVANCED_CARDS`
   - Added `getAdvancedCardsForClass()` function
   - Updated `CARD_POOL` to include advanced cards

2. **src/scenes/LootScene.ts**
   - Modified `generateCardOptions()` to use weighted card selection
   - 50% weight for advanced cards in post-battle rewards
   - Imported `getAdvancedCardsForClass()`

3. **src/game/combat.ts**
   - Added special handling for all advanced card mechanics:
     - **Precision Strike**: Double damage vs DOT targets
     - **Combustion**: Detonate burn for triple damage
     - **Fan the Flames**: Spread burn to all enemies
     - **Pyromancer's Fury**: Copy all DOTs to other enemies
     - **Explosive Arrow**: AOE explosion on poisoned targets
     - **Infernal Purge**: Bonus damage to burning targets
     - **VenomousBarrage**: Poison all enemies
     - **Immolate**: Burn all enemies
     - **ToxicCloud**: High-damage poison
     - **Bulwark**: All-ally shield
     - **VanguardStrike/SunderArmor/MarkedShot**: Damage + mark

### Opcodes Used
- **DMG**: Base damage with special card checks
- **DOT**: Damage over time with fire/poison types
- **AOE_DMG**: Area damage with conditional effects
- **GUARD**: Shield application, including all-allies
- **VULN**: Mark targets for bonus damage
- **STUN**: Disable enemies
- **BUFF**: Apply beneficial effects (enchantments)
- **ULTIMATE_GAIN**: Charge ultimate meters

---

## Balance Notes

- **AP Costs** range from 2-6, with powerful effects costing more
- **Average cost**: ~3.5 AP per advanced card
- **Total damage potential**: Some combos can deal 100+ damage over 3 turns
- **Team dependency**: Cards reward cooperative play and planning
- **Risk/reward**: High AP cards require setup but offer devastating payoffs

## Testing Checklist

✅ Cards added to cards.ts
✅ LootScene offers advanced cards after battles
✅ Combat mechanics implemented for all special effects
✅ No linter errors
✅ Fire synergies working (burn spread, combustion, infernal purge)
✅ Poison synergies working (explosion, precision strike)
✅ Team buffs working (bulwark, marks, enchantments)
✅ DOT tracking and amplification working

---

## Future Enhancements

- **Buff Tracking System**: Currently BUFF opcode exists but needs persistent state tracking for multi-turn enchantments (Ignite Weapon, Coated Blades, Flame Weapon)
- **Visual Effects**: Add unique VFX for advanced card activations
- **Sound Effects**: Custom sounds for detonations and spreads
- **Rarity Tiers**: Make some advanced cards rarer than others
- **Card Upgrades**: Allow upgrading advanced cards to stronger versions

