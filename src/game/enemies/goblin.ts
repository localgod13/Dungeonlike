/**
 * Goblin Enemy
 * Sprite animations and configuration for the Goblin enemy type
 */

import Phaser from 'phaser';

export interface EnemyAnimationConfig {
  key: string;
  spriteKey: string;
  frameCount: number;
  frameRate: number;
  repeat: number;
}

export interface EnemySpriteSheetConfig {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
}

// Goblin sprite sheets
export const GOBLIN_SPRITES: Record<string, EnemySpriteSheetConfig> = {
  idle: {
    key: 'goblin_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/goblin/IDLE.png',
    frameWidth: 116,  // 696 / 6 columns
    frameHeight: 78,  // 1 row
  },
  death: {
    key: 'goblin_death',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/goblin/DEATH.png',
    frameWidth: 116,  // 1160 / 10 columns
    frameHeight: 76,  // 1 row
  },
  // Future animations:
  // attack: { ... },
  // hurt: { ... },
};

// Goblin animations
export const GOBLIN_ANIMATIONS: Record<string, EnemyAnimationConfig> = {
  idle: {
    key: 'goblin_idle_anim',
    spriteKey: 'goblin_idle',
    frameCount: 6,
    frameRate: 8,
    repeat: -1, // Loop forever
  },
  death: {
    key: 'goblin_death_anim',
    spriteKey: 'goblin_death',
    frameCount: 10,
    frameRate: 10,
    repeat: 0, // Play once
  },
};

/**
 * Preload Goblin sprites
 */
export function preloadGoblinSprites(scene: Phaser.Scene): void {
  Object.values(GOBLIN_SPRITES).forEach((config) => {
    console.log(`Loading Goblin sprite: ${config.key}`);
    scene.load.spritesheet(config.key, config.url, {
      frameWidth: config.frameWidth,
      frameHeight: config.frameHeight,
    });
  });
}

/**
 * Create Goblin animations
 */
export function createGoblinAnimations(scene: Phaser.Scene): void {
  Object.values(GOBLIN_ANIMATIONS).forEach((config) => {
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
      console.log(`Created Goblin animation: ${config.key}`);
    } catch (error) {
      console.error(`Failed to create Goblin animation ${config.key}:`, error);
    }
  });
}

/**
 * Create a Goblin sprite with idle animation
 */
export function createGoblinSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.0
): Phaser.GameObjects.Sprite | null {
  try {
    const sprite = scene.add.sprite(x, y, GOBLIN_SPRITES.idle.key);
    sprite.setScale(scale);
    
    // Start animation with random frame offset to desync multiple goblins
    const randomFrameOffset = Math.floor(Math.random() * GOBLIN_ANIMATIONS.idle.frameCount);
    sprite.play({
      key: GOBLIN_ANIMATIONS.idle.key,
      startFrame: randomFrameOffset,
    });
    
    console.log(`Goblin animation started at frame ${randomFrameOffset}`);
    
    return sprite;
  } catch (error) {
    console.error('Failed to create Goblin sprite:', error);
    return null;
  }
}

