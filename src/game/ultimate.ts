import { ActorId, Actor } from '../net/proto';

/**
 * Ultimate Power System
 * Tracks and manages ultimate ability charge for each player
 */

export interface UltimateState {
  power: number; // 0-100
  isReady: boolean; // True when power >= 100
  isUsed: boolean; // True after using ultimate this battle
  glowIntensity: number; // 0-1 for visual effects
}

export interface UltimatePowerGain {
  cardPlayed: number; // +1-3% per card
  damageTaken: number; // +5-10% on taking damage
  kill: number; // +10-15% for kills
  assist: number; // +10-15% for assists
}

// Default power gain rates
export const DEFAULT_POWER_GAIN: UltimatePowerGain = {
  cardPlayed: 2, // Average 2%
  damageTaken: 7, // Average 7%
  kill: 12, // Average 12%
  assist: 10, // Average 10%
};

// Class-specific synergy bonuses
export interface ClassSynergyBonus {
  condition: string; // Description of the condition
  bonus: number; // % bonus to power gain
}

export const CLASS_SYNERGIES: Record<string, ClassSynergyBonus[]> = {
  Mage: [
    { condition: 'burn_tick', bonus: 2 }, // +2% when burn damage ticks
    { condition: 'fire_card', bonus: 1 }, // +1% extra when playing fire cards
  ],
  Huntress: [
    { condition: 'poison_tick', bonus: 2 }, // +2% when poison damage ticks
    { condition: 'poison_card', bonus: 1 }, // +1% extra when playing poison cards
  ],
  Warrior: [
    { condition: 'shield_absorb', bonus: 3 }, // +3% when shield absorbs damage
    { condition: 'low_hp', bonus: 5 }, // +5% bonus when below 30% HP
  ],
};

/**
 * Ultimate Power Manager
 * Manages ultimate power state for all actors
 */
export class UltimatePowerManager {
  private powerStates: Map<ActorId, UltimateState>;
  private classMap: Map<ActorId, string>; // Track actor's class

  constructor() {
    this.powerStates = new Map();
    this.classMap = new Map();
  }

  /**
   * Initialize power state for an actor
   */
  initializeActor(actorId: ActorId, characterClass?: string): void {
    if (!this.powerStates.has(actorId)) {
      this.powerStates.set(actorId, {
        power: 0,
        isReady: false,
        isUsed: false,
        glowIntensity: 0,
      });
    }
    if (characterClass) {
      this.classMap.set(actorId, characterClass);
    }
  }

  /**
   * Get power state for an actor
   */
  getPowerState(actorId: ActorId): UltimateState | null {
    return this.powerStates.get(actorId) || null;
  }

  /**
   * Get power percentage (0-100)
   */
  getPower(actorId: ActorId): number {
    const state = this.powerStates.get(actorId);
    return state ? state.power : 0;
  }

  /**
   * Check if ultimate is ready
   */
  isUltimateReady(actorId: ActorId): boolean {
    const state = this.powerStates.get(actorId);
    return state ? state.isReady && !state.isUsed : false;
  }

  /**
   * Add power to an actor's ultimate bar
   */
  addPower(actorId: ActorId, amount: number, source?: string): void {
    const state = this.powerStates.get(actorId);
    if (!state) return;

    // Apply class synergy bonuses
    let finalAmount = amount;
    const characterClass = this.classMap.get(actorId);
    
    if (characterClass && source) {
      const synergies = CLASS_SYNERGIES[characterClass];
      if (synergies) {
        for (const synergy of synergies) {
          if (source === synergy.condition) {
            finalAmount += synergy.bonus;
            console.log(`[Ultimate] ${characterClass} synergy bonus: +${synergy.bonus}% (${synergy.condition})`);
          }
        }
      }
    }

    // Add power (cap at 100)
    const oldPower = state.power;
    state.power = Math.min(100, state.power + finalAmount);
    
    // Reset isUsed flag when power reaches 100% again (allows recharging ultimate)
    if (state.power >= 100 && state.isUsed) {
      state.isUsed = false;
      console.log(`[Ultimate] ${actorId} recharged! Ultimate can be used again!`);
    }
    
    // Update ready state
    const wasReady = state.isReady;
    state.isReady = state.power >= 100 && !state.isUsed;

    // Update glow intensity (80%+ starts glowing)
    state.glowIntensity = Math.max(0, (state.power - 80) / 20);

    console.log(`[Ultimate] ${actorId} gained ${finalAmount.toFixed(1)}% power: ${oldPower.toFixed(1)}% → ${state.power.toFixed(1)}%`);

    // Log when ultimate becomes ready
    if (!wasReady && state.isReady) {
      console.log(`[Ultimate] 🔥 ${actorId} ULTIMATE READY! 🔥`);
    }
  }

  /**
   * Consume ultimate power (when used)
   */
  useUltimate(actorId: ActorId): boolean {
    const state = this.powerStates.get(actorId);
    if (!state || !state.isReady || state.isUsed) {
      return false;
    }

    // Reset power to 0
    state.power = 0;
    state.isUsed = true;
    state.isReady = false;
    state.glowIntensity = 0;
    
    console.log(`[Ultimate] ${actorId} used their ultimate! Power reset to 0.`);
    return true;
  }

  /**
   * Reset all power states (for new battle/run)
   */
  resetAll(): void {
    this.powerStates.clear();
    this.classMap.clear();
  }

  /**
   * Export power states for persistence between battles
   */
  exportState(): Map<ActorId, UltimateState> {
    // Create a deep copy of the power states
    const exported = new Map<ActorId, UltimateState>();
    this.powerStates.forEach((state, actorId) => {
      exported.set(actorId, { ...state });
    });
    return exported;
  }

  /**
   * Import power states from previous battle
   */
  importState(savedStates: Map<ActorId, UltimateState>, actorIdMap?: Map<string, string>): void {
    // If we have an actor ID mapping (old IDs to new IDs), use it
    // Otherwise, assume IDs stay the same
    savedStates.forEach((state, oldActorId) => {
      const newActorId = actorIdMap?.get(oldActorId) || oldActorId;
      
      // Restore the state but ensure isUsed is reset for new battle
      this.powerStates.set(newActorId, {
        ...state,
        isUsed: false, // Allow ultimate to be used again in new battle
      });
      
      console.log(`[Ultimate] Restored ${newActorId} power: ${state.power.toFixed(1)}%`);
    });
  }

  /**
   * Get class map for an actor
   */
  getActorClass(actorId: ActorId): string | undefined {
    return this.classMap.get(actorId);
  }

  /**
   * Get all actor IDs with ready ultimates
   */
  getReadyActors(): ActorId[] {
    const ready: ActorId[] = [];
    this.powerStates.forEach((state, actorId) => {
      if (state.isReady && !state.isUsed) {
        ready.push(actorId);
      }
    });
    return ready;
  }

  /**
   * Helper methods for common power gain scenarios
   */

  onCardPlayed(actorId: ActorId, cardName?: string): void {
    const baseGain = DEFAULT_POWER_GAIN.cardPlayed;
    const variation = (Math.random() * 2) - 1; // ±1%
    let source = 'card_played';
    
    // Check for special card types
    if (cardName) {
      if (cardName.toLowerCase().includes('fire') || cardName.toLowerCase().includes('burn')) {
        source = 'fire_card';
      } else if (cardName.toLowerCase().includes('poison') || cardName.toLowerCase().includes('venom')) {
        source = 'poison_card';
      }
    }
    
    this.addPower(actorId, baseGain + variation, source);
  }

  onDamageTaken(actorId: ActorId, damage: number, actor?: Actor): void {
    const baseGain = DEFAULT_POWER_GAIN.damageTaken;
    const variation = (Math.random() * 5) - 2.5; // ±2.5%
    let source = 'damage_taken';
    
    // Warrior synergy: extra power when at low HP
    if (actor && actor.hp / actor.maxHp < 0.3) {
      source = 'low_hp';
    }
    
    // Scale slightly with damage (more damage = more power)
    const damageScale = Math.min(1.5, damage / 20); // Up to 1.5x for 20+ damage
    
    this.addPower(actorId, (baseGain + variation) * damageScale, source);
  }

  onKill(actorId: ActorId): void {
    const baseGain = DEFAULT_POWER_GAIN.kill;
    const variation = (Math.random() * 5) - 2.5; // ±2.5%
    this.addPower(actorId, baseGain + variation, 'kill');
  }

  onAssist(actorId: ActorId): void {
    const baseGain = DEFAULT_POWER_GAIN.assist;
    const variation = (Math.random() * 5) - 2.5; // ±2.5%
    this.addPower(actorId, baseGain + variation, 'assist');
  }

  onDotTick(actorId: ActorId, dotType: 'poison' | 'burn'): void {
    const source = dotType === 'burn' ? 'burn_tick' : 'poison_tick';
    this.addPower(actorId, 2, source); // +2% base for DOT ticks
  }

  onShieldAbsorb(actorId: ActorId): void {
    this.addPower(actorId, 3, 'shield_absorb'); // +3% when shield blocks damage
  }
}

/**
 * Global ultimate power manager instance
 * Created and managed by BattleScene
 */
export let ultimatePowerManager: UltimatePowerManager | null = null;

/**
 * Persistent storage for ultimate power states between battles
 * This allows ultimates to carry over between stages
 */
let persistedUltimatePower: Map<ActorId, UltimateState> | null = null;
let persistedClassMap: Map<ActorId, string> | null = null;

/**
 * Create a new ultimate power manager
 * Optionally restores power from previous battle
 */
export function createUltimatePowerManager(restorePower: boolean = true): UltimatePowerManager {
  ultimatePowerManager = new UltimatePowerManager();
  
  // Restore power from previous battle if available
  if (restorePower && persistedUltimatePower && persistedUltimatePower.size > 0) {
    console.log('[Ultimate] Restoring power from previous battle');
    ultimatePowerManager.importState(persistedUltimatePower);
    
    // Restore class mappings
    if (persistedClassMap) {
      persistedClassMap.forEach((characterClass, actorId) => {
        ultimatePowerManager?.initializeActor(actorId, characterClass);
      });
    }
  } else {
    console.log('[Ultimate] Starting fresh (no previous power to restore)');
  }
  
  return ultimatePowerManager;
}

/**
 * Get the current ultimate power manager
 */
export function getUltimatePowerManager(): UltimatePowerManager | null {
  return ultimatePowerManager;
}

/**
 * Save ultimate power state for next battle
 */
export function saveUltimatePowerState(): void {
  if (!ultimatePowerManager) {
    console.log('[Ultimate] No power manager to save');
    return;
  }
  
  persistedUltimatePower = ultimatePowerManager.exportState();
  
  // Save class mappings
  persistedClassMap = new Map();
  persistedUltimatePower.forEach((_, actorId) => {
    const characterClass = ultimatePowerManager?.getActorClass(actorId);
    if (characterClass) {
      persistedClassMap?.set(actorId, characterClass);
    }
  });
  
  console.log('[Ultimate] Saved power state for next battle');
  persistedUltimatePower.forEach((state, actorId) => {
    console.log(`  ${actorId}: ${state.power.toFixed(1)}% power`);
  });
}

/**
 * Clear persisted ultimate power (when starting new run)
 */
export function clearPersistedUltimatePower(): void {
  persistedUltimatePower = null;
  persistedClassMap = null;
  console.log('[Ultimate] Cleared persisted power state');
}

/**
 * Check if there is persisted power available
 */
export function hasPersistedPower(): boolean {
  return persistedUltimatePower !== null && persistedUltimatePower.size > 0;
}

/**
 * Destroy the ultimate power manager
 * Note: This does NOT clear persisted power - that persists between battles
 */
export function destroyUltimatePowerManager(savePower: boolean = true): void {
  if (savePower) {
    saveUltimatePowerState();
  }
  ultimatePowerManager = null;
}

