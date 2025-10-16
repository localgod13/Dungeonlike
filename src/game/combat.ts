import { Actor, ActorId, ActionPlan, ResolvePayload, Effect } from '../net/proto';
import { mulberry32, seedFrom } from './rng';
import { Card, getCardById } from './cards';

/**
 * Combat rules, AI, and deterministic resolution
 */

export interface CombatState {
  turn: number;
  party: Actor[];  // 1–3 members
  enemies: Actor[]; // 1–N
  shields?: Map<ActorId, number>; // Shield stacks per actor
  vulnerable?: Map<ActorId, number>; // Vulnerable stacks per actor
  stunned?: Set<ActorId>; // Stunned actors (skip action)
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
  partyPlans: ActionPlan[],   // one per connected player actor
  lobbyId: string
): ResolvePayload {
  const seed = seedFrom(state.turn, lobbyId);
  const rng = mulberry32(seed);
  
  // Create a temporary simulation state (don't modify the original state)
  const simState: CombatState = {
    turn: state.turn,
    party: state.party.map(a => ({ ...a })),
    enemies: state.enemies.map(a => ({ ...a })),
  };
  
  const order = rollInitiative(simState, rng);
  
  // Index party plans by actor ID
  const plansById = new Map<string, ActionPlan>();
  for (const p of partyPlans) {
    plansById.set(p.by, p);
  }
  
  // Build effects timeline with fixed staging
  const effects: Effect[] = [];
  const getActor = (id: ActorId) => 
    simState.party.find(a => a.id === id) || simState.enemies.find(a => a.id === id);

  // Helper functions for creating effects (timing slowed for better visibility)
  const strike = (src: Actor, dst: Actor, dmg: number, t0: number, note = 'slash') => {
    effects.push({ at: t0 + 0, kind: 'vfx', src: src.id, dst: dst.id, note: 'telegraph' });
    effects.push({ at: t0 + 400, kind: 'vfx', src: src.id, dst: dst.id, note }); // Was 150ms
    effects.push({ at: t0 + 700, kind: 'hit', src: src.id, dst: dst.id, value: dmg }); // Was 250ms
  };

  const guard = (src: Actor, t0: number) => {
    effects.push({ at: t0 + 0, kind: 'vfx', src: src.id, note: 'guard-start' });
    effects.push({ at: t0 + 400, kind: 'guard', src: src.id, value: 2 }); // Was 150ms
  };

  const heal = (src: Actor, dst: Actor, val: number, t0: number) => {
    effects.push({ at: t0 + 0, kind: 'vfx', src: src.id, dst: dst.id, note: 'heal-cast' });
    effects.push({ at: t0 + 700, kind: 'heal', src: src.id, dst: dst.id, value: val }); // Was 250ms
  };

  // Simulate turn
  let tCursor = 0;
  const GUARD_REDUCTION = 2;
  const guarded = new Set<ActorId>();

  for (const actorId of order) {
    const actor = getActor(actorId);
    if (!actor || actor.hp <= 0) continue;
    
    const isEnemy = actor.side === 'enemy';
    const plan = isEnemy 
      ? enemyAI(state, actor, rng) 
      : (plansById.get(actor.id) ?? { by: actor.id, type: 'Guard' });

    if (plan.type === 'Guard') {
      guard(actor, tCursor);
      guarded.add(actor.id);
    } else if (plan.type === 'Attack') {
      const dst = plan.target 
        ? getActor(plan.target)
        : (isEnemy 
          ? simState.party[Math.floor(rng() * simState.party.length)]
          : simState.enemies[Math.floor(rng() * simState.enemies.length)]);
      
      if (dst) {
        // Base damage 4–7
        const base = 4 + Math.floor(rng() * 4); // 4..7
        const reduced = Math.max(0, base - (guarded.has(dst.id) ? GUARD_REDUCTION : 0));
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
              const damage = Math.max(0, card.power - (guarded.has(dst.id) ? GUARD_REDUCTION : 0));
              strike(actor, dst, damage, tCursor);
              dst.hp = Math.max(0, dst.hp - damage);
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
              guard(dst, tCursor);
              guarded.add(dst.id);
            }
            break;
          
          case 'VULN':
            // Vulnerable: increases damage taken (handled when dealing damage)
            // For now, just show VFX
            if (dst) {
              effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: 'vulnerable' });
            }
            break;
          
          case 'STUN':
            // Stun: target skips next action (not implemented in this simplified version)
            if (dst) {
              effects.push({ at: tCursor, kind: 'vfx', src: actor.id, dst: dst.id, note: 'stun' });
            }
            break;
          
          case 'AOE_DMG':
            // AOE damage to all enemies
            const targets = actor.side === 'party' ? simState.enemies : simState.party;
            targets.forEach((target, index) => {
              const damage = Math.max(0, card.power - (guarded.has(target.id) ? GUARD_REDUCTION : 0));
              const offsetTime = tCursor + (index * 200); // Stagger AOE hits
              strike(actor, target, damage, offsetTime);
              target.hp = Math.max(0, target.hp - damage);
            });
            break;
        }
      }
    }
    
    tCursor += 1000; // Next initiative starts 1000ms later for clean stagger (was 450ms)
  }

  // Create post-state snapshot from simulation state
  // This contains the final HP values after all damage/healing
  const post = [...simState.party, ...simState.enemies].map(a => ({ ...a }));
  
  return { 
    turn: state.turn, 
    seed, 
    order, 
    effects, 
    post 
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
