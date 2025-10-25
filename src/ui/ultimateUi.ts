import Phaser from 'phaser';
import { ActorId } from '../net/proto';
import { UltimateState } from '../game/ultimate';

/**
 * Ultimate Power Bar UI Component
 * Displays the ultimate charge with dopamine-inducing visual effects
 */

interface PowerBarConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  actorId: ActorId;
  actorName: string;
  classColor: number; // Class-specific color
}

export class UltimatePowerBar {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private actorId: ActorId;
  
  // Visual elements
  private background: Phaser.GameObjects.Rectangle;
  private fillBar: Phaser.GameObjects.Rectangle;
  private glowBar: Phaser.GameObjects.Rectangle;
  private borderRect: Phaser.GameObjects.Rectangle;
  private readyText: Phaser.GameObjects.Text;
  private percentText: Phaser.GameObjects.Text;
  private pulseCircles: Phaser.GameObjects.Arc[] = [];
  private particles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  
  // Animation state
  private currentPower: number = 0;
  private targetPower: number = 0;
  private isAnimating: boolean = false;
  private isPulsing: boolean = false;
  private classColor: number;
  
  // Configuration
  private config: PowerBarConfig;

  constructor(scene: Phaser.Scene, config: PowerBarConfig) {
    this.scene = scene;
    this.config = config;
    this.actorId = config.actorId;
    this.classColor = config.classColor;
    
    this.container = scene.add.container(config.x, config.y);
    this.container.setDepth(100); // Ensure it's visible over other UI elements
    this.container.setScrollFactor(0); // Fixed to screen
    
    this.createVisuals();
  }

  private createVisuals(): void {
    const { width, height } = this.config;
    
    // Background (dark)
    this.background = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    this.background.setOrigin(0, 0.5);
    
    // Glow bar (behind fill, for pulsing effect)
    this.glowBar = this.scene.add.rectangle(2, 0, 0, height - 4, this.classColor, 0);
    this.glowBar.setOrigin(0, 0.5);
    
    // Fill bar (actual power level)
    this.fillBar = this.scene.add.rectangle(2, 0, 0, height - 4, this.classColor, 1);
    this.fillBar.setOrigin(0, 0.5);
    
    // Border
    this.borderRect = this.scene.add.rectangle(0, 0, width, height, 0xffffff, 0);
    this.borderRect.setOrigin(0, 0.5);
    this.borderRect.setStrokeStyle(2, 0xffffff, 0.8);
    
    // "READY!" text (hidden initially)
    this.readyText = this.scene.add.text(width / 2, 0, '⚡ READY! ⚡', {
      fontSize: '16px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.readyText.setOrigin(0.5, 0.5);
    this.readyText.setVisible(false);
    
    // Percentage text
    this.percentText = this.scene.add.text(width / 2, 0, '0%', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.percentText.setOrigin(0.5, 0.5);
    
    // Add to container
    this.container.add([
      this.background,
      this.glowBar,
      this.fillBar,
      this.borderRect,
      this.percentText,
      this.readyText,
    ]);
    
    // Create pulse circles (for 80%+ effect)
    for (let i = 0; i < 3; i++) {
      const circle = this.scene.add.circle(width / 2, 0, 20, this.classColor, 0);
      circle.setStrokeStyle(2, this.classColor, 1);
      circle.setVisible(false);
      this.pulseCircles.push(circle);
      this.container.add(circle);
    }
  }

  /**
   * Update the power bar to a new value
   */
  updatePower(power: number, state: UltimateState): void {
    this.targetPower = Math.min(100, Math.max(0, power));
    
    // Animate fill bar
    if (!this.isAnimating) {
      this.animateFillBar();
    }
    
    // Update visual effects based on power level
    if (state.isReady) {
      this.showReadyState();
    } else {
      // Not ready - clear ready state and show appropriate effects
      this.clearReadyState();
      
      if (power >= 80) {
        this.startPulsing(state.glowIntensity);
      } else {
        this.stopPulsing();
      }
    }
  }

  /**
   * Animate the fill bar smoothly to target power
   */
  private animateFillBar(): void {
    this.isAnimating = true;
    
    this.scene.tweens.add({
      targets: this,
      currentPower: this.targetPower,
      duration: 300,
      ease: 'Power2',
      onUpdate: () => {
        this.updateBarVisuals();
      },
      onComplete: () => {
        this.isAnimating = false;
        this.currentPower = this.targetPower;
      },
    });
  }

  /**
   * Update bar visual elements
   */
  private updateBarVisuals(): void {
    const { width, height } = this.config;
    const fillWidth = (width - 4) * (this.currentPower / 100);
    
    this.fillBar.width = fillWidth;
    this.percentText.setText(`${Math.floor(this.currentPower)}%`);
    
    // Color shift as power increases (darker to brighter)
    const brightness = 0.6 + (this.currentPower / 100) * 0.4;
    const color = Phaser.Display.Color.GetColor(
      Math.floor(Phaser.Display.Color.GetColor(this.classColor >> 16 & 0xFF) * brightness),
      Math.floor(Phaser.Display.Color.GetColor(this.classColor >> 8 & 0xFF) * brightness),
      Math.floor(Phaser.Display.Color.GetColor(this.classColor & 0xFF) * brightness)
    );
    this.fillBar.setFillStyle(color, 1);
  }

  /**
   * Start pulsing effect at 80%+
   */
  private startPulsing(intensity: number): void {
    if (this.isPulsing) return;
    
    this.isPulsing = true;
    this.percentText.setVisible(true);
    this.readyText.setVisible(false);
    
    // Glow bar pulsing
    this.scene.tweens.add({
      targets: this.glowBar,
      alpha: intensity * 0.5,
      scaleX: 1.05,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // Border pulsing
    this.scene.tweens.add({
      targets: this.borderRect,
      alpha: { from: 0.8, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // Pulse circles
    this.pulseCircles.forEach((circle, index) => {
      circle.setVisible(true);
      
      this.scene.tweens.add({
        targets: circle,
        scale: { from: 1, to: 2 },
        alpha: { from: intensity, to: 0 },
        duration: 1200,
        delay: index * 400,
        repeat: -1,
        ease: 'Cubic.easeOut',
      });
    });
  }

  /**
   * Stop pulsing effect
   */
  private stopPulsing(): void {
    if (!this.isPulsing) return;
    
    this.isPulsing = false;
    
    this.scene.tweens.killTweensOf(this.glowBar);
    this.scene.tweens.killTweensOf(this.borderRect);
    
    this.glowBar.setAlpha(0);
    this.borderRect.setAlpha(0.8);
    
    this.pulseCircles.forEach(circle => {
      this.scene.tweens.killTweensOf(circle);
      circle.setVisible(false);
    });
  }

  /**
   * Clear the READY state (when power drops below 100% or after using ultimate)
   */
  private clearReadyState(): void {
    // Stop all ready state animations
    this.scene.tweens.killTweensOf(this.readyText);
    this.scene.tweens.killTweensOf(this.glowBar);
    this.scene.tweens.killTweensOf(this.borderRect);
    
    // Hide ready text, show percent text
    this.readyText.setVisible(false);
    this.percentText.setVisible(true);
    
    // Reset glow and border
    this.glowBar.setAlpha(0);
    this.glowBar.setScale(1);
    this.borderRect.setStrokeStyle(2, 0xffffff, 0.8);
    this.borderRect.setAlpha(0.8);
    
    // Destroy particles if they exist
    if (this.particles) {
      this.particles.stop();
      this.particles.destroy();
      this.particles = null;
    }
  }

  /**
   * Show the READY state with cinematic effects
   */
  private showReadyState(): void {
    this.stopPulsing();
    
    // Hide percent, show READY text
    this.percentText.setVisible(false);
    this.readyText.setVisible(true);
    
    // Flash animation
    this.scene.tweens.add({
      targets: this.readyText,
      scale: { from: 1, to: 1.2 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // Intense glow
    this.glowBar.setAlpha(0.8);
    this.scene.tweens.add({
      targets: this.glowBar,
      scaleX: { from: 1, to: 1.1 },
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // Border glow
    this.borderRect.setStrokeStyle(3, this.classColor, 1);
    this.scene.tweens.add({
      targets: this.borderRect,
      alpha: { from: 0.8, to: 1 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // Create particle effect
    this.createParticles();
  }

  /**
   * Create particle effect for READY state
   */
  private createParticles(): void {
    if (this.particles) return;
    
    const { width, height } = this.config;
    
    // Create particle emitter
    const particleTexture = this.scene.add.graphics();
    particleTexture.fillStyle(this.classColor, 1);
    particleTexture.fillCircle(2, 2, 2);
    particleTexture.generateTexture('ultimate_particle', 4, 4);
    particleTexture.destroy();
    
    this.particles = this.scene.add.particles(width / 2, 0, 'ultimate_particle', {
      speed: { min: 20, max: 50 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 1000,
      frequency: 100,
      quantity: 2,
    });
    
    this.container.add(this.particles);
  }

  /**
   * Trigger screen shake and flash when ultimate becomes ready
   */
  triggerReadyEffect(): void {
    // Camera shake
    this.scene.cameras.main.shake(200, 0.005);
    
    // Screen flash
    this.scene.cameras.main.flash(200, 255, 255, 255, false, (camera: any, progress: number) => {
      if (progress === 1) {
        console.log('[UltimateUI] Ready effect completed');
      }
    });
    
    // Container pop animation
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Reset the bar to 0 (after using ultimate)
   */
  reset(): void {
    this.currentPower = 0;
    this.targetPower = 0;
    
    // Clear all visual states
    this.stopPulsing();
    this.clearReadyState();
    
    // Reset fill bar
    this.fillBar.width = 0;
    this.percentText.setText('0%');
  }

  /**
   * Get the container for positioning
   */
  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  /**
   * Destroy the power bar
   */
  destroy(): void {
    this.stopPulsing();
    
    if (this.particles) {
      this.particles.destroy();
    }
    
    this.container.destroy();
  }
}

/**
 * Class color mapping
 */
export const CLASS_COLORS: Record<string, number> = {
  Warrior: 0xff4444, // Red
  Mage: 0x4444ff, // Blue
  Huntress: 0x44ff44, // Green
  Default: 0xffaa00, // Orange
};

/**
 * Get class color
 */
export function getClassColor(characterClass?: string): number {
  if (!characterClass) return CLASS_COLORS.Default;
  return CLASS_COLORS[characterClass] || CLASS_COLORS.Default;
}

