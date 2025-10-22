/**
 * Skele Mage Enemy
 * Skeletal sorcerer enemy with magical attacks
 */

import Phaser from 'phaser';

// Sprite URLs (using jsDelivr CDN for CORS compatibility)
const SKELE_MAGE_IDLE = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/skelemage/IDLE.png';
const SKELE_MAGE_ATTACK = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/skelemage/ATTACK.png';
const SKELE_MAGE_HURT = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/skelemage/HURT.png';
const SKELE_MAGE_DEATH = 'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/sprites/skelemage/DEATH.png';

/**
 * Preload Skele Mage sprites
 */
export function preloadSkeleMageSprites(scene: Phaser.Scene): void {
  console.log('Loading Skele Mage sprite: skele_mage_idle');
  scene.load.spritesheet('skele_mage_idle', SKELE_MAGE_IDLE, {
    frameWidth: 128,  // 768 / 6 columns
    frameHeight: 128,
  });

  console.log('Loading Skele Mage sprite: skele_mage_attack');
  scene.load.spritesheet('skele_mage_attack', SKELE_MAGE_ATTACK, {
    frameWidth: 128,  // 1152 / 9 columns
    frameHeight: 128,
  });

  console.log('Loading Skele Mage sprite: skele_mage_hurt');
  scene.load.spritesheet('skele_mage_hurt', SKELE_MAGE_HURT, {
    frameWidth: 128,  // 512 / 4 columns
    frameHeight: 128,
  });

  console.log('Loading Skele Mage sprite: skele_mage_death');
  scene.load.spritesheet('skele_mage_death', SKELE_MAGE_DEATH, {
    frameWidth: 128,  // 1280 / 10 columns
    frameHeight: 128,
  });
}

/**
 * Create Skele Mage animations
 */
export function createSkeleMageAnimations(scene: Phaser.Scene): void {
  // Idle animation
  if (!scene.anims.exists('skele_mage_idle_anim')) {
    scene.anims.create({
      key: 'skele_mage_idle_anim',
      frames: scene.anims.generateFrameNumbers('skele_mage_idle', { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
    console.log('Created Skele Mage animation: skele_mage_idle_anim');
  }

  // Attack animation
  if (!scene.anims.exists('skele_mage_attack_anim')) {
    scene.anims.create({
      key: 'skele_mage_attack_anim',
      frames: scene.anims.generateFrameNumbers('skele_mage_attack', { start: 0, end: 8 }),
      frameRate: 12,
      repeat: 0,
    });
    console.log('Created Skele Mage animation: skele_mage_attack_anim');
  }

  // Hurt animation
  if (!scene.anims.exists('skele_mage_hurt_anim')) {
    scene.anims.create({
      key: 'skele_mage_hurt_anim',
      frames: scene.anims.generateFrameNumbers('skele_mage_hurt', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: 0,
    });
    console.log('Created Skele Mage animation: skele_mage_hurt_anim');
  }

  // Death animation
  if (!scene.anims.exists('skele_mage_death_anim')) {
    scene.anims.create({
      key: 'skele_mage_death_anim',
      frames: scene.anims.generateFrameNumbers('skele_mage_death', { start: 0, end: 9 }),
      frameRate: 10,
      repeat: 0,
    });
    console.log('Created Skele Mage animation: skele_mage_death_anim');
  }
}

/**
 * Create a Skele Mage sprite
 */
export function createSkeleMageSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number = 1.5
): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(x, y, 'skele_mage_idle');
  sprite.setScale(scale);
  sprite.setFlipX(true); // Flip horizontally to face left (towards players)
  sprite.play('skele_mage_idle_anim');
  
  console.log(`Created Skele Mage sprite at (${x}, ${y}) with scale ${scale}, flipped to face left`);
  
  return sprite;
}

/**
 * Play Skele Mage attack animation
 */
export function playSkeleMageAttack(sprite: Phaser.GameObjects.Sprite): void {
  sprite.play('skele_mage_attack_anim');
  
  // Return to idle after attack completes
  sprite.once('animationcomplete', () => {
    sprite.play('skele_mage_idle_anim');
  });
}

/**
 * Play Skele Mage hurt animation
 */
export function playSkeleMageHurt(sprite: Phaser.GameObjects.Sprite): void {
  sprite.play('skele_mage_hurt_anim');
  
  // Return to idle after hurt completes
  sprite.once('animationcomplete', () => {
    sprite.play('skele_mage_idle_anim');
  });
}

/**
 * Play Skele Mage death animation
 */
export function playSkeleMageDeath(sprite: Phaser.GameObjects.Sprite): void {
  sprite.play('skele_mage_death_anim');
  
  // Fade out and destroy after death animation
  sprite.once('animationcomplete', () => {
    sprite.scene.tweens.add({
      targets: sprite,
      alpha: 0,
      duration: 500,
      onComplete: () => {
        sprite.destroy();
      },
    });
  });
}

