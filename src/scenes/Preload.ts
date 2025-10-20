import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { preloadSounds } from '../game/sound';
import { preloadCharacterSprites } from '../game/characterSprites';
import { preloadEnemySprites } from '../game/enemySprites';

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

    // Add error handler for failed loads
    this.load.on('loaderror', (file: any) => {
      console.error(`[Preload] Failed to load file: ${file.key}`, file);
      console.error(`[Preload] File URL: ${file.url}`);
    });

    // Load sound assets
    console.log('[Preload] Loading sound assets...');
    preloadSounds(this);
    console.log('[Preload] Sound assets queued for loading');
    
    // Load background images
    console.log('[Preload] Loading background images...');
    this.load.image(
      'mmbg',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/mmbg.png'
    );
    this.load.image(
      'lobbybg',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/lobby.png'
    );
    
    // Class selection icon images
    this.load.image(
      'class_warrior_icon',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@feature-branch/assets/images/sword2.png'
    );
    this.load.image(
      'class_wizard_icon',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@feature-branch/assets/images/staff.png'
    );
    this.load.image(
      'class_huntress_icon',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@feature-branch/assets/images/bow.png'
    );
    
    this.load.image(
      'battleground1',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/Battleground1.png'
    );
    this.load.image(
      'battleground2',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/Battleground2.png'
    );
    this.load.image(
      'cardselectbg',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/cardselectbg.png'
    );
    console.log('[Preload] Background images queued for loading');

    // Load card type images
    console.log('[Preload] Loading card images...');
    this.load.image(
      'card_attack',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/attack.png'
    );
    this.load.image(
      'card_defense',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/defense.png'
    );
    this.load.image(
      'card_magic',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/magic.png'
    );
    console.log('[Preload] Card images queued for loading');

    // Load character sprites
    console.log('[Preload] Loading character sprites...');
    preloadCharacterSprites(this);
    console.log('[Preload] Character sprites queued for loading');

    // Load enemy sprites
    console.log('[Preload] Loading enemy sprites...');
    preloadEnemySprites(this);
    console.log('[Preload] Enemy sprites queued for loading');
  }

  create(): void {
    console.log('Preload scene complete');

    // Move to main menu
    this.scene.start('MainMenu');
  }
}

