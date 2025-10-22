/**
 * Flying Demon Enemy
 * Sprite animations and configuration for the Flying Demon enemy type
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

// Flying Demon sprite sheets
export const FLYING_DEMON_SPRITES: Record<string, EnemySpriteSheetConfig> = {
  idle: {
    key: 'flying_demon_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/flying demon/IDLE.png',
    frameWidth: 79,   // 316 / 4 columns
    frameHeight: 69,  // 1 row
  },
  attack: {
    key: 'flying_demon_attack',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/flying demon/ATTACK.png',
    frameWidth: 79,   // Estimated 8 frames
    frameHeight: 69,
  },
  hurt: {
    key: 'flying_demon_hurt',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/flying demon/HURT.png',
    frameWidth: 79,   // Estimated 4 frames
    frameHeight: 69,
  },
  death: {
    key: 'flying_demon_death',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/flying demon/DEATH.png',
    frameWidth: 76,   // 533 / 7 columns (rounded)
    frameHeight: 69,  // 1 row
  },
};

// Flying Demon animations
export const FLYING_DEMON_ANIMATIONS: Record<string, EnemyAnimationConfig> = {
  idle: {
    key: 'flying_demon_idle_anim',
    spriteKey: 'flying_demon_idle',
    frameCount: 4,
    frameRate: 6,
    repeat: -1, // Loop forever
  },
  attack: {
    key: 'flying_demon_attack_anim',
    spriteKey: 'flying_demon_attack',
    frameCount: 8,
    frameRate: 12,
    repeat: 0, // Play once
  },
  hurt: {
    key: 'flying_demon_hurt_anim',
    spriteKey: 'flying_demon_hurt',
    frameCount: 4,
    frameRate: 10,
    repeat: 0, // Play once
  },
  death: {
    key: 'flying_demon_death_anim',
    spriteKey: 'flying_demon_death',
    frameCount: 7,
    frameRate: 10,
    repeat: 0, // Play once
  },
};

/**
 * Preload Flying Demon sprites
 */
export function preloadFlyingDemonSprites(scene: Phaser.Scene): void {
  Object.values(FLYING_DEMON_SPRITES).forEach((config) => {
    console.log(`Loading Flying Demon sprite: ${config.key}`);
    scene.load.spritesheet(config.key, config.url, {
      frameWidth: config.frameWidth,
      frameHeight: config.frameHeight,
    });
  });
}

/**
 * Create Flying Demon animations
 */
export function createFlyingDemonAnimations(scene: Phaser.Scene): void {
  Object.values(FLYING_DEMON_ANIMATIONS).forEach((config) => {
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
      console.log(`Created Flying Demon animation: ${config.key}`);
    } catch (error) {
      console.error(`Failed to create Flying Demon animation ${config.key}:`, error);
    }
  });
}

/**
 * Create a Flying Demon sprite with idle animation
 */
export function createFlyingDemonSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.0
): Phaser.GameObjects.Sprite | null {
  try {
    const sprite = scene.add.sprite(x, y, FLYING_DEMON_SPRITES.idle.key);
    sprite.setScale(scale);
    sprite.play(FLYING_DEMON_ANIMATIONS.idle.key);
    
    // Add floating animation for flying effect
    scene.tweens.add({
      targets: sprite,
      y: y - 10,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    return sprite;
  } catch (error) {
    console.error('Failed to create Flying Demon sprite:', error);
    return null;
  }
}

