import Phaser from 'phaser';
import { Grid } from '../game/grid';
import { Vessel } from '../game/vessel';
import { TurnManager, TurnPhase } from '../game/turn';
import { HUD } from '../ui/hud';
import { VoteUI } from '../ui/voteUi';
import { initRNG, generateRunSeed } from '../game/rng';
import { GAME_CONFIG } from '../game/config';

/**
 * Main gameplay scene - the dungeon run
 */
export class Run extends Phaser.Scene {
  private grid!: Grid;
  private vessel!: Vessel;
  private turnManager!: TurnManager;
  private hud!: HUD;
  private voteUi!: VoteUI;

  constructor() {
    super('Run');
  }

  init(data: { seed?: number }): void {
    const seed = data.seed || generateRunSeed();
    console.log(`Initializing run with seed: ${seed}`);

    // Initialize RNG
    initRNG(seed);

    // Initialize turn manager
    this.turnManager = new TurnManager(seed);

    // Subscribe to turn state changes
    this.turnManager.subscribe((state) => {
      console.log(`Turn state: ${state.phase}, Round: ${state.round}`);
      this.hud?.updateTurnState(state);

      // Show/hide vote UI based on phase
      if (state.phase === TurnPhase.Planning) {
        this.voteUi?.setVisible(true);
      } else {
        this.voteUi?.setVisible(false);
      }
    });
  }

  create(): void {
    console.log('Run scene started');

    // Create grid
    this.grid = new Grid(this);
    this.grid.render();

    // Create vessel at center
    const startPos = {
      x: Math.floor(GAME_CONFIG.ROOM_WIDTH / 2),
      y: Math.floor(GAME_CONFIG.ROOM_HEIGHT / 2),
    };
    this.vessel = new Vessel(this, this.grid, startPos);

    // Setup camera
    this.cameras.main.setZoom(GAME_CONFIG.ZOOM);
    this.grid.centerCameraOn(this.cameras.main);

    // Create UI
    this.hud = new HUD(this);
    this.voteUi = new VoteUI(this);

    // Update HUD with initial state
    this.hud.updateTurnState(this.turnManager.getState());

    // Setup input
    this.setupInput();

    // Start first turn after a brief delay
    this.time.delayedCall(1000, () => {
      this.startPlanningPhase();
    });
  }

  private setupInput(): void {
    // Click to plan movement
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.turnManager.getState().phase !== TurnPhase.Planning) {
        return;
      }

      // Convert screen to world coordinates
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gridPos = this.grid.worldToGrid(worldPoint.x, worldPoint.y);

      // Check if walkable
      if (this.grid.isWalkable(gridPos.x, gridPos.y)) {
        console.log(`Planned move to (${gridPos.x}, ${gridPos.y})`);
        this.vessel.setPlannedMove(gridPos);
      }
    });

    // Spacebar to start planning
    this.input.keyboard?.on('keydown-SPACE', () => {
      const state = this.turnManager.getState();
      if (state.phase === TurnPhase.Idle) {
        this.startPlanningPhase();
      } else if (state.phase === TurnPhase.Planning) {
        this.resolvePhase();
      }
    });

    // ESC to go back to menu
    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.start('MainMenu');
    });
  }

  private startPlanningPhase(): void {
    console.log('Starting planning phase');
    this.turnManager.startPlanning();
  }

  private resolvePhase(): void {
    console.log('Resolving turn...');
    this.turnManager.startResolving();

    // Execute planned moves
    const plannedMove = this.vessel.getPlannedMove();
    if (plannedMove) {
      this.vessel.moveTo(plannedMove, true);
      this.vessel.clearPlannedMove();
    }

    // After a delay, return to idle
    this.time.delayedCall(500, () => {
      this.turnManager.endTurn();
      console.log('Turn complete - press SPACE for next turn');
    });
  }

  shutdown(): void {
    this.hud?.destroy();
    this.voteUi?.destroy();
    this.vessel?.destroy();
  }
}




















