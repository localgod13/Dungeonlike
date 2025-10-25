import Phaser from 'phaser';
import { createPhaserConfig } from './game/config';
import { Boot } from './scenes/Boot';
import { IntroScene } from './scenes/IntroScene';
import { Preload } from './scenes/Preload';
import { MainMenu } from './scenes/MainMenu';
import { Lobby } from './scenes/Lobby';
import { Run } from './scenes/Run';
import { CardSelectScene } from './scenes/CardSelectScene';
import { BattleScene } from './scenes/BattleScene';
import { MapScene } from './scenes/MapScene';
import { LootScene } from './scenes/LootScene';
import { ShopScene } from './scenes/ShopScene';
import { EventScene } from './scenes/EventScene';

/**
 * Main entry point - initialize Phaser game
 */

// Create game configuration
const config = createPhaserConfig('game-container');

// Add scenes
config.scene = [Boot, IntroScene, Preload, MainMenu, Lobby, Run, CardSelectScene, BattleScene, LootScene, MapScene, ShopScene, EventScene];

// Initialize game
const game = new Phaser.Game(config);

// Log initialization
console.log('🎮 Darkest Light initialized');
console.log(`Phaser v${Phaser.VERSION}`);
console.log(`Viewport: ${config.width}x${config.height}`);

// Expose game instance for debugging
if (import.meta.env.DEV) {
  (window as any).game = game;
  console.log('Debug mode: game instance available as window.game');
}

// Handle visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.sound.pauseAll();
  } else {
    game.sound.resumeAll();
  }
});

// Export game instance
export default game;

