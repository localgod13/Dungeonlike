/**
 * Mage (Wizard) Character Class
 * Sprite animations and configuration for the Mage class
 */

import Phaser from 'phaser';

export interface AnimationConfig {
  key: string;
  spriteKey: string;
  frameCount: number;
  frameRate: number;
  repeat: number;
}

export interface SpriteSheetConfig {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
}

// Mage sprite sheets
export const MAGE_SPRITES: Record<string, SpriteSheetConfig> = {
  idle: {
    key: 'mage_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/wizard2/Idle.png',
    frameWidth: 150,  // 1200 / 8 columns
    frameHeight: 150,
  },
  // Future animations can be added here:
  // attack: { ... },
  // hurt: { ... },
  // death: { ... },
};

// Mage animations
export const MAGE_ANIMATIONS: Record<string, AnimationConfig> = {
  idle: {
    key: 'mage_idle_anim',
    spriteKey: 'mage_idle',
    frameCount: 8,
    frameRate: 8,
    repeat: -1, // Loop forever
  },
};

/**
 * Preload all Mage sprites
 */
export function preloadMageSprites(scene: Phaser.Scene): void {
  Object.values(MAGE_SPRITES).forEach((config) => {
    console.log(`Loading Mage sprite: ${config.key}`);
    scene.load.spritesheet(config.key, config.url, {
      frameWidth: config.frameWidth,
      frameHeight: config.frameHeight,
    });
  });
}

/**
 * Create all Mage animations
 */
export function createMageAnimations(scene: Phaser.Scene): void {
  Object.values(MAGE_ANIMATIONS).forEach((config) => {
    if (scene.anims.exists(config.key)) {
      console.log(`Animation ${config.key} already exists, skipping`);
      return;
    }

    try {
      scene.anims.create({
        key: config.key,
        frames: scene.anims.generateFrameNumbers(config.spriteKey, {
          start: 0,
          end: config.frameCount - 1,
        }),
        frameRate: config.frameRate,
        repeat: config.repeat,
      });
      console.log(`Created Mage animation: ${config.key}`);
    } catch (error) {
      console.error(`Failed to create Mage animation ${config.key}:`, error);
    }
  });
}

/**
 * Create a Mage sprite with idle animation
 */
export function createMageSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.0
): Phaser.GameObjects.Sprite | null {
  try {
    const sprite = scene.add.sprite(x, y, MAGE_SPRITES.idle.key);
    // Mage sprite is now 150x150 (similar to Warrior's 162x162)
    // Scale slightly down to match proportions
    const adjustedScale = scale * 0.9;
    sprite.setScale(adjustedScale);
    sprite.play(MAGE_ANIMATIONS.idle.key);
    return sprite;
  } catch (error) {
    console.error('Failed to create Mage sprite:', error);
    return null;
  }
}

