/**
 * Enemy Sprite Management
 * Unified interface for all enemy sprites and animations
 * Each enemy type has its own module in the enemies/ directory
 */

import Phaser from 'phaser';
import { 
  preloadFlyingDemonSprites, 
  createFlyingDemonAnimations, 
  createFlyingDemonSprite 
} from './enemies/flyingDemon';
import { 
  preloadGoblinSprites, 
  createGoblinAnimations, 
  createGoblinSprite 
} from './enemies/goblin';
import {
  preloadSkeleMageSprites,
  createSkeleMageAnimations,
  createSkeleMageSprite
} from './enemies/skeleMage';
import {
  preloadMinotaurSprites,
  createMinotaurAnimations,
  createMinotaurSprite
} from './enemies/minotaur';
import {
  preloadDemonBossSprites,
  createDemonBossAnimations,
  createDemonBossSprite,
} from './enemies/demonBoss';
import {
  preloadStoneGolemSprites,
  createStoneGolemAnimations,
  createStoneGolemSprite,
} from './enemies/stoneGolem';
import {
  preloadSkeletonWarriorSprites,
  createSkeletonWarriorAnimations,
  createSkeletonWarriorSprite,
} from './enemies/skeletonWarrior';

// Enemy types
export type EnemyType = 'FlyingDemon' | 'Goblin' | 'SkeleMage' | 'Minotaur' | 'DemonBoss' | 'StoneGolem' | 'SkeletonWarrior' | 'Skeleton' | 'Slime';

/**
 * Preload all enemy sprites
 * Call this in your scene's preload() method
 */
export function preloadEnemySprites(scene: Phaser.Scene): void {
  console.log('Preloading enemy sprites...');
  
  preloadFlyingDemonSprites(scene);
  preloadGoblinSprites(scene);
  preloadSkeleMageSprites(scene);
  preloadMinotaurSprites(scene);
  preloadDemonBossSprites(scene);
  preloadStoneGolemSprites(scene);
  preloadSkeletonWarriorSprites(scene);
  // Future: preloadSlimeSprites(scene);
}

/**
 * Create animations for all enemy types
 * Call this in your scene's create() method after preloading
 */
export function createEnemyAnimations(scene: Phaser.Scene): void {
  console.log('Creating enemy animations...');
  
  createFlyingDemonAnimations(scene);
  createGoblinAnimations(scene);
  createSkeleMageAnimations(scene);
  createMinotaurAnimations(scene);
  createDemonBossAnimations(scene);
  createStoneGolemAnimations(scene);
  createSkeletonWarriorAnimations(scene);
  // Future: createSlimeAnimations(scene);
}

/**
 * Create an enemy sprite for the given type
 */
export function createEnemySprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  enemyType: EnemyType,
  scale: number = 1.0
): Phaser.GameObjects.Sprite | null {
  switch (enemyType) {
    case 'FlyingDemon':
      return createFlyingDemonSprite(scene, x, y, scale);
    case 'Goblin':
      return createGoblinSprite(scene, x, y, scale);
    case 'SkeleMage':
      return createSkeleMageSprite(scene, x, y, scale);
    case 'Minotaur':
      return createMinotaurSprite(scene, x, y, scale);
    case 'DemonBoss':
      return createDemonBossSprite(scene, x, y, scale);
    case 'StoneGolem':
      return createStoneGolemSprite(scene, x, y, scale);
    case 'SkeletonWarrior':
      return createSkeletonWarriorSprite(scene, x, y, scale);
    // Future cases:
    // case 'Skeleton': return createSkeletonSprite(scene, x, y, scale);
    // case 'Slime': return createSlimeSprite(scene, x, y, scale);
    default:
      console.warn(`Unknown enemy type: ${enemyType}`);
      return null;
  }
}

/**
 * Check if an enemy type has sprite support
 */
export function hasEnemySprite(enemyType: string): boolean {
  const supportedTypes: EnemyType[] = ['FlyingDemon', 'Goblin', 'SkeleMage', 'Minotaur', 'DemonBoss', 'StoneGolem', 'SkeletonWarrior'];
  return supportedTypes.includes(enemyType as EnemyType);
}

