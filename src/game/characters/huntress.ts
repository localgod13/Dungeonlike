/**
 * Huntress Character Class
 * Sprite animations and configuration for the Huntress class
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

// Huntress sprite sheets
export const HUNTRESS_SPRITES: Record<string, SpriteSheetConfig> = {
  idle: {
    key: 'huntress_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/huntress/Idle.png',
    frameWidth: 100,  // 1000 / 10 columns
    frameHeight: 100,
  },
  attack: {
    key: 'huntress_attack',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/huntress/Attack.png',
    frameWidth: 100,  // 600 / 6 columns
    frameHeight: 100, // 1 row
  },
  arrow: {
    key: 'huntress_arrow',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/huntress/Static.png',
    frameWidth: 24,   // Arrow projectile
    frameHeight: 5,
  },
  hurt: {
    key: 'huntress_hurt',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/huntress/Get Hit.png',
    frameWidth: 100,  // 300 / 3 columns
    frameHeight: 100, // 1 row
  },
  // Future animations can be added here:
  // death: { ... },
};

// Huntress animations
export const HUNTRESS_ANIMATIONS: Record<string, AnimationConfig> = {
  idle: {
    key: 'huntress_idle_anim',
    spriteKey: 'huntress_idle',
    frameCount: 10,
    frameRate: 8,
    repeat: -1, // Loop forever
  },
  attack: {
    key: 'huntress_attack_anim',
    spriteKey: 'huntress_attack',
    frameCount: 6,
    frameRate: 12,
    repeat: 0, // Play once
  },
  hurt: {
    key: 'huntress_hurt_anim',
    spriteKey: 'huntress_hurt',
    frameCount: 3,
    frameRate: 10,
    repeat: 0, // Play once
  },
};

/**
 * Preload all Huntress sprites
 */
export function preloadHuntressSprites(scene: Phaser.Scene): void {
  Object.values(HUNTRESS_SPRITES).forEach((config) => {
    console.log(`Loading Huntress sprite: ${config.key}`);
    
    // Arrow is a simple image, not an animated spritesheet
    if (config.key === 'huntress_arrow') {
      scene.load.image(config.key, config.url);
    } else {
      scene.load.spritesheet(config.key, config.url, {
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
      });
    }
  });
}

/**
 * Create all Huntress animations
 */
export function createHuntressAnimations(scene: Phaser.Scene): void {
  Object.values(HUNTRESS_ANIMATIONS).forEach((config) => {
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
      console.log(`Created Huntress animation: ${config.key}`);
    } catch (error) {
      console.error(`Failed to create Huntress animation ${config.key}:`, error);
    }
  });
}

/**
 * Create a Huntress sprite with idle animation
 */
export function createHuntressSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.0
): Phaser.GameObjects.Sprite | null {
  try {
    const sprite = scene.add.sprite(x, y, HUNTRESS_SPRITES.idle.key);
    // Huntress sprite is smaller (100x100 vs Warrior's 162x162)
    // Scale adjustment to match other characters
    const adjustedScale = scale * 1.1;
    sprite.setScale(adjustedScale);
    sprite.play(HUNTRESS_ANIMATIONS.idle.key);
    return sprite;
  } catch (error) {
    console.error('Failed to create Huntress sprite:', error);
    return null;
  }
}

