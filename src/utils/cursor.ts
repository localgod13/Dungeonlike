import Phaser from 'phaser';

/**
 * Utility for managing custom cursor across scenes
 */

let globalCustomCursor: Phaser.GameObjects.Image | null = null;
let cursorOffsetX = 10;
let cursorOffsetY = 15;

/**
 * Setup custom cursor in a scene
 */
export function setupCustomCursor(scene: Phaser.Scene, onPointerMove?: (pointer: Phaser.Input.Pointer) => void): void {
  // Hide the default cursor
  scene.input.setDefaultCursor('none');
  
  // Prevent hand cursor from appearing on interactive elements globally
  const style = document.createElement('style');
  style.textContent = '* { cursor: none !important; }';
  document.head.appendChild(style);
  
  // Create custom cursor sprite
  globalCustomCursor = scene.add.image(0, 0, 'rpg_cursor');
  globalCustomCursor.setScale(0.08); // Scale down from 500x500 to 40x40
  globalCustomCursor.setDepth(10000); // Always on top
  globalCustomCursor.setOrigin(0.5);
  
  // Update cursor position on mouse move
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (globalCustomCursor) {
      globalCustomCursor.setPosition(pointer.x + cursorOffsetX, pointer.y + cursorOffsetY);
    }
    
    // Call optional callback for additional handling (e.g., multiplayer cursor sync)
    if (onPointerMove) {
      onPointerMove(pointer);
    }
  });
  
  // Ensure cursor is destroyed when scene shuts down
  scene.events.on('shutdown', () => {
    cleanupCustomCursor();
  });
}

/**
 * Clean up cursor when scene is destroyed
 */
export function cleanupCustomCursor(): void {
  if (globalCustomCursor) {
    globalCustomCursor.destroy();
    globalCustomCursor = null;
  }
}

