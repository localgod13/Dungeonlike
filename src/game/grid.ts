import Phaser from 'phaser';
import { GAME_CONFIG, COLORS } from './config';

export interface GridPosition {
  x: number;
  y: number;
}

export enum TileType {
  Floor = 'floor',
  Wall = 'wall',
  Empty = 'empty',
}

export interface Tile {
  type: TileType;
  x: number;
  y: number;
}

export class Grid {
  private scene: Phaser.Scene;
  private tiles: Tile[][];
  private graphics: Phaser.GameObjects.Graphics;
  private container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.graphics = scene.add.graphics();
    this.container.add(this.graphics);
    this.tiles = [];

    this.initializeGrid();
  }

  private initializeGrid(): void {
    // Create a simple room layout
    for (let y = 0; y < GAME_CONFIG.ROOM_HEIGHT; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < GAME_CONFIG.ROOM_WIDTH; x++) {
        // Walls on border, floor inside
        const isWall =
          x === 0 ||
          y === 0 ||
          x === GAME_CONFIG.ROOM_WIDTH - 1 ||
          y === GAME_CONFIG.ROOM_HEIGHT - 1;

        this.tiles[y][x] = {
          type: isWall ? TileType.Wall : TileType.Floor,
          x,
          y,
        };
      }
    }
  }

  render(): void {
    this.graphics.clear();

    // Draw tiles
    for (let y = 0; y < GAME_CONFIG.ROOM_HEIGHT; y++) {
      for (let x = 0; x < GAME_CONFIG.ROOM_WIDTH; x++) {
        const tile = this.tiles[y][x];
        const px = x * GAME_CONFIG.GRID_SIZE;
        const py = y * GAME_CONFIG.GRID_SIZE;

        // Fill tile
        if (tile.type === TileType.Wall) {
          this.graphics.fillStyle(COLORS.WALL, 1);
        } else {
          this.graphics.fillStyle(COLORS.FLOOR, 1);
        }
        this.graphics.fillRect(px, py, GAME_CONFIG.GRID_SIZE, GAME_CONFIG.GRID_SIZE);

        // Grid lines
        this.graphics.lineStyle(1, COLORS.GRID_LINE, 0.3);
        this.graphics.strokeRect(px, py, GAME_CONFIG.GRID_SIZE, GAME_CONFIG.GRID_SIZE);
      }
    }
  }

  getTile(x: number, y: number): Tile | null {
    if (y >= 0 && y < this.tiles.length && x >= 0 && x < this.tiles[y].length) {
      return this.tiles[y][x];
    }
    return null;
  }

  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile !== null && tile.type === TileType.Floor;
  }

  gridToWorld(gridPos: GridPosition): { x: number; y: number } {
    return {
      x: gridPos.x * GAME_CONFIG.GRID_SIZE + GAME_CONFIG.GRID_SIZE / 2,
      y: gridPos.y * GAME_CONFIG.GRID_SIZE + GAME_CONFIG.GRID_SIZE / 2,
    };
  }

  worldToGrid(worldX: number, worldY: number): GridPosition {
    return {
      x: Math.floor(worldX / GAME_CONFIG.GRID_SIZE),
      y: Math.floor(worldY / GAME_CONFIG.GRID_SIZE),
    };
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  centerCameraOn(camera: Phaser.Cameras.Scene2D.Camera): void {
    const centerX = (GAME_CONFIG.ROOM_WIDTH * GAME_CONFIG.GRID_SIZE) / 2;
    const centerY = (GAME_CONFIG.ROOM_HEIGHT * GAME_CONFIG.GRID_SIZE) / 2;
    camera.centerOn(centerX, centerY);
  }
}

















