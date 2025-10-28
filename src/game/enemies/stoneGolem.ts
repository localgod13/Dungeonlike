/**
 * Stone Golem Enemy
 * Sprite animations and configuration for the Stone Golem enemy type
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

// Stone Golem sprite sheets
export const STONE_GOLEM_SPRITES: Record<string, EnemySpriteSheetConfig> = {
  idle: {
    key: 'stone_golem_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Stone%20Golem/IDLE.png',
    frameWidth: 220,
    frameHeight: 96,
  },
  attack: {
    key: 'stone_golem_attack',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Stone%20Golem/ATTACK.png',
    frameWidth: 220,
    frameHeight: 96,
  },
  death: {
    key: 'stone_golem_death',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Stone%20Golem/DEATH.png',
    frameWidth: 220,
    frameHeight: 96,
  },
  hurt: {
    key: 'stone_golem_hurt',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/Stone%20Golem/HURT.png',
    frameWidth: 220,
    frameHeight: 96,
  },
};

// Stone Golem animations
export const STONE_GOLEM_ANIMATIONS: Record<string, EnemyAnimationConfig> = {
  idle: {
    key: 'stone_golem_idle_anim',
    spriteKey: 'stone_golem_idle',
    frameCount: 13,
    frameRate: 8,
    repeat: -1,
  },
  attack: {
    key: 'stone_golem_attack_anim',
    spriteKey: 'stone_golem_attack',
    frameCount: 20,
    frameRate: 12,
    repeat: 0,
  },
  death: {
    key: 'stone_golem_death_anim',
    spriteKey: 'stone_golem_death',
    frameCount: 10,
    frameRate: 10,
    repeat: 0,
  },
  hurt: {
    key: 'stone_golem_hurt_anim',
    spriteKey: 'stone_golem_hurt',
    frameCount: 6,
    frameRate: 10,
    repeat: 0,
  },
};

export function preloadStoneGolemSprites(scene: Phaser.Scene): void {
  Object.values(STONE_GOLEM_SPRITES).forEach((config) => {
    console.log(`Loading Stone Golem sprite: ${config.key}`);
    scene.load.spritesheet(config.key, config.url, {
      frameWidth: config.frameWidth,
      frameHeight: config.frameHeight,
    });
  });
}

export function createStoneGolemAnimations(scene: Phaser.Scene): void {
  Object.values(STONE_GOLEM_ANIMATIONS).forEach((config) => {
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
      console.log(`Created Stone Golem animation: ${config.key}`);
    } catch (error) {
      console.error(`Failed to create Stone Golem animation ${config.key}:`, error);
    }
  });
}

export function createStoneGolemSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.5
): Phaser.GameObjects.Sprite | null {
  try {
    const sprite = scene.add.sprite(x, y, STONE_GOLEM_SPRITES.idle.key);
    sprite.setScale(scale);
    sprite.setFlipX(false); // Stone Golem faces left naturally
    
    const randomFrameOffset = Math.floor(Math.random() * STONE_GOLEM_ANIMATIONS.idle.frameCount);
    sprite.play({
      key: STONE_GOLEM_ANIMATIONS.idle.key,
      startFrame: randomFrameOffset,
    });
    
    console.log(`Stone Golem animation started at frame ${randomFrameOffset}`);
    
    return sprite;
  } catch (error) {
    console.error('Failed to create Stone Golem sprite:', error);
    return null;
  }
}

