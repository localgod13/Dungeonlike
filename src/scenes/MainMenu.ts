import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { SoundManager } from '../game/sound';

/**
 * Main menu - entry point, play button routes to lobby
 */
export class MainMenu extends Phaser.Scene {
  private soundManager: SoundManager | null = null;

  constructor() {
    super('MainMenu');
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Set background color (fallback if image fails to load)
    this.cameras.main.setBackgroundColor('#0d0d0d');

    // Add background image
    const bg = this.add.image(0, 0, 'mmbg');
    bg.setOrigin(0, 0);
    bg.setDepth(-1); // Behind everything
    
    // Scale background to cover screen while maintaining aspect ratio
    const scaleX = width / bg.width;
    const scaleY = height / bg.height;
    const scale = Math.max(scaleX, scaleY); // Use max to cover entire screen
    bg.setScale(scale);
    
    // Center the background
    bg.setPosition(
      (width - bg.width * scale) / 2,
      (height - bg.height * scale) / 2
    );
    
    console.log(`Main menu background loaded: ${bg.width}x${bg.height}, scaled: ${scale.toFixed(2)}x`);

    // Initialize sound manager and play title music
    this.soundManager = new SoundManager(this);
    this.soundManager.playMusic('music_title', { volume: 0.3, loop: true });
    console.log('Title music started');

    // Title (with shadow for visibility over background)
    const title = this.add.text(width / 2, height / 3, 'DARKEST LIGHT', {
      fontSize: '64px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 8,
    });
    title.setOrigin(0.5);

    // Subtitle (with shadow for visibility)
    const subtitle = this.add.text(width / 2, height / 3 + 70, 'Co-op Dungeon Crawler', {
      fontSize: '24px',
      color: '#cccccc',
      fontFamily: 'Arial, sans-serif',
      stroke: '#000000',
      strokeThickness: 4,
    });
    subtitle.setOrigin(0.5);

    // Play button
    this.createButton(width / 2, height / 2 + 100, 'PLAY', () => {
      this.scene.start('Lobby');
    });

    // Version info
    const version = this.add.text(width - 10, height - 10, 'v0.0.1', {
      fontSize: '14px',
      color: '#666666',
      fontFamily: 'Arial, sans-serif',
    });
    version.setOrigin(1, 1);

    console.log('Main menu ready');
  }

  private createButton(x: number, y: number, text: string, callback: () => void): void {
    const width = 200;
    const height = 60;

    const bg = this.add.rectangle(x, y, width, height, COLORS.UI_ACCENT, 1);
    bg.setStrokeStyle(3, 0xffffff, 0.8);
    bg.setInteractive({ useHandCursor: true });

    const label = this.add.text(x, y, text, {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 0.8);
      this.tweens.add({
        targets: [bg, label],
        scale: 1.05,
        duration: 100,
        ease: 'Power2',
      });
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 1);
      this.tweens.add({
        targets: [bg, label],
        scale: 1,
        duration: 100,
        ease: 'Power2',
      });
    });

    bg.on('pointerdown', callback);
  }

  shutdown(): void {
    // Don't stop music here - let it continue to Lobby
    // Music will fade out when transitioning to card selection
  }

  destroy(): void {
    // Clean up sound manager
    if (this.soundManager) {
      this.soundManager.destroy();
      this.soundManager = null;
    }
  }
}

