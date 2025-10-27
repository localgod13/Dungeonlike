import { Effect } from '../net/proto';

/**
 * Animation timeline builder for deterministic combat effects
 */

export interface TimelineEvent {
  time: number;
  effect: Effect;
  callback: () => void;
}

export class AnimationTimeline {
  private events: TimelineEvent[] = [];
  private startTime: number = 0;
  private isPlaying: boolean = false;
  private currentTime: number = 0;

  constructor() {
    this.events = [];
  }

  /**
   * Add an effect to the timeline
   */
  addEffect(effect: Effect, callback: () => void): void {
    console.log('Adding effect to timeline:', effect.at, effect.kind, effect.src, effect.dst);
    this.events.push({
      time: effect.at,
      effect,
      callback,
    });
    console.log('Timeline now has', this.events.length, 'events');
  }

  /**
   * Sort events by time and start playback
   */
  start(): void {
    this.events.sort((a, b) => a.time - b.time);
    this.startTime = Date.now();
    this.isPlaying = true;
    this.currentTime = 0;
    
    console.log(`Starting timeline with ${this.events.length} events`);
  }

  /**
   * Update timeline (call from game loop)
   */
  update(): void {
    if (!this.isPlaying) return;

    this.currentTime = Date.now() - this.startTime;

    // Process events that should fire now
    while (this.events.length > 0 && this.events[0].time <= this.currentTime) {
      const event = this.events.shift()!;
      event.callback();
    }

    // Check if timeline is complete
    if (this.events.length === 0) {
      this.isPlaying = false;
      console.log('Timeline complete');
    }
  }

  /**
   * Stop the timeline
   */
  stop(): void {
    this.isPlaying = false;
    this.events = [];
  }

  /**
   * Check if timeline is still playing
   */
  isActive(): boolean {
    return this.isPlaying;
  }

  /**
   * Get remaining duration
   */
  getRemainingDuration(): number {
    if (this.events.length === 0) return 0;
    const lastEvent = this.events[this.events.length - 1];
    return Math.max(0, lastEvent.time - this.currentTime);
  }

  /**
   * Get total duration
   */
  getTotalDuration(): number {
    if (this.events.length === 0) return 0;
    const lastEvent = this.events[this.events.length - 1];
    return lastEvent.time;
  }
}

/**
 * Create animation callbacks for different effect types
 */
export interface AnimationCallbacks {
  onTelegraph: (srcId: string, dstId?: string) => void;
  onStrike: (srcId: string, dstId: string, note?: string) => void;
  onHit: (srcId: string, dstId: string, damage: number) => void;
  onGuard: (srcId: string, value: number) => void;
  onHeal: (srcId: string, dstId: string, value: number) => void;
  onVfx: (srcId: string, dstId?: string, note?: string) => void;
  onUltimateGain: (srcId: string, amount: number) => void;
  onMiss: (srcId: string, dstId: string) => void;
}

/**
 * Build timeline from effects with animation callbacks
 */
export function buildTimeline(
  effects: Effect[],
  callbacks: AnimationCallbacks
): AnimationTimeline {
  console.log('buildTimeline called with', effects.length, 'effects');
  const timeline = new AnimationTimeline();

  for (const effect of effects) {
    console.log('Processing effect:', effect);
    let callback: () => void;

    switch (effect.kind) {
      case 'vfx':
        if (effect.note === 'telegraph') {
          callback = () => callbacks.onTelegraph(effect.src, effect.dst);
        } else if (effect.note === 'guard-start') {
          callback = () => callbacks.onVfx(effect.src, undefined, effect.note);
        } else if (effect.note === 'heal-cast') {
          callback = () => callbacks.onVfx(effect.src, effect.dst, effect.note);
        } else if (
          effect.note === 'vulnerable' || 
          effect.note === 'stun' || 
          effect.note === 'fire_shield_retaliate' ||
          effect.note === 'poison' ||
          effect.note === 'burn' ||
          effect.note === 'blind' ||
          effect.note === 'taunt'
        ) {
          // Status effect VFX (Weaken, Bash, Fire Shield retaliation, poison, burn, blind, taunt, etc.)
          console.log(`[Timeline] Routing VFX effect with note="${effect.note}" to onVfx callback`);
          callback = () => callbacks.onVfx(effect.src, effect.dst, effect.note);
        } else {
          // Strike animations (slash, etc.)
          callback = () => callbacks.onStrike(effect.src, effect.dst!, effect.note);
        }
        break;

      case 'hit':
        callback = () => callbacks.onHit(effect.src, effect.dst!, effect.value!);
        break;

      case 'guard':
        callback = () => callbacks.onGuard(effect.src, effect.value!);
        break;

      case 'heal':
        callback = () => callbacks.onHeal(effect.src, effect.dst!, effect.value!);
        break;

      case 'miss':
        callback = () => callbacks.onMiss(effect.src, effect.dst!);
        break;

      case 'ultimate_gain':
        callback = () => {
          const amount = parseInt(effect.note || '0', 10);
          callbacks.onUltimateGain(effect.src, amount);
        };
        break;

      default:
        console.warn('Unknown effect kind:', effect.kind);
        callback = () => {};
    }

    console.log('Adding effect to timeline:', effect, 'callback:', callback);
    timeline.addEffect(effect, callback);
  }

  console.log('Timeline built with', timeline.events.length, 'events');
  return timeline;
}

/**
 * Utility to create staggered animations
 */
export function createStaggeredTimeline(
  baseTime: number,
  staggerMs: number,
  effects: Effect[],
  callbacks: AnimationCallbacks
): AnimationTimeline {
  const timeline = new AnimationTimeline();

  effects.forEach((effect, index) => {
    const adjustedEffect = {
      ...effect,
      at: baseTime + (index * staggerMs),
    };

    let callback: () => void;

    switch (effect.kind) {
      case 'vfx':
        if (effect.note === 'telegraph') {
          callback = () => callbacks.onTelegraph(effect.src, effect.dst);
        } else if (effect.note === 'guard-start') {
          callback = () => callbacks.onVfx(effect.src, undefined, effect.note);
        } else if (effect.note === 'heal-cast') {
          callback = () => callbacks.onVfx(effect.src, effect.dst, effect.note);
        } else if (
          effect.note === 'vulnerable' || 
          effect.note === 'stun' || 
          effect.note === 'fire_shield_retaliate' ||
          effect.note === 'poison' ||
          effect.note === 'burn' ||
          effect.note === 'blind' ||
          effect.note === 'taunt'
        ) {
          callback = () => callbacks.onVfx(effect.src, effect.dst, effect.note);
        } else {
          callback = () => callbacks.onStrike(effect.src, effect.dst!, effect.note);
        }
        break;
      case 'hit':
        callback = () => callbacks.onHit(effect.src, effect.dst!, effect.value!);
        break;
      case 'guard':
        callback = () => callbacks.onGuard(effect.src, effect.value!);
        break;
      case 'heal':
        callback = () => callbacks.onHeal(effect.src, effect.dst!, effect.value!);
        break;
      case 'miss':
        callback = () => callbacks.onMiss(effect.src, effect.dst!);
        break;
      default:
        callback = () => {};
    }

    timeline.addEffect(adjustedEffect, callback);
  });

  return timeline;
}
