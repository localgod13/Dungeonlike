/**
 * Warrior Character Class
 * Sprite animations and configuration for the Warrior class
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

// Warrior sprite sheets
export const WARRIOR_SPRITES: Record<string, SpriteSheetConfig> = {
  idle: {
    key: 'warrior_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/warrior/Idle.png',
    frameWidth: 162,  // 1620 / 10 columns
    frameHeight: 162,
  },
  // Future animations can be added here:
  // attack: { ... },
  // hurt: { ... },
  // death: { ... },
};

// Warrior animations
export const WARRIOR_ANIMATIONS: Record<string, AnimationConfig> = {
  idle: {
    key: 'warrior_idle_anim',
    spriteKey: 'warrior_idle',
    frameCount: 10,
    frameRate: 8,
    repeat: -1, // Loop forever
  },
};

/**
 * Preload all Warrior sprites
 */
export function preloadWarriorSprites(scene: Phaser.Scene): void {
  Object.values(WARRIOR_SPRITES).forEach((config) => {
    console.log(`Loading Warrior sprite: ${config.key}`);
    scene.load.spritesheet(config.key, config.url, {
      frameWidth: config.frameWidth,
      frameHeight: config.frameHeight,
    });
  });
}

/**
 * Create all Warrior animations
 */
export function createWarriorAnimations(scene: Phaser.Scene): void {
  Object.values(WARRIOR_ANIMATIONS).forEach((config) => {
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
      console.log(`Created Warrior animation: ${config.key}`);
    } catch (error) {
      console.error(`Failed to create Warrior animation ${config.key}:`, error);
    }
  });
}

/**
 * Create a Warrior sprite with idle animation
 */
export function createWarriorSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.0
): Phaser.GameObjects.Sprite | null {
  try {
    const sprite = scene.add.sprite(x, y, WARRIOR_SPRITES.idle.key);
    sprite.setScale(scale);
    sprite.play(WARRIOR_ANIMATIONS.idle.key);
    return sprite;
  } catch (error) {
    console.error('Failed to create Warrior sprite:', error);
    return null;
  }
}

