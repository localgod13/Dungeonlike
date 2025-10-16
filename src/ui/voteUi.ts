import Phaser from 'phaser';
import { COLORS } from '../game/config';

/**
 * Vote UI - displays action votes and lock status during Planning phase
 * Players can see who voted for what action and lock their votes
 */
export class VoteUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private voteText: Phaser.GameObjects.Text;
  private lockButton: Phaser.GameObjects.Container;
  private isLocked = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const width = 300;
    const height = 200;
    const x = scene.scale.width - width - 20;
    const y = 80;

    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);
    this.container.setDepth(999);

    // Background
    const bg = scene.add.rectangle(0, 0, width, height, COLORS.UI_BG, 0.9);
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, COLORS.UI_ACCENT, 0.5);

    // Title
    const title = scene.add.text(10, 10, 'Action Votes', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });

    // Vote list
    this.voteText = scene.add.text(10, 40, 'No votes yet', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'Arial, sans-serif',
    });

    // Lock button
    this.lockButton = this.createLockButton(width / 2, height - 30);

    this.container.add([bg, title, this.voteText, this.lockButton]);
    this.container.setVisible(false);
  }

  private createLockButton(x: number, y: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.rectangle(0, 0, 120, 35, COLORS.UI_ACCENT, 1);
    bg.setStrokeStyle(2, 0xffffff, 0.8);
    bg.setInteractive({ useHandCursor: true });

    const label = this.scene.add.text(0, 0, 'Lock Vote', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    label.setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 0.8);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 1);
    });

    bg.on('pointerdown', () => {
      this.toggleLock();
    });

    container.add([bg, label]);
    container.setData('bg', bg);
    container.setData('label', label);
    return container;
  }

  private toggleLock(): void {
    this.isLocked = !this.isLocked;
    const bg = this.lockButton.getData('bg') as Phaser.GameObjects.Rectangle;
    const label = this.lockButton.getData('label') as Phaser.GameObjects.Text;

    if (this.isLocked) {
      label.setText('🔒 Locked');
      bg.setFillStyle(0x27ae60, 1);
      console.log('Vote locked');
    } else {
      label.setText('Lock Vote');
      bg.setFillStyle(COLORS.UI_ACCENT, 1);
      console.log('Vote unlocked');
    }
  }

  updateVotes(votes: { playerName: string; action: string }[]): void {
    if (votes.length === 0) {
      this.voteText.setText('No votes yet');
      return;
    }

    let voteStr = '';
    votes.forEach((vote) => {
      voteStr += `${vote.playerName}: ${vote.action}\n`;
    });
    this.voteText.setText(voteStr);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
    if (!visible) {
      this.isLocked = false;
      const bg = this.lockButton.getData('bg') as Phaser.GameObjects.Rectangle;
      const label = this.lockButton.getData('label') as Phaser.GameObjects.Text;
      label.setText('Lock Vote');
      bg.setFillStyle(COLORS.UI_ACCENT, 1);
    }
  }

  destroy(): void {
    this.container.destroy();
  }

  isVoteLocked(): boolean {
    return this.isLocked;
  }
}






