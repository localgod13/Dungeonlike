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

export interface CombatState {
  turn: number;
  party: Actor[];  // 1–3 members
  enemies: Actor[]; // 1–N
  shields?: Map<ActorId, number>; // Shield stacks per actor
  vulnerable?: Map<ActorId, number>; // Vulnerable stacks per actor
  stunned?: Set<ActorId>; // Stunned actors (skip action)
  dots?: Map<ActorId, DotEffect[]>; // DOT effects per actor
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
 */
export function enemyAI(state: CombatState, enemy: Actor, rng: () => number): ActionPlan {
  if (enemy.hp / enemy.maxHp < 0.3) {
    return { by: enemy.id, type: 'Guard' };
  }
  
  const target = [...state.party]
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
        effects.push({ at: tCursor, kind: 'vfx', src: source.id, dst: actor.id, note: dot.type });
        effects.push({ at: tCursor + 400, kind: 'hit', src: source.id, dst: actor.id, value: dot.damage });
        
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

  // Simulate turn - tCursor continues from DOT phase
  const GUARD_REDUCTION = 2;
  const guarded = new Set<ActorId>();
  const guardValues = new Map<ActorId, number>(); // Track actual guard values
  const vulnerable = new Set<ActorId>(); // Track vulnerable actors

  for (const actorId of order) {
    const actor = getActor(actorId);
    if (!actor || actor.hp <= 0) continue;
    
    const isEnemy = actor.side === 'enemy';
    
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
        let base = 4 + Math.floor(rng() * 4); // 4..7
        
        // Apply vulnerability (increases damage)
        if (vulnerable.has(dst.id)) {
          base += 2; // Vulnerable increases damage taken by 2
          console.log(`[Combat] ${dst.name} is vulnerable! Damage increased by 2 (${base - 2} -> ${base})`);
        }
        
        // Apply guard reduction
        const guardValue = guardValues.get(dst.id) || 0;
        const reduced = Math.max(0, base - guardValue);
        
        if (guardValue > 0) {
          console.log(`[Combat] ${dst.name} is guarded! Damage reduced by ${guardValue} (${base} -> ${reduced})`);
        }
        
        strike(actor, dst, reduced, tCursor);
        // Apply damage to simulation state for post-state snapshot
        dst.hp = Math.max(0, dst.hp - reduced);
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
                let damage = card.power;
                
                // Apply vulnerability (increases damage)
                if (vulnerable.has(dst.id)) {
                  damage += 2; // Vulnerable increases damage taken by 2
                  console.log(`[Combat] ${dst.name} is vulnerable! ${card.name} damage increased by 2 (${card.power} -> ${damage})`);
                }
                
                // Apply guard reduction
                const guardValue = guardValues.get(dst.id) || 0;
                const finalDamage = Math.max(0, damage - guardValue);
                
                if (guardValue > 0) {
                  console.log(`[Combat] ${dst.name} is guarded! ${card.name} damage reduced by ${guardValue} (${damage} -> ${finalDamage})`);
                }
                
                strike(actor, dst, finalDamage, tCursor, card.name); // Pass card name for sound
                dst.hp = Math.max(0, dst.hp - finalDamage);
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
                guard(dst, shieldValue, tCursor);
                guarded.add(dst.id);
                guardValues.set(dst.id, shieldValue);
                console.log(`[Combat] ${dst.name} gains ${shieldValue} shield from ${card.name}`);
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
              const targets = actor.side === 'party' ? simState.enemies : simState.party;
              targets.forEach((target, index) => {
                let damage = card.power;
                
                // Apply vulnerability (increases damage)
                if (vulnerable.has(target.id)) {
                  damage += 2;
                  console.log(`[Combat] ${target.name} is vulnerable! ${card.name} damage increased by 2 (${card.power} -> ${damage})`);
                }
                
                // Apply guard reduction
                const guardValue = guardValues.get(target.id) || 0;
                const finalDamage = Math.max(0, damage - guardValue);
                
                if (guardValue > 0) {
                  console.log(`[Combat] ${target.name} is guarded! ${card.name} damage reduced by ${guardValue} (${damage} -> ${finalDamage})`);
                }
                
                const offsetTime = tCursor + (index * 200); // Stagger AOE hits
                strike(actor, target, finalDamage, offsetTime, card.name);
                target.hp = Math.max(0, target.hp - finalDamage);
              });
              break;
            
            case 'SELF_GUARD':
              // Self-shield: grant shield to caster
              const shieldValue = card.power;
              guard(actor, shieldValue, tCursor);
              guarded.add(actor.id);
              guardValues.set(actor.id, shieldValue);
              console.log(`[Combat] ${actor.name} gains ${shieldValue} shield from ${card.name}`);
              break;
            
            case 'TAUNT':
              // Taunt: force enemy to target the caster
              // Note: This is a visual effect only in current implementation
              // Full taunt mechanics would require AI modification
              if (dst) {
                console.log(`[Combat] ${actor.name} taunts ${dst.name}!`);
                effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: 'taunt' });
              }
              break;
            
            case 'DOT':
              // Damage over time: add status effect for multiple turns
              if (dst) {
                // Determine effect type based on card name
                const effectType: 'poison' | 'burn' = card.name.toLowerCase().includes('poison') ? 'poison' : 'burn';
                const damagePerTurn = card.power; // Full power value = damage per turn
                const duration = 2; // 2 turns of damage
                
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
                console.log(`[Combat] 📊 Total damage over time: ${damagePerTurn * duration}`);
                console.log(`[Combat] 📊 Total DOTs on ${dst.name}: ${targetDots.length}`);
                
                // Show application visual effect
                effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: effectType });
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
  
  // Serialize DOT effects Map to array format for network transmission
  const serializedDots = Array.from(dotEffects.entries()).map(([actorId, effects]) => ({
    actorId,
    effects: effects.map(e => ({ ...e })),
  }));
  
  return { 
    turn: state.turn, 
    seed, 
    order, 
    effects, 
    post,
    dots: serializedDots, // Include DOT effects in payload for persistence
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
    dots: new Map(),
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
