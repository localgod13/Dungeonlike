import Phaser from 'phaser';
import { Card, getCardById } from '../game/cards';

/**
 * In-battle hand UI - displays player's 4-card loadout
 * Cards are enabled/disabled based on AP availability
 */

const CARD_WIDTH = 120;
const CARD_HEIGHT = 180; // Changed from 160 to match 2:3 aspect ratio of card images (1024x1536)
const CARD_SPACING = 15;

export class HandUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private cardContainers: Map<string, Phaser.GameObjects.Container> = new Map();
  private currentAP = 0;
  private onCardSelect?: (cardId: string) => void;
  private selectedCardId: string | null = null;
  private ultimateCardId: string | null = null; // Track if ultimate is in hand

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

    // Card background image based on type
    const imageKey = `card_${card.type}`;
    const cardImage = this.scene.add.image(0, 0, imageKey);
    cardImage.setDisplaySize(CARD_WIDTH, CARD_HEIGHT);
    cardImage.setName('cardImage');
    
    // Apply gray tint to neutral cards for visual distinction
    if (card.type === 'neutral') {
      cardImage.setTint(0x888888); // Gray tint for neutral items
    }
    
    container.add(cardImage);

    // Border frame (for hover/selection effects)
    const bg = this.scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0);
    bg.setStrokeStyle(3, 0x444444, 0.8);
    bg.setName('bg');
    container.add(bg);

    // Disabled overlay (initially hidden)
    const disabledOverlay = this.scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0.75);
    disabledOverlay.setName('disabledOverlay');
    disabledOverlay.setVisible(false);
    disabledOverlay.setDepth(10);
    container.add(disabledOverlay);

    // Card name (with shadow for better visibility over image)
    const nameText = this.scene.add.text(0, -CARD_HEIGHT / 2 + 30, card.name, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 4,
    });
    nameText.setOrigin(0.5);
    nameText.setName('nameText');
    nameText.setDepth(20);
    container.add(nameText);

    // AP cost badge (smaller)
    const apBadge = this.scene.add.container(-CARD_WIDTH / 2 + 24, -CARD_HEIGHT / 2 + 22);
    apBadge.setName('apBadge');
    apBadge.setDepth(20);
    
    const apBg = this.scene.add.circle(0, 0, 14, 0x000000, 0.9);
    apBg.setStrokeStyle(2, 0xffaa00, 1);
    apBadge.add(apBg);

    const apText = this.scene.add.text(0, 0, `${card.ap}`, {
      fontSize: '16px',
      color: '#ffaa00',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    apText.setOrigin(0.5);
    apBadge.add(apText);
    
    container.add(apBadge);

    // Description (no background box - just text with shadow)
    const descText = this.scene.add.text(0, 10, card.desc, {
      fontSize: '13px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 20 },
      stroke: '#000000',
      strokeThickness: 3,
    });
    descText.setOrigin(0.5);
    descText.setName('descText');
    descText.setDepth(20);
    container.add(descText);

    // Target info (no background - just text with shadow)
    const targetText = this.scene.add.text(0, CARD_HEIGHT / 2 - 30, `Target: ${card.target}`, {
      fontSize: '11px',
      color: '#cccccc',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
    });
    targetText.setOrigin(0.5);
    targetText.setName('targetText');
    targetText.setDepth(20);
    container.add(targetText);

    // Make interactive
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (this.canAffordCard(card.id)) {
        bg.setStrokeStyle(4, 0xffffff, 1);
        // Slight glow effect
        container.setScale(1.05);
      }
    });
    bg.on('pointerout', () => {
      const isSelected = this.selectedCardId === card.id;
      if (isSelected) {
        bg.setStrokeStyle(4, 0x44ff44, 1);
      } else {
        bg.setStrokeStyle(3, 0x444444, 0.8);
      }
      container.setScale(1);
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
        bg.setStrokeStyle(3, 0x444444, 0.8);
      }
    }

    // Select new
    this.selectedCardId = cardId;
    const container = this.cardContainers.get(cardId);
    if (container) {
      const bg = container.getByName('bg') as Phaser.GameObjects.Rectangle;
      bg.setStrokeStyle(4, 0x44ff44, 1);
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
          bg.setStrokeStyle(3, 0x444444, 0.8);
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
        bg.setStrokeStyle(3, 0x444444, 0.8);
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

  /**
   * Add an ultimate card to the hand (displayed as rightmost card with glow)
   */
  public addUltimateCard(ultimateCardId: string): void {
    // Don't add if already present
    if (this.ultimateCardId === ultimateCardId) {
      console.log(`Ultimate card ${ultimateCardId} already in hand`);
      return;
    }

    const card = getCardById(ultimateCardId);
    if (!card) {
      console.error(`Ultimate card not found: ${ultimateCardId}`);
      return;
    }

    this.ultimateCardId = ultimateCardId;

    // Position ultimate card to the right of existing cards
    const centerX = this.scene.scale.width / 2;
    const y = this.scene.scale.height - CARD_HEIGHT / 2 - 20;
    
    // Calculate position for ultimate card (rightmost)
    const existingCardsCount = this.cardContainers.size;
    const totalWidth = existingCardsCount * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
    const x = centerX + totalWidth / 2 + CARD_SPACING + CARD_WIDTH / 2 + 30; // Extra spacing

    const cardContainer = this.createCardDisplay(card, x, y);
    
    // Add glowing effect to ultimate card
    this.addGlowEffect(cardContainer);
    
    this.container.add(cardContainer);
    this.cardContainers.set(ultimateCardId, cardContainer);

    console.log(`✨ Added ULTIMATE card to hand: ${card.name}`);
  }

  /**
   * Remove the ultimate card from the hand
   */
  public removeUltimateCard(): void {
    if (!this.ultimateCardId) return;

    const container = this.cardContainers.get(this.ultimateCardId);
    if (container) {
      container.destroy();
      this.cardContainers.delete(this.ultimateCardId);
      console.log(`Removed ultimate card: ${this.ultimateCardId}`);
    }

    this.ultimateCardId = null;
  }

  /**
   * Check if ultimate card is in hand
   */
  public hasUltimateCard(): boolean {
    return this.ultimateCardId !== null;
  }

  /**
   * Add pulsing glow effect to a card container
   */
  private addGlowEffect(cardContainer: Phaser.GameObjects.Container): void {
    const bg = cardContainer.getByName('bg') as Phaser.GameObjects.Rectangle;
    
    // Set initial glow
    bg.setStrokeStyle(5, 0xffff00, 1);
    
    // Pulse animation on border
    this.scene.tweens.add({
      targets: bg,
      alpha: { from: 1, to: 0.6 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Don't scale the card image - just keep it at normal size
    // Add a subtle brightness pulse instead
    const cardImage = cardContainer.getByName('cardImage') as Phaser.GameObjects.Image;
    if (cardImage) {
      this.scene.tweens.add({
        targets: cardImage,
        alpha: { from: 1, to: 0.85 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Add glow circles around the card (instead of particles that expand bounds)
    const glowCircle1 = this.scene.add.circle(0, 0, 70, 0xffff00, 0);
    glowCircle1.setStrokeStyle(2, 0xffff00, 0.3);
    glowCircle1.setName('glowCircle1');
    
    const glowCircle2 = this.scene.add.circle(0, 0, 80, 0xffff00, 0);
    glowCircle2.setStrokeStyle(2, 0xffff00, 0.2);
    glowCircle2.setName('glowCircle2');
    
    cardContainer.add([glowCircle1, glowCircle2]);
    
    // Animate glow circles
    this.scene.tweens.add({
      targets: glowCircle1,
      scale: { from: 1, to: 1.1 },
      alpha: { from: 0.3, to: 0 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    this.scene.tweens.add({
      targets: glowCircle2,
      scale: { from: 1, to: 1.15 },
      alpha: { from: 0.2, to: 0 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    });
  }
}

