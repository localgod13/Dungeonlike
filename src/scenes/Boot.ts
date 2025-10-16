import Phaser from 'phaser';

/**
 * Boot scene - initial setup and configuration
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Set up loading path
    this.load.setPath('assets');
  }

  create(): void {
    console.log('Boot scene initialized');

    // Configure input
    this.input.mouse?.disableContextMenu();

    // Move to preload
    this.scene.start('Preload');
  }
}






