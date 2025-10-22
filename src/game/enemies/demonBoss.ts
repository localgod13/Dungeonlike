/**
 * Demon Boss Enemy
 * Final boss of the first world - a powerful demonic entity
 */

import Phaser from 'phaser';

// Sprite URLs (using jsDelivr CDN for CORS compatibility)
const DEMON_BOSS_IDLE = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/demonboss/IDLE.png';
const DEMON_BOSS_ATTACK = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/demonboss/ATTACK.png';
const DEMON_BOSS_HURT = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/demonboss/HURT.png';
const DEMON_BOSS_DEATH = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/Enemies/demonboss/DEATH.png';

/**
 * Preload Demon Boss sprites
 */
export function preloadDemonBossSprites(scene: Phaser.Scene): void {
  console.log('Loading Demon Boss sprite: demon_boss_idle');
  scene.load.spritesheet('demon_boss_idle', DEMON_BOSS_IDLE, {
    frameWidth: 162,  // 648 / 4 columns
    frameHeight: 148,
  });

  console.log('Loading Demon Boss sprite: demon_boss_attack');
  scene.load.spritesheet('demon_boss_attack', DEMON_BOSS_ATTACK, {
    frameWidth: 162,  // 972 / 6 columns
    frameHeight: 148,
  });

  console.log('Loading Demon Boss sprite: demon_boss_hurt');
  scene.load.spritesheet('demon_boss_hurt', DEMON_BOSS_HURT, {
    frameWidth: 162,  // 486 / 3 columns
    frameHeight: 148,
  });

  console.log('Loading Demon Boss sprite: demon_boss_death');
  scene.load.spritesheet('demon_boss_death', DEMON_BOSS_DEATH, {
    frameWidth: 162,  // 1620 / 10 columns
    frameHeight: 148,
  });
}

/**
 * Create Demon Boss animations
 */
export function createDemonBossAnimations(scene: Phaser.Scene): void {
  // Idle animation
  if (!scene.anims.exists('demon_boss_idle_anim')) {
    scene.anims.create({
      key: 'demon_boss_idle_anim',
      frames: scene.anims.generateFrameNumbers('demon_boss_idle', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });
    console.log('Created Demon Boss animation: demon_boss_idle_anim');
  }

  // Attack animation
  if (!scene.anims.exists('demon_boss_attack_anim')) {
    scene.anims.create({
      key: 'demon_boss_attack_anim',
      frames: scene.anims.generateFrameNumbers('demon_boss_attack', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: 0,
    });
    console.log('Created Demon Boss animation: demon_boss_attack_anim');
  }

  // Hurt animation
  if (!scene.anims.exists('demon_boss_hurt_anim')) {
    scene.anims.create({
      key: 'demon_boss_hurt_anim',
      frames: scene.anims.generateFrameNumbers('demon_boss_hurt', { start: 0, end: 2 }),
      frameRate: 8,
      repeat: 0,
    });
    console.log('Created Demon Boss animation: demon_boss_hurt_anim');
  }

  // Death animation
  if (!scene.anims.exists('demon_boss_death_anim')) {
    scene.anims.create({
      key: 'demon_boss_death_anim',
      frames: scene.anims.generateFrameNumbers('demon_boss_death', { start: 0, end: 9 }),
      frameRate: 10,
      repeat: 0,
    });
    console.log('Created Demon Boss animation: demon_boss_death_anim');
  }
}

/**
 * Create a Demon Boss sprite
 */
export function createDemonBossSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 2.0
): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(x, y, 'demon_boss_idle');
  sprite.setScale(scale);
  // Sprite already faces left in the source image, no flip needed
  sprite.play('demon_boss_idle_anim');
  
  console.log(`Created Demon Boss sprite at (${x}, ${y}) with scale ${scale}`);
  
  return sprite;
}

/**
 * Play Demon Boss attack animation
 */
export function playDemonBossAttack(sprite: Phaser.GameObjects.Sprite): void {
  sprite.play('demon_boss_attack_anim');
  
  // Return to idle after attack completes
  sprite.once('animationcomplete', () => {
    sprite.play('demon_boss_idle_anim');
  });
}

/**
 * Play Demon Boss hurt animation
 */
export function playDemonBossHurt(sprite: Phaser.GameObjects.Sprite): void {
  sprite.play('demon_boss_hurt_anim');
  
  // Return to idle after hurt completes
  sprite.once('animationcomplete', () => {
    sprite.play('demon_boss_idle_anim');
  });
}

/**
 * Play Demon Boss death animation
 */
export function playDemonBossDeath(sprite: Phaser.GameObjects.Sprite): void {
  sprite.play('demon_boss_death_anim');
  
  // Fade out and destroy after death animation
  sprite.once('animationcomplete', () => {
    sprite.scene.tweens.add({
      targets: sprite,
      alpha: 0,
      duration: 1000,
      onComplete: () => {
        sprite.destroy();
      },
    });
  });
}

