import Phaser from 'phaser';
import { GAME_CONFIG, COLORS } from './config';
import { GridPosition, Grid } from './grid';

/**
 * The Vessel - the shared pawn controlled by all players
 */
export class Vessel {
  private scene: Phaser.Scene;
  private grid: Grid;
  private sprite: Phaser.GameObjects.Arc;
  private highlight: Phaser.GameObjects.Arc;
  private container: Phaser.GameObjects.Container;
  private gridPosition: GridPosition;
  private plannedPosition: GridPosition | null;

  constructor(scene: Phaser.Scene, grid: Grid, startPos: GridPosition) {
    this.scene = scene;
    this.grid = grid;
    this.gridPosition = { ...startPos };
    this.plannedPosition = null;

    this.container = scene.add.container(0, 0);

    // Highlight ring (for planned movement)
    this.highlight = scene.add.circle(
      0,
      0,
      GAME_CONFIG.GRID_SIZE * 0.45,
      COLORS.VESSEL_HIGHLIGHT,
      0.3
    );
    this.highlight.setStrokeStyle(2, COLORS.VESSEL_HIGHLIGHT, 0.8);
    this.highlight.setVisible(false);

    // Main vessel sprite
    this.sprite = scene.add.circle(0, 0, GAME_CONFIG.GRID_SIZE * 0.35, COLORS.VESSEL, 1);
    this.sprite.setStrokeStyle(2, 0xffffff, 0.8);

    this.container.add([this.highlight, this.sprite]);

    this.updateWorldPosition();
  }

  private updateWorldPosition(): void {
    const worldPos = this.grid.gridToWorld(this.gridPosition);
    this.container.setPosition(worldPos.x, worldPos.y);
  }

  getGridPosition(): GridPosition {
    return { ...this.gridPosition };
  }

  setGridPosition(pos: GridPosition): void {
    if (this.grid.isWalkable(pos.x, pos.y)) {
      this.gridPosition = { ...pos };
      this.updateWorldPosition();
    }
  }

  moveTo(pos: GridPosition, animated = false): void {
    if (!this.grid.isWalkable(pos.x, pos.y)) {
      return;
    }

    if (animated) {
      const worldPos = this.grid.gridToWorld(pos);
      this.scene.tweens.add({
        targets: this.container,
        x: worldPos.x,
        y: worldPos.y,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          this.gridPosition = { ...pos };
        },
      });
    } else {
      this.gridPosition = { ...pos };
      this.updateWorldPosition();
    }
  }

  setPlannedMove(pos: GridPosition | null): void {
    this.plannedPosition = pos ? { ...pos } : null;

    if (this.plannedPosition && this.grid.isWalkable(this.plannedPosition.x, this.plannedPosition.y)) {
      const worldPos = this.grid.gridToWorld(this.plannedPosition);
      this.highlight.setPosition(worldPos.x - this.container.x, worldPos.y - this.container.y);
      this.highlight.setVisible(true);
    } else {
      this.highlight.setVisible(false);
    }
  }

  getPlannedMove(): GridPosition | null {
    return this.plannedPosition ? { ...this.plannedPosition } : null;
  }

  clearPlannedMove(): void {
    this.plannedPosition = null;
    this.highlight.setVisible(false);
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    this.container.destroy();
  }
}





















