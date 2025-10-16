/**
 * Deterministic RNG for combat resolution
 * Using Mulberry32 algorithm for fast, deterministic pseudo-random numbers
 */

/**
 * Mulberry32 PRNG implementation
 * @param a - 32-bit seed
 * @returns Function that returns next random number [0, 1)
 */
export function mulberry32(a: number) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate deterministic seed from turn number and lobby ID
 * @param turn - Current turn number
 * @param lobbyId - Lobby identifier
 * @returns 32-bit seed
 */
export function seedFrom(turn: number, lobbyId: string): number {
  // Simple hash: fold lobbyId into a 32-bit int + turn
  let h = 2166136261 >>> 0;
  for (let i = 0; i < lobbyId.length; i++) {
    h ^= lobbyId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h ^ (turn * 2654435761)) >>> 0;
}

/**
 * Seeded RNG for deterministic gameplay
 * Using mulberry32 algorithm for fast, deterministic pseudo-random numbers
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Generate next random number [0, 1)
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Random integer [min, max] inclusive
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Random float [min, max)
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Random boolean with given probability (0-1)
   */
  nextBool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Pick random element from array
   */
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Shuffle array in place
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Reset with new seed
   */
  setSeed(seed: number): void {
    this.state = seed;
  }

  /**
   * Get current seed state
   */
  getState(): number {
    return this.state;
  }
}

// Global RNG instance (initialized with seed from run start)
let globalRNG: SeededRNG | null = null;

export function initRNG(seed: number): void {
  globalRNG = new SeededRNG(seed);
}

export function getRNG(): SeededRNG {
  if (!globalRNG) {
    throw new Error('RNG not initialized! Call initRNG(seed) first.');
  }
  return globalRNG;
}

export function generateRunSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

