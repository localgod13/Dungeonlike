import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { preloadSounds } from '../game/sound';
import { preloadCharacterSprites } from '../game/characterSprites';
import { preloadEnemySprites } from '../game/enemySprites';
import { setupCustomCursor } from '../utils/cursor';

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
    this.load.image(
      'lobby_sign',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/lobby%20sign.png'
    );
    this.load.image(
      'rpg_cursor',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/rpgcursor.png'
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
      'bossbg',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/minotaurbg.png'
    );
    this.load.image(
      'cardselectbg',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/cardselectbg.png'
    );
    // World 2 backgrounds
    this.load.image(
      'world2bg',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/world2.png'
    );
    this.load.image(
      'bossbg2',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/bosslevel2.png'
    );
    this.load.image(
      'map_bg',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/map1bg.png'
    );
    this.load.image(
      'merchant',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/merchant.png'
    );
    this.load.image(
      'event',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/event.png'
    );
    this.load.image(
      'merchantbg',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/background/merchantbg2.png'
    );
    this.load.image(
      'items',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/items.png'
    );
    this.load.image(
      'victory',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/victory.png'
    );
    this.load.image(
      'titlename',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/titlename.png'
    );
    this.load.image(
      'pb',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/pb.png'
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
    // For neutral cards, we'll use a grayscale version of defense for now
    // TODO: Create a proper neutral card image asset
    this.load.image(
      'card_neutral',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/defense.png'
    );
    
    // Load consumable items card image using the items sprite sheet
    this.load.image(
      'card_consumable',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/items.png'
    );

    // Load custom lock button image
    this.load.image(
      'lock_button',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/button2.png'
    );
    
    // Load lobby button images
    this.load.image(
      'createlobby_btn',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/createlobby.png'
    );
    this.load.image(
      'joinlobby_btn',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/join.png'
    );
    this.load.image(
      'ready_btn',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/ready.png'
    );
    this.load.image(
      'leave_btn',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/leave.png'
    );
    this.load.image(
      'chooseclass_btn',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/chooseclass.png'
    );
    this.load.image(
      'waiting_btn',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/waiting.png'
    );
    this.load.image(
      'lobbyplate',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/lobbyplates.png'
    );
    this.load.image(
      'startadventure_btn',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/startadventure.png'
    );
    this.load.image(
      'copycode_btn',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/copycode.png'
    );
    
    // Load card back image for draw/discard piles
    this.load.image(
      'cardback',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/cardback.png'
    );
    
    // Load character plate image for bottom left HUD
    this.load.image(
      'charplate',
      'https://cdn.jsdelivr.net/gh/localgod13/Dungeonlike@main/assets/images/charplate.png'
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

    // Note: Intro video is loaded dynamically in IntroScene using HTML5 video element
    // This is intentional to allow the video to preload while the intro is showing
  }

  create(): void {
    console.log('Preload scene complete');
    
    // Set up custom cursor
    setupCustomCursor(this);

    // Check if player has seen intro before
    const hasSeenIntro = localStorage.getItem('hasSeenIntro') === 'true';
    
    if (!hasSeenIntro) {
      // First time player - show intro video
      console.log('First time player - showing intro video');
      this.scene.start('IntroScene');
    } else {
      // Returning player - skip to main menu
      console.log('Returning player - skipping intro video');
      this.scene.start('MainMenu');
    }
  }
}

