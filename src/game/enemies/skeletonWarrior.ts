import Phaser from 'phaser';

/**
 * Skeleton Warrior Enemy Sprites
 * Sprite sheets from: https://github.com/localgod13/Dungeonlike/blob/main/assets/sprites/Enemies/SkeleWar/
 */

// Sprite sheet configurations
export const SKELETON_WARRIOR_SPRITES = {
  idle: {
    key: 'skeleton_warrior_idle',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/SkeleWar/IDLE.png',
    frameWidth: 534 / 6,
    frameHeight: 78,
  },
  attack1: {
    key: 'skeleton_warrior_attack1',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/SkeleWar/ATTACK%201.png',
    frameWidth: 445 / 5,
    frameHeight: 78,
  },
  attack2: {
    key: 'skeleton_warrior_attack2',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/SkeleWar/ATTACK%202.png',
    frameWidth: 445 / 5,
    frameHeight: 78,
  },
  death: {
    key: 'skeleton_warrior_death',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/SkeleWar/DEATH.png',
    frameWidth: 534 / 6,
    frameHeight: 78,
  },
  hurt: {
    key: 'skeleton_warrior_hurt',
    url: 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/SkeleWar/HURT.png',
    frameWidth: 445 / 5,
    frameHeight: 78,
  },
};

// Animation configurations
export const SKELETON_WARRIOR_ANIMATIONS = {
  idle: {
    key: 'skeleton_warrior_idle_anim',
    frames: 'skeleton_warrior_idle',
    startFrame: 0,
    endFrame: 5,
    frameRate: 6,
    repeat: -1,
  },
  attack1: {
    key: 'skeleton_warrior_attack1_anim',
    frames: 'skeleton_warrior_attack1',
    startFrame: 0,
    endFrame: 4,
    frameRate: 10,
    repeat: 0,
  },
  attack2: {
    key: 'skeleton_warrior_attack2_anim',
    frames: 'skeleton_warrior_attack2',
    startFrame: 0,
    endFrame: 4,
    frameRate: 10,
    repeat: 0,
  },
  death: {
    key: 'skeleton_warrior_death_anim',
    frames: 'skeleton_warrior_death',
    startFrame: 0,
    endFrame: 5,
    frameRate: 12,
    repeat: 0,
  },
  hurt: {
    key: 'skeleton_warrior_hurt_anim',
    frames: 'skeleton_warrior_hurt',
    startFrame: 0,
    endFrame: 4,
    frameRate: 12,
    repeat: 0,
  },
};

/**
 * Preload all Skeleton Warrior sprite sheets
 */
export function preloadSkeletonWarriorSprites(scene: Phaser.Scene): void {
  Object.values(SKELETON_WARRIOR_SPRITES).forEach(sprite => {
    if (!scene.textures.exists(sprite.key)) {
      scene.load.spritesheet(sprite.key, sprite.url, {
        frameWidth: sprite.frameWidth,
        frameHeight: sprite.frameHeight,
      });
    }
  });
}

/**
 * Create all Skeleton Warrior animations
 */
export function createSkeletonWarriorAnimations(scene: Phaser.Scene): void {
  Object.values(SKELETON_WARRIOR_ANIMATIONS).forEach(anim => {
    if (!scene.anims.exists(anim.key)) {
      scene.anims.create({
        key: anim.key,
        frames: scene.anims.generateFrameNumbers(anim.frames, {
          start: anim.startFrame,
          end: anim.endFrame,
        }),
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      });
    }
  });
}

/**
 * Create a Skeleton Warrior sprite instance
 */
export function createSkeletonWarriorSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.5
): Phaser.GameObjects.Sprite | null {
  try {
    const sprite = scene.add.sprite(x, y, SKELETON_WARRIOR_SPRITES.idle.key);
    sprite.setScale(scale);
    sprite.setFlipX(false); // Skeleton Warrior faces left naturally
    sprite.setOrigin(0.5, 1); // Anchor at bottom center for ground alignment
    
    // Start idle animation
    const randomFrameOffset = Math.floor(Math.random() * SKELETON_WARRIOR_ANIMATIONS.idle.endFrame);
    sprite.play({
      key: SKELETON_WARRIOR_ANIMATIONS.idle.key,
      startFrame: randomFrameOffset,
    });
    
    console.log(`Skeleton Warrior animation started at frame ${randomFrameOffset}`);
    
    return sprite;
  } catch (error) {
    console.error('Failed to create Skeleton Warrior sprite:', error);
    return null;
  }
}

