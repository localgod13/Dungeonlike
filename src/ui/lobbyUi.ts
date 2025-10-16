import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { LobbyState } from '../net/proto';

/**
 * Lobby UI - player list, ready states, start button
 */
export class LobbyUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private titleText: Phaser.GameObjects.Text;
  private playerListText: Phaser.GameObjects.Text;
  private readyButton: Phaser.GameObjects.Container;
  private startButton: Phaser.GameObjects.Container;
  private isReady = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    this.container = scene.add.container(0, 0);

    // Title (with shadow for visibility over background)
    this.titleText = scene.add.text(centerX, 100, 'Lobby', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    });
    this.titleText.setOrigin(0.5);

    // Player list (with shadow for visibility)
    this.playerListText = scene.add.text(centerX, 200, 'Players:\n', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.playerListText.setOrigin(0.5, 0);

    // Ready button
    this.readyButton = this.createButton(centerX - 120, centerY + 150, 200, 50, 'Ready', () => {
      this.toggleReady();
    });

    // Start button (host only)
    this.startButton = this.createButton(centerX + 120, centerY + 150, 200, 50, 'Start Game', () => {
      this.onStartGame();
    });

    this.container.add([
      this.titleText,
      this.playerListText,
      this.readyButton,
      this.startButton,
    ]);
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.rectangle(0, 0, width, height, COLORS.UI_ACCENT, 1);
    bg.setStrokeStyle(2, 0xffffff, 0.8);
    bg.setInteractive({ useHandCursor: true });

    const label = this.scene.add.text(0, 0, text, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 0.8);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 1);
    });

    bg.on('pointerdown', callback);

    container.add([bg, label]);
    return container;
  }

  updateLobbyState(state: LobbyState): void {
    // Update player list
    let playerListStr = 'Players:\n\n';
    state.players.forEach((player) => {
      const hostTag = player.isHost ? ' [Host]' : '';
      const readyTag = player.isReady ? ' ✓' : '';
      const role = player.role ? ` - ${player.role}` : '';
      playerListStr += `${player.name}${role}${hostTag}${readyTag}\n`;
    });
    playerListStr += `\n${state.players.length}/${state.maxPlayers}`;
    this.playerListText.setText(playerListStr);

    // Show/hide start button based on host status
    const localPlayer = state.players.find((p) => p.id === 'local'); // TODO: use actual player ID
    this.startButton.setVisible(localPlayer?.isHost || false);
  }

  private toggleReady(): void {
    this.isReady = !this.isReady;
    console.log(`Ready state: ${this.isReady}`);
    // TODO: Send ready state to server
  }

  private onStartGame(): void {
    console.log('Starting game...');
    // Scene will handle starting the game
    this.scene.scene.start('Run');
  }

  destroy(): void {
    this.container.destroy();
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }
}






