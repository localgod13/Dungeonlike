import Phaser from 'phaser';
import { setupCustomCursor } from '../utils/cursor';

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
    
    // Load custom cursor
    this.load.image(
      'rpg_cursor',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/rpgcursor.png'
    );
  }

  create(): void {
    console.log('Boot scene initialized');

    // Configure input
    this.input.mouse?.disableContextMenu();

    // Set up custom cursor
    setupCustomCursor(this);

    // Move to preload scene first to load all assets
    this.scene.start('Preload');
  }
}






