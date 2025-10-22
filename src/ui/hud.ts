import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { TurnState, TurnPhase } from '../game/turn';

/**
 * In-game HUD displaying turn phase, round number, and seed
 */
export class HUD {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private background: Phaser.GameObjects.Rectangle;
  private phaseText: Phaser.GameObjects.Text;
  private roundText: Phaser.GameObjects.Text;
  private seedText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Create container
    this.container = scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(1000);

    // Background bar
    this.background = scene.add.rectangle(0, 0, scene.scale.width, 60, COLORS.UI_BG, 0.9);
    this.background.setOrigin(0, 0);

    // Phase text
    this.phaseText = scene.add.text(20, 15, 'Phase: Idle', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });

    // Round text
    this.roundText = scene.add.text(250, 15, 'Round: 1', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });

    // Seed text
    this.seedText = scene.add.text(400, 15, 'Seed: 0', {
      fontSize: '16px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    });

    this.container.add([this.background, this.phaseText, this.roundText, this.seedText]);

    // Listen for resize
    scene.scale.on('resize', this.handleResize, this);
  }

  updateTurnState(state: TurnState): void {
    // Update phase text with color coding
    let phaseColor = '#ffffff';
    switch (state.phase) {
      case TurnPhase.Planning:
        phaseColor = '#4a90e2';
        break;
      case TurnPhase.Resolving:
        phaseColor = '#f5a623';
        break;
      case TurnPhase.EnemyTurn:
        phaseColor = '#e74c3c';
        break;
      default:
        phaseColor = '#95a5a6';
    }

    this.phaseText.setText(`Phase: ${state.phase}`);
    this.phaseText.setColor(phaseColor);

    this.roundText.setText(`Round: ${state.round}`);
    this.seedText.setText(`Seed: ${state.seed.toString(16).toUpperCase()}`);
  }

  private handleResize(): void {
    this.background.setSize(this.scene.scale.width, 60);
  }

  destroy(): void {
    this.scene.scale.off('resize', this.handleResize, this);
    this.container.destroy();
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }
}






















