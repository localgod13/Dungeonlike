import Phaser from 'phaser';

export const GAME_CONFIG = {
  GRID_SIZE: 32, // Tile size in pixels
  ROOM_WIDTH: 20, // Grid tiles
  ROOM_HEIGHT: 15, // Grid tiles
  VIEWPORT_WIDTH: 1280,
  VIEWPORT_HEIGHT: 720,
  ZOOM: 1.5,
  FPS: 60,
};

export const COLORS = {
  FLOOR: 0x2a2a2a,
  WALL: 0x1a1a1a,
  VESSEL: 0x4a90e2,
  VESSEL_HIGHLIGHT: 0x7fc8f8,
  GRID_LINE: 0x3a3a3a,
  UI_BG: 0x1e1e1e,
  UI_TEXT: 0xffffff,
  UI_ACCENT: 0x4a90e2,
};

export function createPhaserConfig(parent: string): Phaser.Types.Core.GameConfig {
  const dpr = window.devicePixelRatio || 1;

  return {
    type: Phaser.WEBGL,
    parent,
    width: GAME_CONFIG.VIEWPORT_WIDTH,
    height: GAME_CONFIG.VIEWPORT_HEIGHT,
    backgroundColor: '#000000',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_CONFIG.VIEWPORT_WIDTH,
      height: GAME_CONFIG.VIEWPORT_HEIGHT,
    },
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true,
    },
    fps: {
      target: GAME_CONFIG.FPS,
      forceSetTimeOut: true,
    },
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
      },
    },
  };
}






















