/**
 * Character Sprite Management
 * Unified interface for all character class sprites and animations
 * Each class has its own module in the characters/ directory
 */

import Phaser from 'phaser';
import { preloadWarriorSprites, createWarriorAnimations, createWarriorSprite } from './characters/warrior';
import { preloadMageSprites, createMageAnimations, createMageSprite } from './characters/mage';
import { preloadHuntressSprites, createHuntressAnimations, createHuntressSprite } from './characters/huntress';

// Character class types
export type CharacterClass = 'Warrior' | 'Huntress' | 'Mage';

/**
 * Preload all character sprites
 * Call this in your scene's preload() method
 */
export function preloadCharacterSprites(scene: Phaser.Scene): void {
  console.log('Preloading character sprites...');
  
  preloadWarriorSprites(scene);
  preloadMageSprites(scene);
  preloadHuntressSprites(scene);
}

/**
 * Create animations for all character classes
 * Call this in your scene's create() method after preloading
 */
export function createCharacterAnimations(scene: Phaser.Scene): void {
  console.log('Creating character animations...');
  
  createWarriorAnimations(scene);
  createMageAnimations(scene);
  createHuntressAnimations(scene);
}

/**
 * Create a character sprite for the given class
 * @param scene - Phaser scene
 * @param x - X position
 * @param y - Y position
 * @param characterClass - Character class (Warrior, Huntress, Mage)
 * @param scale - Scale factor (default 1.0)
 * @returns Sprite object or null if class not available
 */
export function createCharacterSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  characterClass: CharacterClass,
  scale: number = 1.0
): Phaser.GameObjects.Sprite | null {
  console.log(`Creating sprite for ${characterClass} at (${x}, ${y}) with scale ${scale}`);
  
  switch (characterClass) {
    case 'Warrior':
      return createWarriorSprite(scene, x, y, scale);
    case 'Mage':
      return createMageSprite(scene, x, y, scale);
    case 'Huntress':
      return createHuntressSprite(scene, x, y, scale);
    default:
      console.warn(`Unknown character class: ${characterClass}`);
      return null;
  }
}

/**
 * Check if a sprite is available for the given class
 */
export function hasSprite(characterClass: CharacterClass): boolean {
  // All three classes now have sprites!
  return characterClass === 'Warrior' || characterClass === 'Mage' || characterClass === 'Huntress';
}

