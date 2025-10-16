import Phaser from 'phaser';
import { COLORS } from '../game/config';

/**
 * Preload scene - asset loading with progress bar
 */
export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Create loading bar
    const progressBar = this.add.rectangle(
      width / 2,
      height / 2,
      400,
      30,
      COLORS.UI_ACCENT,
      0.8
    );
    const progressBox = this.add.rectangle(width / 2, height / 2, 400, 30);
    progressBox.setStrokeStyle(2, 0xffffff, 0.8);

    const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    loadingText.setOrigin(0.5);

    const percentText = this.add.text(width / 2, height / 2, '0%', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    percentText.setOrigin(0.5);

    // Update progress bar
    this.load.on('progress', (value: number) => {
      progressBar.width = 400 * value;
      percentText.setText(`${Math.floor(value * 100)}%`);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
    });

    // Load assets here (placeholder for now)
    // this.load.image('key', 'path/to/image.png');
  }

  create(): void {
    console.log('Preload scene complete');

    // Move to main menu
    this.scene.start('MainMenu');
  }
}

