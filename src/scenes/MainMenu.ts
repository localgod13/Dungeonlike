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

    // Initialize sound manager and play title music
    this.soundManager = new SoundManager(this);
    this.soundManager.playMusic('music_title', { volume: 0.3, loop: true });
    console.log('Title music started');

    // Title
    const title = this.add.text(width / 2, height / 3, 'DARKEST-LIKE', {
      fontSize: '64px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);

    // Subtitle
    const subtitle = this.add.text(width / 2, height / 3 + 70, 'Co-op Dungeon Crawler', {
      fontSize: '24px',
      color: '#aaaaaa',
      fontFamily: 'Arial, sans-serif',
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

