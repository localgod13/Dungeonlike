/**
 * Minotaur Enemy
 * Sprite animations and configuration for the Minotaur enemy type
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

// Minotaur sprite sheets
export const MINOTAUR_SPRITES: Record<string, EnemySpriteSheetConfig> = {
  idle: {
    key: 'minotaur_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Minotaur/iDLE.png',
    frameWidth: 128,  // 768 / 6 columns
    frameHeight: 128, // 1 row
  },
  attack1: {
    key: 'minotaur_attack1',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Minotaur/ATTACK1.png',
    frameWidth: 128,  // 768 / 6 columns
    frameHeight: 128,
  },
  attack2: {
    key: 'minotaur_attack2',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Minotaur/ATTACK2.png',
    frameWidth: 128,  // 896 / 7 columns
    frameHeight: 128,
  },
  hurt: {
    key: 'minotaur_hurt',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Minotaur/HURT.png',
    frameWidth: 128,  // 640 / 5 columns
    frameHeight: 128,
  },
  death: {
    key: 'minotaur_death',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Minotaur/DEATH.png',
    frameWidth: 128,  // 768 / 6 columns
    frameHeight: 128, // 1 row
  },
};

// Minotaur animations
export const MINOTAUR_ANIMATIONS: Record<string, EnemyAnimationConfig> = {
  idle: {
    key: 'minotaur_idle_anim',
    spriteKey: 'minotaur_idle',
    frameCount: 6,
    frameRate: 8,
    repeat: -1, // Loop forever
  },
  attack1: {
    key: 'minotaur_attack1_anim',
    spriteKey: 'minotaur_attack1',
    frameCount: 6,
    frameRate: 12,
    repeat: 0, // Play once
  },
  attack2: {
    key: 'minotaur_attack2_anim',
    spriteKey: 'minotaur_attack2',
    frameCount: 7,
    frameRate: 12,
    repeat: 0, // Play once
  },
  hurt: {
    key: 'minotaur_hurt_anim',
    spriteKey: 'minotaur_hurt',
    frameCount: 5,
    frameRate: 10,
    repeat: 0, // Play once
  },
  death: {
    key: 'minotaur_death_anim',
    spriteKey: 'minotaur_death',
    frameCount: 6,
    frameRate: 10,
    repeat: 0, // Play once
  },
};

/**
 * Preload Minotaur sprites
 */
export function preloadMinotaurSprites(scene: Phaser.Scene): void {
  Object.values(MINOTAUR_SPRITES).forEach((config) => {
    console.log(`Loading Minotaur sprite: ${config.key}`);
    scene.load.spritesheet(config.key, config.url, {
      frameWidth: config.frameWidth,
      frameHeight: config.frameHeight,
    });
  });
}

/**
 * Create Minotaur animations
 */
export function createMinotaurAnimations(scene: Phaser.Scene): void {
  Object.values(MINOTAUR_ANIMATIONS).forEach((config) => {
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
      console.log(`Created Minotaur animation: ${config.key}`);
    } catch (error) {
      console.error(`Failed to create Minotaur animation ${config.key}:`, error);
    }
  });
}

/**
 * Create a Minotaur sprite with idle animation
 */
export function createMinotaurSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.5
): Phaser.GameObjects.Sprite | null {
  try {
    const sprite = scene.add.sprite(x, y, MINOTAUR_SPRITES.idle.key);
    sprite.setScale(scale);
    sprite.setFlipX(true); // Flip to face left
    
    // Start animation with random frame offset to desync multiple minotaurs
    const randomFrameOffset = Math.floor(Math.random() * MINOTAUR_ANIMATIONS.idle.frameCount);
    sprite.play({
      key: MINOTAUR_ANIMATIONS.idle.key,
      startFrame: randomFrameOffset,
    });
    
    console.log(`Minotaur animation started at frame ${randomFrameOffset}`);
    
    return sprite;
  } catch (error) {
    console.error('Failed to create Minotaur sprite:', error);
    return null;
  }
}

