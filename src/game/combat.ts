import { Actor, ActorId, ActionPlan, ResolvePayload, Effect } from '../net/proto';
import { mulberry32, seedFrom } from './rng';
import { Card, getCardById } from './cards';

/**
 * Combat rules, AI, and deterministic resolution
 */

export interface DotEffect {
  damage: number;      // Damage per turn
  duration: number;    // Remaining turns
  source: ActorId;     // Who applied it
  type: 'poison' | 'burn'; // Effect type for visuals
}

export interface BuffEffect {
  damageBonus: number; // Extra damage on next attack
  duration: number;    // Remaining turns
  source: ActorId;     // Who applied it
  type: 'damage' | 'shield' | 'other'; // Effect type
}

export interface CombatState {
  turn: number;
  party: Actor[];  // 1–3 members
  enemies: Actor[]; // 1–N
  shields?: Map<ActorId, number>; // Shield stacks per actor
  vulnerable?: Map<ActorId, number>; // Vulnerable stacks per actor
  stunned?: Set<ActorId>; // Stunned actors (skip action)
  dots?: Map<ActorId, DotEffect[]>; // DOT effects per actor
  buffs?: Map<ActorId, BuffEffect[]>; // Buff effects per actor
  blinded?: Set<ActorId>; // Blinded actors (miss next attack)
  fireShield?: Set<ActorId>; // Actors with Fire Shield (retaliate on hit)
  taunted?: Map<ActorId, ActorId>; // Maps taunted actor ID to the taunter ID they must attack
}

export type Initiative = ActorId[];

/**
 * Roll initiative order deterministically
 * Party tends to act first, then enemies
 */
export function rollInitiative(state: CombatState, rng: () => number): Initiative {
  const all = [...state.party, ...state.enemies];
  return all
    .map(a => ({ 
      a, 
      key: (a.side === 'party' ? 0 : 1) + rng() // party tends to act first
    }))
    .sort((x, y) => x.key - y.key)
    .map(x => x.a.id);
}

/**
 * Simple enemy AI
 * Low HP (<30%) → Guard; else Attack lowest-HP party member
 * If taunted, must attack the taunter instead
 */
export function enemyAI(state: CombatState, enemy: Actor, rng: () => number): ActionPlan {
  if (enemy.hp / enemy.maxHp < 0.3) {
    return { by: enemy.id, type: 'Guard' };
  }
  
  // Check if this enemy is taunted
  const tauntedMap = state.taunted || new Map();
  const taunter = tauntedMap.get(enemy.id);
  
  if (taunter) {
    // Must attack the taunter
    const taunterActor = state.party.find(p => p.id === taunter);
    if (taunterActor && taunterActor.hp > 0) {
      console.log(`[AI] ${enemy.name} is taunted! Must attack ${taunterActor.name}`);
      return { by: enemy.id, type: 'Attack', target: taunter };
    }
    // If taunter is dead, remove taunt and fall through to normal targeting
    tauntedMap.delete(enemy.id);
  }
  
  // Normal AI: Attack lowest-HP party member
  const target = [...state.party]
    .filter(p => p.hp > 0) // Only target alive party members
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
  
  return { by: enemy.id, type: 'Attack', target: target?.id };
}

/**
 * Resolve a complete turn with deterministic timeline
 */
export function resolveTurn(
  state: CombatState,
  partyPlans: ActionPlan[],   // Can include multiple plans per player
  lobbyId: string
): ResolvePayload {
  const seed = seedFrom(state.turn, lobbyId);
  const rng = mulberry32(seed);
  
  // Create a temporary simulation state (don't modify the original state)
  const simState: CombatState = {
    turn: state.turn,
    party: state.party.map(a => ({ ...a })),
    enemies: state.enemies.map(a => ({ ...a })),
    dots: state.dots ? new Map(state.dots) : new Map(),
    shields: state.shields ? new Map(state.shields) : new Map(),
    buffs: state.buffs ? new Map(state.buffs) : new Map(),
    blinded: state.blinded ? new Set(state.blinded) : new Set(),
    fireShield: state.fireShield ? new Set(state.fireShield) : new Set(),
    taunted: state.taunted ? new Map(state.taunted) : new Map(),
  };
  
  const order = rollInitiative(simState, rng);
  
  // Index party plans by actor ID - support multiple plans per player
  const plansById = new Map<string, ActionPlan[]>();
  for (const p of partyPlans) {
    const existing = plansById.get(p.by) || [];
    existing.push(p);
    plansById.set(p.by, existing);
  }
  
  // Build effects timeline with fixed staging
  const effects: Effect[] = [];
  const getActor = (id: ActorId) => 
    simState.party.find(a => a.id === id) || simState.enemies.find(a => a.id === id);
  
  // Initialize shields map if it doesn't exist
  if (!simState.shields) {
    simState.shields = new Map();
  }
  
  // Apply DOT effects at the start of the turn
  let tCursor = 0;
  const dotEffects = simState.dots || new Map();
  
  console.log(`[Combat] 🔥 DOT Tick Phase - Turn ${state.turn}`);
  console.log(`[Combat] 📋 Total actors with DOTs: ${dotEffects.size}`);
  
  for (const [actorId, dots] of dotEffects.entries()) {
    const actor = getActor(actorId);
    if (!actor || actor.hp <= 0) {
      console.log(`[Combat] ⚰️ Skipping DOTs for ${actorId} (dead or not found)`);
      continue;
    }
    
    console.log(`[Combat] 🎯 Processing DOTs for ${actor.name} (${dots.length} effects)`);
    
    // Apply each DOT effect
    for (const dot of dots) {
      const source = getActor(dot.source);
      if (source && dot.duration > 0) {
        console.log(`[Combat] ☠️ Applying ${dot.type} DOT to ${actor.name}: ${dot.damage} damage (${dot.duration} turns remaining)`);
        console.log(`[Combat] 💚 ${actor.name} HP before DOT: ${actor.hp}/${actor.maxHp}`);
        
        // Create poison/burn visual effect
        console.log(`[Combat] 🎨 Creating DOT VFX: type="${dot.type}", src=${source.id}, dst=${actor.id}`);
        effects.push({ at: tCursor, kind: 'vfx', src: source.id, dst: actor.id, note: dot.type });
        effects.push({ at: tCursor + 400, kind: 'hit', src: source.id, dst: actor.id, value: dot.damage });
        console.log(`[Combat] 🎨 VFX effect added to timeline at t=${tCursor}`);
        
        // Apply damage
        actor.hp = Math.max(0, actor.hp - dot.damage);
        console.log(`[Combat] ❤️ ${actor.name} HP after DOT: ${actor.hp}/${actor.maxHp}`);
        
        // Decrement duration
        dot.duration--;
        console.log(`[Combat] ⏱️ ${dot.type} duration decremented to: ${dot.duration}`);
        
        tCursor += 600; // Space out DOT effects
      } else {
        console.log(`[Combat] ⏭️ Skipping expired or invalid DOT (duration: ${dot.duration}, source found: ${!!source})`);
      }
    }
    
    // Remove expired DOT effects
    const remainingDots = dots.filter(dot => dot.duration > 0);
    console.log(`[Combat] 🧹 Cleaning DOTs for ${actor.name}: ${dots.length} -> ${remainingDots.length}`);
    dotEffects.set(actorId, remainingDots);
  }
  
  // Add delay after DOT phase before actions start
  if (tCursor > 0) {
    tCursor += 400;
  }

  // Helper functions for creating effects (timing slowed for better visibility)
  const strike = (src: Actor, dst: Actor, dmg: number, t0: number, note = 'slash') => {
    effects.push({ at: t0 + 0, kind: 'vfx', src: src.id, dst: dst.id, note: 'telegraph' });
    effects.push({ at: t0 + 400, kind: 'vfx', src: src.id, dst: dst.id, note }); // Was 150ms
    effects.push({ at: t0 + 700, kind: 'hit', src: src.id, dst: dst.id, value: dmg }); // Was 250ms
  };

  const guard = (src: Actor, shieldValue: number, t0: number) => {
    effects.push({ at: t0 + 0, kind: 'vfx', src: src.id, note: 'guard-start' });
    effects.push({ at: t0 + 400, kind: 'guard', src: src.id, value: shieldValue }); // Pass actual shield value
  };

  const heal = (src: Actor, dst: Actor, val: number, t0: number) => {
    effects.push({ at: t0 + 0, kind: 'vfx', src: src.id, dst: dst.id, note: 'heal-cast' });
    effects.push({ at: t0 + 700, kind: 'heal', src: src.id, dst: dst.id, value: val }); // Was 250ms
  };

  // Check for Fire Shield retaliate after damage is applied
  const checkFireShieldRetaliate = (attacker: Actor, target: Actor, t0: number, shieldBeforeDamage: number) => {
    if (simState.fireShield?.has(target.id) && attacker.side === 'enemy') {
      // Use shield value BEFORE damage - if shield existed at moment of attack, retaliate!
      if (shieldBeforeDamage > 0) {
        console.log(`🔥 Fire Shield retaliates! ${target.name} reflects 5 damage back at ${attacker.name}!`);
        // Add VFX for fireball, then hit effect after delay
        effects.push({ at: t0 + 800, kind: 'vfx', src: target.id, dst: attacker.id, note: 'fire_shield_retaliate' });
        effects.push({ at: t0 + 1100, kind: 'hit', src: target.id, dst: attacker.id, value: 5 });
        attacker.hp = Math.max(0, attacker.hp - 5);
        console.log(`[Combat] ${attacker.name} takes 5 retaliate damage from Fire Shield. HP: ${attacker.hp}/${attacker.maxHp}`);
      }
      
      // Check if shield is now depleted to remove the fire shield effect
      const currentShield = simState.shields?.get(target.id) || 0;
      if (currentShield <= 0) {
        console.log(`🔥 Fire Shield depleted for ${target.name}! Removing retaliate effect.`);
        simState.fireShield.delete(target.id);
      }
    }
  };

  // Simulate turn - tCursor continues from DOT phase
  const GUARD_REDUCTION = 2;
  const guarded = new Set<ActorId>();
  const guardValues = new Map<ActorId, number>(); // Track actual guard values
  const vulnerable = new Set<ActorId>(); // Track vulnerable actors
  let hasSeenEnemy = false; // Track if we've seen any enemy actions yet

  for (const actorId of order) {
    const actor = getActor(actorId);
    if (!actor || actor.hp <= 0) continue;
    
    const isEnemy = actor.side === 'enemy';
    
    // Add delay before first enemy action to separate enemy turn from player turn
    if (isEnemy && !hasSeenEnemy) {
      hasSeenEnemy = true;
      tCursor += 600; // 600ms delay before enemies start acting
      console.log(`[Combat] Adding 600ms delay before enemy turn begins`);
    }
    
    // Get all plans for this actor (party members can have multiple)
    const actorPlans = isEnemy 
      ? [enemyAI(state, actor, rng)]
      : (plansById.get(actor.id) || [{ by: actor.id, type: 'Skip' as const }]);

    // Execute all plans for this actor in sequence
    for (const plan of actorPlans) {
      console.log(`[Combat] Executing action for ${actor.name}: ${plan.type}`);

      if (plan.type === 'Guard') {
        guard(actor, GUARD_REDUCTION, tCursor);
        guarded.add(actor.id);
        guardValues.set(actor.id, GUARD_REDUCTION);
      } else if (plan.type === 'Attack') {
      const dst = plan.target 
        ? getActor(plan.target)
        : (isEnemy 
          ? simState.party[Math.floor(rng() * simState.party.length)]
          : simState.enemies[Math.floor(rng() * simState.enemies.length)]);
      
      if (dst) {
        // Base damage 4–7
        let damage = 4 + Math.floor(rng() * 4); // 4..7
        
        // Apply vulnerability (increases damage)
        if (vulnerable.has(dst.id)) {
          damage += 2; // Vulnerable increases damage taken by 2
          console.log(`[Combat] ${dst.name} is vulnerable! Damage increased by 2 (${damage - 2} -> ${damage})`);
        }
        
        // Apply shield absorption: shields absorb damage before health
        const currentShield = simState.shields?.get(dst.id) || 0;
        
        if (currentShield > 0) {
          const newShieldValue = Math.max(0, currentShield - damage);
          const remainingDamage = Math.max(0, damage - currentShield);
          
          simState.shields!.set(dst.id, newShieldValue);
          
          console.log(`[Shield] ${dst.name} has ${currentShield} shield. Taking ${damage} damage. Shield: ${currentShield} -> ${newShieldValue}, HP damage: ${remainingDamage}`);
          
          // Apply any remaining damage to HP
          if (remainingDamage > 0) {
            strike(actor, dst, remainingDamage, tCursor);
            dst.hp = Math.max(0, dst.hp - remainingDamage);
          } else {
            // All damage absorbed by shield - still show strike effect
            strike(actor, dst, 0, tCursor);
          }
        } else {
          // No shield - apply full damage
          strike(actor, dst, damage, tCursor);
          dst.hp = Math.max(0, dst.hp - damage);
        }
        
        // Check for Fire Shield retaliate (enemy attacking party member)
        if (isEnemy) {
          checkFireShieldRetaliate(actor, dst, tCursor, currentShield);
        }
      }
      } else if (plan.type === 'Skill') {
        // Starter Skill = small heal to lowest-HP ally (party) or self for enemies
        if (!isEnemy) {
          const dst = [...simState.party].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
          if (dst) {
            heal(actor, dst, 4, tCursor);
            // Apply healing to simulation state for post-state snapshot
            dst.hp = Math.min(dst.maxHp, dst.hp + 4);
          }
        } else {
          heal(actor, actor, 3, tCursor);
          // Apply healing to simulation state for post-state snapshot
          actor.hp = Math.min(actor.maxHp, actor.hp + 3);
        }
      } else if (plan.type === 'Card' && plan.cardId) {
        // Card action - handle based on card opcode
        const card = getCardById(plan.cardId);
        if (card) {
          const dst = plan.target ? getActor(plan.target) : null;
          
          switch (card.opcode) {
            case 'DMG':
              if (dst) {
                // Check if attacker is blinded (miss chance)
                if (simState.blinded?.has(actor.id)) {
                  console.log(`[Combat] ${actor.name} is blinded! ${card.name} misses!`);
                  effects.push({ at: tCursor, kind: 'miss', src: actor.id, dst: dst.id });
                  simState.blinded!.delete(actor.id); // Remove blind after missing
                  break;
                }
                
                let damage = card.power;
                
                // Apply damage buffs (increases damage dealt)
                const actorBuffs = simState.buffs?.get(actor.id) || [];
                const damageBuffs = actorBuffs.filter(buff => buff.type === 'damage');
                if (damageBuffs.length > 0) {
                  const totalBuff = damageBuffs.reduce((sum, buff) => sum + buff.damageBonus, 0);
                  damage += totalBuff;
                  console.log(`[Combat] ${actor.name} has damage buffs! ${card.name} damage increased by ${totalBuff} (${card.power} -> ${damage})`);
                  
                  // Remove used buffs (they only last 1 turn)
                  const remainingBuffs = actorBuffs.filter(buff => buff.type !== 'damage');
                  simState.buffs!.set(actor.id, remainingBuffs);
                }
                
                // Apply vulnerability (increases damage)
                if (vulnerable.has(dst.id)) {
                  damage += 2; // Vulnerable increases damage taken by 2
                  console.log(`[Combat] ${dst.name} is vulnerable! ${card.name} damage increased by 2 (${card.power} -> ${damage})`);
                }
                
                // Simple shield absorption: shields absorb damage before health
                const currentShield = simState.shields?.get(dst.id) || 0;
                
                if (currentShield > 0) {
                  const newShieldValue = Math.max(0, currentShield - damage);
                  const remainingDamage = Math.max(0, damage - currentShield);
                  
                  simState.shields!.set(dst.id, newShieldValue);
                  
                  console.log(`[Shield] ${dst.name} has ${currentShield} shield. Taking ${damage} damage. Shield: ${currentShield} -> ${newShieldValue}, HP damage: ${remainingDamage}`);
                  
                // Apply any remaining damage to HP
                if (remainingDamage > 0) {
                  strike(actor, dst, remainingDamage, tCursor, card.name);
                  dst.hp = Math.max(0, dst.hp - remainingDamage);
                } else {
                  // All damage absorbed by shield - still show strike effect
                  strike(actor, dst, 0, tCursor, card.name);
                }
              } else {
                // No shield - apply full damage
                strike(actor, dst, damage, tCursor, card.name);
                dst.hp = Math.max(0, dst.hp - damage);
              }
              
              // Check for Fire Shield retaliate (enemy attacking party member with cards)
              if (isEnemy) {
                checkFireShieldRetaliate(actor, dst, tCursor, currentShield);
              }
            }
            break;
          
            case 'HEAL':
              if (dst) {
                heal(actor, dst, card.power, tCursor);
                dst.hp = Math.min(dst.maxHp, dst.hp + card.power);
              }
              break;
            
            case 'GUARD':
              if (dst) {
                const shieldValue = card.power; // Use the card's power value
                const currentShield = simState.shields?.get(dst.id) || 0;
                const newShieldTotal = currentShield + shieldValue;
                
                // Pass the TOTAL shield value, not just the increment
                guard(dst, newShieldTotal, tCursor);
                guarded.add(dst.id);
                guardValues.set(dst.id, shieldValue); // Keep for compatibility
                simState.shields!.set(dst.id, newShieldTotal);
                console.log(`[Combat] ${dst.name} gains ${shieldValue} shield from ${card.name}. Total shield: ${newShieldTotal}`);
              }
              break;
            
            case 'VULN':
              // Vulnerable: increases damage taken
              if (dst) {
                vulnerable.add(dst.id);
                console.log(`[Combat] ${dst.name} is now vulnerable! Will take +2 damage this turn`);
                effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: 'vulnerable' });
              }
              break;
            
            case 'STUN':
              // Stun: target skips next action (not implemented in this simplified version)
              if (dst) {
                console.log(`[Combat] Creating STUN (Bash) VFX effect: actor=${actor.id}, target=${dst.id}, note='stun'`);
                effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: 'stun' });
                console.log(`[Combat] VFX effect added to timeline at t=${tCursor}`);
              }
              break;
            
            case 'AOE_DMG':
              // AOE damage to all enemies
              // Check if attacker is blinded (miss chance)
              if (simState.blinded?.has(actor.id)) {
                console.log(`[Combat] ${actor.name} is blinded! ${card.name} misses!`);
                const targets = actor.side === 'party' ? simState.enemies : simState.party;
                targets.forEach((target, index) => {
                  const offsetTime = tCursor + (index * 200);
                  effects.push({ at: offsetTime, kind: 'miss', src: actor.id, dst: target.id });
                });
                simState.blinded!.delete(actor.id); // Remove blind after missing
                break;
              }
              
              const targets = actor.side === 'party' ? simState.enemies : simState.party;
              // Apply damage buffs once for AOE (affects all targets)
              let baseDamage = card.power;
              const actorBuffs = simState.buffs?.get(actor.id) || [];
              const damageBuffs = actorBuffs.filter(buff => buff.type === 'damage');
              if (damageBuffs.length > 0) {
                const totalBuff = damageBuffs.reduce((sum, buff) => sum + buff.damageBonus, 0);
                baseDamage += totalBuff;
                console.log(`[Combat] ${actor.name} has damage buffs! ${card.name} AOE damage increased by ${totalBuff} (${card.power} -> ${baseDamage})`);
                
                // Remove used buffs (they only last 1 turn)
                const remainingBuffs = actorBuffs.filter(buff => buff.type !== 'damage');
                simState.buffs!.set(actor.id, remainingBuffs);
              }
              
              targets.forEach((target, index) => {
                // Skip dead enemies for AOE attacks
                if (target.hp <= 0) {
                  console.log(`[Combat] ${target.name} is dead, skipping AOE damage from ${card.name}`);
                  return;
                }
                
                let damage = baseDamage;
                
                // Apply vulnerability (increases damage)
                if (vulnerable.has(target.id)) {
                  damage += 2;
                  console.log(`[Combat] ${target.name} is vulnerable! ${card.name} damage increased by 2 (${baseDamage} -> ${damage})`);
                }
                
                // Apply shield absorption: shields absorb damage before health
                const currentShield = simState.shields?.get(target.id) || 0;
                
                if (currentShield > 0) {
                  const newShieldValue = Math.max(0, currentShield - damage);
                  const remainingDamage = Math.max(0, damage - currentShield);
                  
                  simState.shields!.set(target.id, newShieldValue);
                  
                  console.log(`[Shield] ${target.name} has ${currentShield} shield. Taking ${damage} damage. Shield: ${currentShield} -> ${newShieldValue}, HP damage: ${remainingDamage}`);
                  
                  const offsetTime = tCursor + (index * 200);
                  
                  if (remainingDamage > 0) {
                    strike(actor, target, remainingDamage, offsetTime, card.name);
                    target.hp = Math.max(0, target.hp - remainingDamage);
                  } else {
                    strike(actor, target, 0, offsetTime, card.name);
                  }
                } else {
                  // No shield - apply full damage
                  const offsetTime = tCursor + (index * 200);
                  strike(actor, target, damage, offsetTime, card.name);
                  target.hp = Math.max(0, target.hp - damage);
                }
                
                // Check for Fire Shield retaliate (enemy attacking party member with AOE)
                if (isEnemy) {
                  checkFireShieldRetaliate(actor, target, tCursor + (index * 200), currentShield);
                }
              });
              break;
            
            case 'SELF_GUARD':
              // Self-shield: grant shield to caster
              const shieldValue = card.power;
              const currentShield = simState.shields?.get(actor.id) || 0;
              const newShieldTotal = currentShield + shieldValue;
              
              // Pass the TOTAL shield value, not just the increment
              guard(actor, newShieldTotal, tCursor);
              guarded.add(actor.id);
              guardValues.set(actor.id, shieldValue); // Keep for compatibility
              simState.shields!.set(actor.id, newShieldTotal);
              
              // Special: Fire Shield grants retaliate damage
              if (card.id === 'FireShield') {
                simState.fireShield!.add(actor.id);
                console.log(`[Combat] 🔥 ${actor.name} gains Fire Shield! Will retaliate for 5 damage when hit!`);
              }
              
              console.log(`[Combat] ${actor.name} gains ${shieldValue} shield from ${card.name}. Total shield: ${newShieldTotal}`);
              break;
            
            case 'TAUNT':
              // Taunt: force enemy to target the caster
              // For Lightning Rod: give self shield + taunt all enemies
              if (card.id === 'LightningRod') {
                // Give shield to self
                const shieldValue = card.power;
                const currentShield = simState.shields?.get(actor.id) || 0;
                const newShieldTotal = currentShield + shieldValue;
                
                // Pass the TOTAL shield value, not just the increment
                guard(actor, newShieldTotal, tCursor);
                guarded.add(actor.id);
                guardValues.set(actor.id, shieldValue);
                simState.shields!.set(actor.id, newShieldTotal);
                console.log(`[Combat] ⚡ ${actor.name} uses Lightning Rod! Gains ${shieldValue} shield. Total: ${newShieldTotal}`);
                
                // Taunt all enemies - they must attack the caster
                const enemies = actor.side === 'party' ? simState.enemies : simState.party;
                enemies.forEach((enemy, index) => {
                  const offsetTime = tCursor + (index * 150);
                  effects.push({ at: offsetTime, kind: 'vfx', src: actor.id, dst: enemy.id, note: 'taunt' });
                  
                  // Set the taunted state: enemy must target the actor
                  simState.taunted!.set(enemy.id, actor.id);
                });
                console.log(`[Combat] ⚡ All ${enemies.length} enemies are taunted to attack ${actor.name}!`);
              } else if (dst) {
                // Regular taunt card (like Warrior's Taunt) - single target
                console.log(`[Combat] ${actor.name} taunts ${dst.name}!`);
                effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: 'taunt' });
                
                // Set the taunted state: dst must target the actor
                simState.taunted!.set(dst.id, actor.id);
                console.log(`[Combat] ${dst.name} is taunted to attack ${actor.name}!`);
              }
              break;
            
            case 'DOT':
              // Damage over time: add status effect for multiple turns
              console.log(`[Combat] 🔥 DOT CASE TRIGGERED! Card: ${card.name} (${card.id}), Actor: ${actor.name}, has target: ${!!dst}`);
              
              // Special handling for Firebomb - affects all enemies (no target needed)
              if (card.id === 'Firebomb') {
                console.log(`[Combat] 💣 FIREBOMB DETECTED! Processing AOE burn...`);
                const targets = actor.side === 'party' ? simState.enemies : simState.party;
                console.log(`[Combat] 💣 Firebomb will hit ${targets.length} targets`);
                targets.forEach((target, index) => {
                  // Firebomb: 8 initial damage + 2 burn per turn for 3 turns
                  const initialDamage = card.power; // 8 initial damage
                  const burnDamagePerTurn = 2; // 2 burn damage per turn
                  
                  const targetDots = dotEffects.get(target.id) || [];
                  targetDots.push({
                    damage: burnDamagePerTurn, // 2 burn damage per turn
                    duration: 3, // 3 turns of burn
                    source: actor.id,
                    type: 'burn',
                  });
                  dotEffects.set(target.id, targetDots);
                  
                  const offsetTime = tCursor + (index * 200);
                  strike(actor, target, initialDamage, offsetTime, card.name);
                  target.hp = Math.max(0, target.hp - initialDamage);
                  console.log(`[Combat] 🔥 Adding burn VFX for ${target.id} at t=${offsetTime}, note="burn"`);
                  effects.push({ at: offsetTime, kind: 'vfx', src: actor.id, dst: target.id, note: 'burn' });
                });
                console.log(`[Combat] 💣 ${actor.name} uses Firebomb! All enemies take 8 damage + burn for 3 turns!`);
              } else if (dst) {
                  // Single-target DOT (Poison Dart, etc.)
                  const effectType: 'poison' | 'burn' = card.name.toLowerCase().includes('poison') ? 'poison' : 'burn';
                  
                  // Special handling for Poison Dart: 5 initial damage + 3 poison per turn for 2 turns
                  if (card.id === 'PoisonDart') {
                    const initialDamage = card.power; // 5 initial damage
                    const poisonDamagePerTurn = 3; // 3 poison damage per turn
                    
                    // Apply initial damage
                    strike(actor, dst, initialDamage, tCursor, card.name);
                    dst.hp = Math.max(0, dst.hp - initialDamage);
                    
                    // Add DOT effect to target
                    const targetDots = dotEffects.get(dst.id) || [];
                    targetDots.push({
                      damage: poisonDamagePerTurn, // 3 poison damage per turn
                      duration: 2, // 2 turns of poison
                      source: actor.id,
                      type: 'poison',
                    });
                    dotEffects.set(dst.id, targetDots);
                    
                    console.log(`[Combat] 🐍 ${actor.name} uses Poison Dart! ${dst.name} takes 5 damage + poison for 2 turns!`);
                    console.log(`[Combat] 🔮 DOT Effect: ${poisonDamagePerTurn} poison damage per turn for 2 turns`);
                    console.log(`[Combat] 🔮 Poison VFX added at t=${tCursor}, note="poison"`);
                  } else {
                    // Generic DOT handling for other cards
                    const damagePerTurn = card.power;
                    const duration = 2; // 2 turns of damage
                    
                    // Apply initial damage
                    strike(actor, dst, card.power, tCursor, card.name);
                    dst.hp = Math.max(0, dst.hp - card.power);
                    
                    // Add DOT effect to target
                    const targetDots = dotEffects.get(dst.id) || [];
                    targetDots.push({
                      damage: damagePerTurn,
                      duration: duration,
                      source: actor.id,
                      type: effectType,
                    });
                    dotEffects.set(dst.id, targetDots);
                    
                    console.log(`[Combat] ✨ ${actor.name} applies ${card.name} to ${dst.name}!`);
                    console.log(`[Combat] 🔮 DOT Effect: ${damagePerTurn} ${effectType} damage per turn for ${duration} turns`);
                  }
                  
                  effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: effectType });
                }
              break;
            
            case 'CLEANSE':
              // Healing Salve: heal + remove one DOT effect
              if (dst) {
                // Heal first
                heal(actor, dst, card.power, tCursor);
                dst.hp = Math.min(dst.maxHp, dst.hp + card.power);
                
                // Remove one DOT effect if present
                const targetDots = dotEffects.get(dst.id) || [];
                if (targetDots.length > 0) {
                  const removedEffect = targetDots.shift(); // Remove first DOT
                  dotEffects.set(dst.id, targetDots);
                  console.log(`[Combat] 🧴 ${actor.name} cleanses ${dst.name}, removing ${removedEffect?.type} effect!`);
                } else {
                  console.log(`[Combat] 🧴 ${actor.name} heals ${dst.name} for ${card.power} HP (no effects to cleanse)`);
                }
              }
              break;
            
            case 'BUFF':
              // Berserker Potion: give all allies +damage for next attack
              {
                const targets = actor.side === 'party' ? simState.party : simState.enemies;
                targets.forEach((target, index) => {
                  // Add damage buff to target
                  const targetBuffs = simState.buffs?.get(target.id) || [];
                  targetBuffs.push({
                    damageBonus: card.power, // +4 damage on next attack
                    duration: 1, // Lasts for 1 turn (next attack)
                    source: actor.id,
                    type: 'damage',
                  });
                  simState.buffs!.set(target.id, targetBuffs);
                  
                  const offsetTime = tCursor + (index * 100);
                  guard(target, card.power, offsetTime); // Visual effect (reuse guard animation)
                  console.log(`[Combat] 🍺 ${target.name} gains +${card.power} damage on next attack!`);
                  effects.push({ at: offsetTime, kind: 'vfx', src: actor.id, dst: target.id, note: 'buff' });
                });
                console.log(`[Combat] 🍺 Berserker Potion applied to all allies! +${card.power} damage boost`);
              }
              break;
            
            case 'BLIND':
              // Smoke Grenade: AOE damage + blind effect (enemies miss next attack)
              {
                const targets = actor.side === 'party' ? simState.enemies : simState.party;
                targets.forEach((target, index) => {
                  let damage = card.power;
                  
                  // Apply vulnerability bonus
                  if (vulnerable.has(target.id)) {
                    damage += 2;
                  }
                  
                  // Simple shield absorption: shields absorb damage before health
                  const currentShield = simState.shields?.get(target.id) || 0;
                  
                  let finalDamage = damage;
                  
                  if (currentShield > 0) {
                    const newShieldValue = Math.max(0, currentShield - damage);
                    const remainingDamage = Math.max(0, damage - currentShield);
                    simState.shields!.set(target.id, newShieldValue);
                    finalDamage = remainingDamage;
                  }
                  
                  const offsetTime = tCursor + (index * 200);
                  
                  if (finalDamage > 0) {
                    strike(actor, target, finalDamage, offsetTime, card.name);
                    target.hp = Math.max(0, target.hp - finalDamage);
                  } else {
                    // No damage to HP, but still show strike effect
                    strike(actor, target, 0, offsetTime, card.name);
                  }
                  
                  // Check for Fire Shield retaliate (enemy attacking party member with BLIND)
                  if (isEnemy) {
                    checkFireShieldRetaliate(actor, target, offsetTime, currentShield);
                  }
                  
                  // Apply blind effect
                  simState.blinded!.add(target.id);
                  effects.push({ at: offsetTime, kind: 'vfx', src: actor.id, dst: target.id, note: 'blind' });
                  console.log(`[Combat] 💨 ${target.name} is blinded! Will miss next attack`);
                });
                console.log(`[Combat] 💨 Smoke Grenade deployed! All enemies blinded`);
              }
              break;
            
            case 'ULTIMATE_GAIN':
              // Ultimate Elixir: grant ultimate power to the caster
              // Note: This requires accessing the ultimate system, which isn't directly accessible here
              // We'll add a special effect that the BattleScene can intercept
              console.log(`[Combat] ⚡ ${actor.name} uses Ultimate Elixir! Gaining ${card.power}% ultimate power`);
              effects.push({ at: tCursor, kind: 'ultimate_gain', src: actor.id, dst: actor.id, note: `${card.power}` });
              break;
            
            case 'REVIVE':
              // Revive Crystal: revive a dead ally
              if (dst) {
                if (dst.hp <= 0) {
                  const reviveAmount = Math.floor((dst.maxHp * card.power) / 100);
                  dst.hp = reviveAmount;
                  console.log(`[Combat] 💎 ${actor.name} revives ${dst.name} with ${reviveAmount} HP!`);
                  effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: 'revive' });
                  heal(actor, dst, reviveAmount, tCursor); // Show heal animation
                } else {
                  console.log(`[Combat] 💎 ${dst.name} is not dead! Revive Crystal has no effect`);
                }
              }
              break;
          }
        }
      }
      
      // Add delay between actions from the same actor
      tCursor += 800; // 800ms between each action from same actor
    }
    
    // Add extra delay before next actor in initiative
    tCursor += 200; // Small gap between actors (was 1000ms total per actor)
  }

  // Create post-state snapshot from simulation state
  // This contains the final HP values after all damage/healing
  const post = [...simState.party, ...simState.enemies].map(a => ({ ...a }));
  
  // Update the simulation state's DOT effects for persistence
  simState.dots = dotEffects;
  
  // Clear taunt effects at end of turn (taunts only last for 1 turn)
  if (simState.taunted && simState.taunted.size > 0) {
    console.log(`[Combat] Clearing ${simState.taunted.size} taunt effects at end of turn`);
    simState.taunted.clear();
  }
  
  // Clear blind effects at end of turn (blind only lasts for 1 turn/attack)
  if (simState.blinded && simState.blinded.size > 0) {
    console.log(`[Combat] Clearing ${simState.blinded.size} blind effects at end of turn`);
    simState.blinded.clear();
  }
  
  // Serialize DOT effects Map to array format for network transmission
  const serializedDots = Array.from(dotEffects.entries()).map(([actorId, effects]) => ({
    actorId,
    effects: effects.map(e => ({ ...e })),
  }));
  
  // Serialize shields Map to array format for network transmission
  const serializedShields = Array.from((simState.shields || new Map()).entries()).map(([actorId, shieldValue]) => ({
    actorId,
    shieldValue,
  }));
  
  // Serialize buffs Map to array format for network transmission
  const serializedBuffs = Array.from((simState.buffs || new Map()).entries()).map(([actorId, buffs]) => ({
    actorId,
    buffs: buffs.map(b => ({ ...b })),
  }));
  
  // Serialize blinded Set to array format for network transmission (should be empty after clear)
  const serializedBlinded = Array.from(simState.blinded || new Set());
  
  // Serialize fireShield Set to array format for network transmission
  const serializedFireShield = Array.from(simState.fireShield || new Set());
  
  // Serialize taunted Map to array format for network transmission (should be empty after clear)
  const serializedTaunted = Array.from((simState.taunted || new Map()).entries()).map(([actorId, taunter]) => ({
    actorId,
    taunter,
  }));
  
  return { 
    turn: state.turn, 
    seed, 
    order, 
    effects, 
    post,
    dots: serializedDots, // Include DOT effects in payload for persistence
    shields: serializedShields, // Include shields in payload for persistence
    buffs: serializedBuffs, // Include buffs in payload for persistence
    blinded: serializedBlinded, // Include blinded actors in payload for persistence (cleared each turn)
    fireShield: serializedFireShield, // Include fire shield actors in payload for persistence
    taunted: serializedTaunted, // Include taunted actors in payload (cleared each turn)
  };
}

/**
 * Check if combat is over
 */
export function isCombatOver(state: CombatState): 'victory' | 'defeat' | null {
  const partyAlive = state.party.some(a => a.hp > 0);
  const enemiesAlive = state.enemies.some(a => a.hp > 0);
  
  if (!partyAlive) return 'defeat';
  if (!enemiesAlive) return 'victory';
  return null;
}

/**
 * Create initial combat state
 */
export function createCombatState(
  party: Actor[],
  enemies: Actor[],
  turn = 1
): CombatState {
  return {
    turn,
    party: party.map(a => ({ ...a })),
    enemies: enemies.map(a => ({ ...a })),
    shields: new Map(),
    vulnerable: new Map(),
    stunned: new Set(),
    dots: new Map(),
    fireShield: new Set(),
    taunted: new Map(),
    blinded: new Set(),
    buffs: new Map(),
  };
}

/**
 * Apply post-state reconciliation
 */
export function reconcileState(state: CombatState, post: Actor[]): void {
  const allActors = [...state.party, ...state.enemies];
  
  for (const postActor of post) {
    const currentActor = allActors.find(a => a.id === postActor.id);
    if (currentActor) {
      currentActor.hp = postActor.hp;
      currentActor.maxHp = postActor.maxHp;
      currentActor.ap = postActor.ap;
    }
  }
}
