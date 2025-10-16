import Phaser from 'phaser';
import { Card, getCardById } from '../game/cards';

/**
 * In-battle hand UI - displays player's 4-card loadout
 * Cards are enabled/disabled based on AP availability
 */

const CARD_WIDTH = 120;
const CARD_HEIGHT = 160;
const CARD_SPACING = 15;

export class HandUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private cardContainers: Map<string, Phaser.GameObjects.Container> = new Map();
  private currentAP = 0;
  private onCardSelect?: (cardId: string) => void;
  private selectedCardId: string | null = null;

  constructor(
    scene: Phaser.Scene,
    cards: string[],
    onCardSelect?: (cardId: string) => void
  ) {
    this.scene = scene;
    this.onCardSelect = onCardSelect;
    
    this.container = scene.add.container(0, 0);
    this.createHand(cards);
  }

  private createHand(cardIds: string[]): void {
    const centerX = this.scene.scale.width / 2;
    const y = this.scene.scale.height - CARD_HEIGHT / 2 - 20;
    
    // Calculate starting X to center the hand
    const totalWidth = cardIds.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
    const startX = centerX - totalWidth / 2;

    cardIds.forEach((cardId, index) => {
      const card = getCardById(cardId);
      if (!card) return;

      const x = startX + index * (CARD_WIDTH + CARD_SPACING) + CARD_WIDTH / 2;
      const cardContainer = this.createCardDisplay(card, x, y);
      this.container.add(cardContainer);
      this.cardContainers.set(cardId, cardContainer);
    });

    this.updateCardStates();
  }

  private createCardDisplay(card: Card, x: number, y: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setData('cardId', card.id);
    container.setData('apCost', card.ap);

    // Background
    const bg = this.scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x2a2a2a, 1);
    bg.setStrokeStyle(2, 0x666666);
    bg.setName('bg');
    container.add(bg);

    // Disabled overlay (initially hidden)
    const disabledOverlay = this.scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0.7);
    disabledOverlay.setName('disabledOverlay');
    disabledOverlay.setVisible(false);
    container.add(disabledOverlay);

    // Card name
    const nameText = this.scene.add.text(0, -CARD_HEIGHT / 2 + 25, card.name, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      align: 'center',
    });
    nameText.setOrigin(0.5);
    nameText.setName('nameText');
    container.add(nameText);

    // AP cost badge
    const apBadge = this.scene.add.container(-CARD_WIDTH / 2 + 25, -CARD_HEIGHT / 2 + 20);
    apBadge.setName('apBadge');
    
    const apBg = this.scene.add.rectangle(0, 0, 35, 25, 0x4a4a4a);
    apBg.setStrokeStyle(1, 0x888888);
    apBadge.add(apBg);

    const apText = this.scene.add.text(0, 0, `${card.ap}`, {
      fontSize: '14px',
      color: '#ffaa00',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    apText.setOrigin(0.5);
    apBadge.add(apText);
    
    container.add(apBadge);

    // Description
    const descText = this.scene.add.text(0, 5, card.desc, {
      fontSize: '12px',
      color: '#cccccc',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 15 },
    });
    descText.setOrigin(0.5);
    descText.setName('descText');
    container.add(descText);

    // Target info
    const targetText = this.scene.add.text(0, CARD_HEIGHT / 2 - 25, `Target: ${card.target}`, {
      fontSize: '10px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
    });
    targetText.setOrigin(0.5);
    targetText.setName('targetText');
    container.add(targetText);

    // Make interactive
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (this.canAffordCard(card.id)) {
        bg.setStrokeStyle(3, 0xffffff);
      }
    });
    bg.on('pointerout', () => {
      const isSelected = this.selectedCardId === card.id;
      if (isSelected) {
        bg.setStrokeStyle(3, 0x44ff44);
      } else {
        bg.setStrokeStyle(2, 0x666666);
      }
    });
    bg.on('pointerdown', () => {
      if (this.canAffordCard(card.id)) {
        this.selectCard(card.id);
      } else {
        this.flashNotEnoughAP();
      }
    });

    return container;
  }

  private canAffordCard(cardId: string): boolean {
    const card = getCardById(cardId);
    if (!card) return false;
    return this.currentAP >= card.ap;
  }

  private selectCard(cardId: string): void {
    console.log(`Selected card: ${cardId}`);

    // Deselect previous
    if (this.selectedCardId) {
      const prevContainer = this.cardContainers.get(this.selectedCardId);
      if (prevContainer) {
        const bg = prevContainer.getByName('bg') as Phaser.GameObjects.Rectangle;
        bg.setStrokeStyle(2, 0x666666);
      }
    }

    // Select new
    this.selectedCardId = cardId;
    const container = this.cardContainers.get(cardId);
    if (container) {
      const bg = container.getByName('bg') as Phaser.GameObjects.Rectangle;
      bg.setStrokeStyle(3, 0x44ff44);
    }

    // Notify callback
    if (this.onCardSelect) {
      this.onCardSelect(cardId);
    }
  }

  private flashNotEnoughAP(): void {
    // Flash a "Not enough AP" message
    const centerX = this.scene.scale.width / 2;
    const y = this.scene.scale.height - CARD_HEIGHT - 80;

    const text = this.scene.add.text(centerX, y, 'Not enough AP!', {
      fontSize: '20px',
      color: '#ff4444',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 },
    });
    text.setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        text.destroy();
      },
    });
  }

  private updateCardStates(): void {
    this.cardContainers.forEach((container, cardId) => {
      const card = getCardById(cardId);
      if (!card) return;

      const canAfford = this.canAffordCard(cardId);
      const disabledOverlay = container.getByName('disabledOverlay') as Phaser.GameObjects.Rectangle;
      const bg = container.getByName('bg') as Phaser.GameObjects.Rectangle;
      const nameText = container.getByName('nameText') as Phaser.GameObjects.Text;
      const descText = container.getByName('descText') as Phaser.GameObjects.Text;

      if (canAfford) {
        disabledOverlay.setVisible(false);
        bg.setInteractive({ useHandCursor: true });
        nameText.setAlpha(1);
        descText.setAlpha(1);
      } else {
        disabledOverlay.setVisible(true);
        bg.disableInteractive();
        nameText.setAlpha(0.5);
        descText.setAlpha(0.5);
        
        // Deselect if this was selected
        if (this.selectedCardId === cardId) {
          this.selectedCardId = null;
          bg.setStrokeStyle(2, 0x666666);
        }
      }
    });
  }

  public setAP(ap: number): void {
    this.currentAP = ap;
    this.updateCardStates();
  }

  public getSelectedCard(): string | null {
    return this.selectedCardId;
  }

  public clearSelection(): void {
    if (this.selectedCardId) {
      const container = this.cardContainers.get(this.selectedCardId);
      if (container) {
        const bg = container.getByName('bg') as Phaser.GameObjects.Rectangle;
        bg.setStrokeStyle(2, 0x666666);
      }
      this.selectedCardId = null;
    }
  }

  public destroy(): void {
    this.container.destroy();
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }
}

