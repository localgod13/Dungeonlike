import Phaser from 'phaser';
import { Card } from '../game/cards';
import { COLORS } from '../game/config';

/**
 * Card selection UI for pre-battle phase
 * Allows players to choose up to 10 cards for their deck (class-specific + neutral)
 */

const SLOT_COUNT = 10;
const CARD_WIDTH = 140;
const CARD_HEIGHT = 210; // Match 2:3 aspect ratio (1024x1536)
const CARD_SPACING = 20;
const SLOT_WIDTH = 120;
const SLOT_HEIGHT = 180; // Match 2:3 aspect ratio

export class CardSelectUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private selectedCards: string[] = [];
  private onCardPick?: (cardId: string) => void;
  private onCardSwap?: (outId: string, inId: string) => void;
  private pendingSwap: string | null = null;
  private cardPool: Card[]; // Class-specific card pool
  
  // UI elements
  private titleText!: Phaser.GameObjects.Text;
  private poolContainer!: Phaser.GameObjects.Container;
  private loadoutContainer!: Phaser.GameObjects.Container;
  private loadoutSlots: Phaser.GameObjects.Container[] = [];
  private cardButtons: Map<string, Phaser.GameObjects.Container> = new Map();

  constructor(
    scene: Phaser.Scene,
    cardPool: Card[],
    onCardPick?: (cardId: string) => void,
    onCardSwap?: (outId: string, inId: string) => void
  ) {
    this.scene = scene;
    this.cardPool = cardPool;
    this.onCardPick = onCardPick;
    this.onCardSwap = onCardSwap;
    
    this.container = scene.add.container(0, 0);
    this.createUI();
  }

  private createUI(): void {
    const centerX = this.scene.scale.width / 2;
    const screenHeight = this.scene.scale.height;
    
    // Title
    this.titleText = this.scene.add.text(
      centerX,
      30,
      'Build Your Deck - Choose 10 Cards',
      {
        fontSize: '28px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }
    );
    this.titleText.setOrigin(0.5);
    this.container.add(this.titleText);

    // Card pool section - AVAILABLE CARDS (top half)
    const poolY = 80;
    const poolTitle = this.scene.add.text(
      centerX,
      poolY,
      '═══ AVAILABLE CARDS ═══',
      {
        fontSize: '20px',
        color: '#ffdd00',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }
    );
    poolTitle.setOrigin(0.5);
    this.container.add(poolTitle);

    // Pool container
    this.poolContainer = this.scene.add.container(0, 0);
    this.container.add(this.poolContainer);
    this.createCardPool(poolY + 30);

    // Loadout section - SELECTED DECK (bottom area)
    // Position at bottom with enough space for 2 rows
    const loadoutY = screenHeight - 430;
    const loadoutTitle = this.scene.add.text(
      centerX,
      loadoutY - 50,
      `═══ YOUR DECK (0/${SLOT_COUNT}) ═══`,
      {
        fontSize: '20px',
        color: '#00ff88',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }
    );
    loadoutTitle.setOrigin(0.5);
    loadoutTitle.setName('loadoutTitle');
    this.container.add(loadoutTitle);

    // Loadout container
    this.loadoutContainer = this.scene.add.container(0, 0);
    this.container.add(this.loadoutContainer);
    this.createLoadoutSlots(loadoutY);
  }

  private createCardPool(startY: number): void {
    const centerX = this.scene.scale.width / 2;
    
    // Separate class cards and neutral cards
    const classCards = this.cardPool.filter(c => c.class !== undefined);
    const neutralCards = this.cardPool.filter(c => c.class === undefined);
    
    console.log(`[CardPool] Class cards: ${classCards.length}, Neutral cards: ${neutralCards.length}`);
    
    // Display class cards in first row
    if (classCards.length > 0) {
      const classWidth = classCards.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
      const classStartX = centerX - classWidth / 2;
      
      // Class cards label
      const classLabel = this.scene.add.text(
        centerX,
        startY - 20,
        'Class Cards',
        {
          fontSize: '18px',
          color: '#ffaa00',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        }
      );
      classLabel.setOrigin(0.5);
      this.poolContainer.add(classLabel);
      
      classCards.forEach((card, index) => {
        const x = classStartX + index * (CARD_WIDTH + CARD_SPACING) + CARD_WIDTH / 2;
        const y = startY + CARD_HEIGHT / 2;
        
        const cardButton = this.createCardButton(card, x, y);
        this.poolContainer.add(cardButton);
        this.cardButtons.set(card.id, cardButton);
      });
    }
    
    // Display neutral cards in second row
    if (neutralCards.length > 0) {
      const neutralY = startY + CARD_HEIGHT + 80;
      const neutralWidth = neutralCards.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
      const neutralStartX = centerX - neutralWidth / 2;
      
      // Neutral cards label
      const neutralLabel = this.scene.add.text(
        centerX,
        neutralY - 40,
        'Neutral Items',
        {
          fontSize: '18px',
          color: '#888888',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        }
      );
      neutralLabel.setOrigin(0.5);
      this.poolContainer.add(neutralLabel);
      
      neutralCards.forEach((card, index) => {
        const x = neutralStartX + index * (CARD_WIDTH + CARD_SPACING) + CARD_WIDTH / 2;
        const y = neutralY + CARD_HEIGHT / 2;
        
        const cardButton = this.createCardButton(card, x, y);
        this.poolContainer.add(cardButton);
        this.cardButtons.set(card.id, cardButton);
      });
    }
  }

  private createCardButton(card: Card, x: number, y: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setData('cardId', card.id);

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
    bg.setStrokeStyle(3, 0x666666, 0.9);
    bg.setName('bg');
    container.add(bg);

    // Card name (with shadow for visibility)
    const nameText = this.scene.add.text(0, -CARD_HEIGHT / 2 + 35, card.name, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 5,
    });
    nameText.setOrigin(0.5);
    nameText.setDepth(10);
    container.add(nameText);

    // AP cost badge (smaller)
    const apBadge = this.scene.add.container(-CARD_WIDTH / 2 + 26, -CARD_HEIGHT / 2 + 26);
    apBadge.setDepth(10);
    
    const apBg = this.scene.add.circle(0, 0, 16, 0x000000, 0.95);
    apBg.setStrokeStyle(2, 0xffaa00, 1);
    apBadge.add(apBg);

    const apText = this.scene.add.text(0, 0, `${card.ap}`, {
      fontSize: '18px',
      color: '#ffaa00',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    apText.setOrigin(0.5);
    apBadge.add(apText);
    container.add(apBadge);

    // Description (no background - just text with shadow)
    const descText = this.scene.add.text(0, 15, card.desc, {
      fontSize: '15px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 25 },
      stroke: '#000000',
      strokeThickness: 4,
    });
    descText.setOrigin(0.5);
    descText.setDepth(10);
    container.add(descText);

    // Target info (no background - just text with shadow)
    const targetText = this.scene.add.text(0, CARD_HEIGHT / 2 - 35, `Target: ${card.target}`, {
      fontSize: '12px',
      color: '#cccccc',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
    });
    targetText.setOrigin(0.5);
    targetText.setDepth(10);
    container.add(targetText);
    
    // Consumable count badge (if applicable)
    if ((card as any).consumableCount !== undefined) {
      const count = (card as any).consumableCount;
      const countBadge = this.scene.add.container(CARD_WIDTH / 2 - 26, -CARD_HEIGHT / 2 + 26);
      countBadge.setDepth(15);
      
      const countBg = this.scene.add.circle(0, 0, 18, 0xe74c3c, 1);
      countBg.setStrokeStyle(2, 0xffffff, 1);
      countBadge.add(countBg);
      
      const countText = this.scene.add.text(0, 0, `x${count}`, {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      });
      countText.setOrigin(0.5);
      countBadge.add(countText);
      container.add(countBadge);
    }

    // Make interactive
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      bg.setStrokeStyle(4, 0xffffff, 1);
      container.setScale(1.05);
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(3, 0x666666, 0.9);
      container.setScale(1);
    });
    bg.on('pointerdown', () => {
      this.handleCardClick(card.id);
    });

    return container;
  }

  private createLoadoutSlots(y: number): void {
    const centerX = this.scene.scale.width / 2;
    const SLOTS_PER_ROW = 5;
    const ROWS = 2;
    const totalWidth = SLOTS_PER_ROW * (SLOT_WIDTH + CARD_SPACING) - CARD_SPACING;
    const startX = centerX - totalWidth / 2;
    const ROW_SPACING = SLOT_HEIGHT + 30;

    for (let i = 0; i < SLOT_COUNT; i++) {
      const row = Math.floor(i / SLOTS_PER_ROW);
      const col = i % SLOTS_PER_ROW;
      const x = startX + col * (SLOT_WIDTH + CARD_SPACING) + SLOT_WIDTH / 2;
      const slotY = y + row * ROW_SPACING;
      
      const slot = this.createLoadoutSlot(x, slotY, i);
      this.loadoutContainer.add(slot);
      this.loadoutSlots.push(slot);
    }
  }

  private createLoadoutSlot(x: number, y: number, index: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.setSize(SLOT_WIDTH, SLOT_HEIGHT);
    container.setData('slotIndex', index);
    container.setData('cardId', null);

    // Empty slot background
    const bg = this.scene.add.rectangle(0, 0, SLOT_WIDTH, SLOT_HEIGHT, 0x1a1a1a, 0.5);
    bg.setStrokeStyle(2, 0x444444, 0.8);
    bg.setName('bg');
    container.add(bg);

    const emptyText = this.scene.add.text(0, 0, 'Empty', {
      fontSize: '16px',
      color: '#666666',
      fontFamily: 'Arial, sans-serif',
    });
    emptyText.setOrigin(0.5);
    emptyText.setName('emptyText');
    container.add(emptyText);

    // Make interactive for swapping
    bg.setInteractive({ useHandCursor: false });
    bg.on('pointerdown', () => {
      this.handleSlotClick(index);
    });

    return container;
  }

  private handleCardClick(cardId: string): void {
    if (this.selectedCards.length < SLOT_COUNT && !this.selectedCards.includes(cardId)) {
      // Pick card
      this.addCardToLoadout(cardId);
      if (this.onCardPick) {
        this.onCardPick(cardId);
      }
    } else if (this.selectedCards.length === SLOT_COUNT && !this.selectedCards.includes(cardId)) {
      // Initiate swap - highlight loadout slots
      this.pendingSwap = cardId;
      this.highlightLoadoutSlots(true);
      this.updateTitle('Click a slot to swap');
    }
  }

  private handleSlotClick(index: number): void {
    const cardId = this.loadoutSlots[index].getData('cardId');
    
    if (this.pendingSwap) {
      // Complete swap
      if (cardId) {
        this.removeCardFromLoadout(cardId);
        this.addCardToLoadout(this.pendingSwap);
        
        if (this.onCardSwap) {
          this.onCardSwap(cardId, this.pendingSwap);
        }
      }
      
      this.pendingSwap = null;
      this.highlightLoadoutSlots(false);
      this.updateTitle('Choose up to 4 cards');
    } else if (cardId) {
      // Remove card
      this.removeCardFromLoadout(cardId);
    }
  }

  private addCardToLoadout(cardId: string): void {
    const card = this.cardPool.find(c => c.id === cardId);
    if (!card) return;

    const emptySlotIndex = this.selectedCards.length;
    if (emptySlotIndex >= SLOT_COUNT) return;

    this.selectedCards.push(cardId);
    this.updateLoadoutSlot(emptySlotIndex, card);
    this.updateLoadoutTitle();
  }

  private removeCardFromLoadout(cardId: string): void {
    const index = this.selectedCards.indexOf(cardId);
    if (index === -1) return;

    this.selectedCards.splice(index, 1);
    
    // Rebuild all slots
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (i < this.selectedCards.length) {
        const card = this.cardPool.find(c => c.id === this.selectedCards[i]);
        if (card) {
          this.updateLoadoutSlot(i, card);
        }
      } else {
        this.clearLoadoutSlot(i);
      }
    }
    
    this.updateLoadoutTitle();
  }

  private updateLoadoutSlot(index: number, card: Card): void {
    const slot = this.loadoutSlots[index];
    slot.setData('cardId', card.id);

    // Remove old content
    const bg = slot.getByName('bg') as Phaser.GameObjects.Rectangle;
    const oldText = slot.getByName('emptyText') as Phaser.GameObjects.Text;
    if (oldText) oldText.destroy();

    const existing = slot.getByName('cardContent');
    if (existing) existing.destroy();

    // Add card content with image
    const cardContent = this.scene.add.container(0, 0);
    cardContent.setName('cardContent');

    // Card image background
    const imageKey = `card_${card.type}`;
    const cardImage = this.scene.add.image(0, 0, imageKey);
    cardImage.setDisplaySize(SLOT_WIDTH, SLOT_HEIGHT);
    
    // Apply gray tint to neutral cards for visual distinction
    if (card.type === 'neutral') {
      cardImage.setTint(0x888888); // Gray tint for neutral items
    }
    
    cardContent.add(cardImage);

    // Card name with shadow
    const nameText = this.scene.add.text(0, -SLOT_HEIGHT / 2 + 30, card.name, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 4,
    });
    nameText.setOrigin(0.5);
    cardContent.add(nameText);

    // AP badge (smaller)
    const apBadge = this.scene.add.container(-SLOT_WIDTH / 2 + 20, -SLOT_HEIGHT / 2 + 20);
    
    const apBg = this.scene.add.circle(0, 0, 13, 0x000000, 0.95);
    apBg.setStrokeStyle(2, 0xffaa00, 1);
    apBadge.add(apBg);
    
    const apText = this.scene.add.text(0, 0, `${card.ap}`, {
      fontSize: '14px',
      color: '#ffaa00',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    apText.setOrigin(0.5);
    apBadge.add(apText);
    cardContent.add(apBadge);

    // Description text (no background - just text with shadow)
    const descText = this.scene.add.text(0, 0, card.desc, {
      fontSize: '11px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
      wordWrap: { width: SLOT_WIDTH - 15 },
      stroke: '#000000',
      strokeThickness: 3,
    });
    descText.setOrigin(0.5);
    cardContent.add(descText);
    
    // Consumable count badge (if applicable)
    if ((card as any).consumableCount !== undefined) {
      const count = (card as any).consumableCount;
      const countBadge = this.scene.add.container(SLOT_WIDTH / 2 - 20, -SLOT_HEIGHT / 2 + 20);
      countBadge.setDepth(15);
      
      const countBg = this.scene.add.circle(0, 0, 14, 0xe74c3c, 1);
      countBg.setStrokeStyle(2, 0xffffff, 1);
      countBadge.add(countBg);
      
      const countText = this.scene.add.text(0, 0, `x${count}`, {
        fontSize: '13px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      });
      countText.setOrigin(0.5);
      countBadge.add(countText);
      cardContent.add(countBadge);
    }

    slot.add(cardContent);
    bg.setStrokeStyle(3, 0x66ff66, 1);
    bg.setFillStyle(0x000000, 0); // Transparent fill since image is showing

    // Enable pointer cursor for filled slots
    bg.setInteractive({ useHandCursor: true });
  }

  private clearLoadoutSlot(index: number): void {
    const slot = this.loadoutSlots[index];
    slot.setData('cardId', null);

    const bg = slot.getByName('bg') as Phaser.GameObjects.Rectangle;
    const cardContent = slot.getByName('cardContent');
    if (cardContent) cardContent.destroy();

    const emptyText = this.scene.add.text(0, 0, 'Empty', {
      fontSize: '16px',
      color: '#666666',
      fontFamily: 'Arial, sans-serif',
    });
    emptyText.setOrigin(0.5);
    emptyText.setName('emptyText');
    slot.add(emptyText);

    bg.setStrokeStyle(2, 0x444444, 0.8);
    bg.setFillStyle(0x1a1a1a, 0.5);
    bg.setInteractive({ useHandCursor: false });
  }

  private highlightLoadoutSlots(highlight: boolean): void {
    this.loadoutSlots.forEach(slot => {
      const bg = slot.getByName('bg') as Phaser.GameObjects.Rectangle;
      if (highlight) {
        bg.setStrokeStyle(3, 0xffff00);
      } else {
        const cardId = slot.getData('cardId');
        if (cardId) {
          bg.setStrokeStyle(2, 0x66ff66);
        } else {
          bg.setStrokeStyle(2, 0x444444, 0.8);
        }
      }
    });
  }

  private updateLoadoutTitle(): void {
    const titleObj = this.container.getByName('loadoutTitle') as Phaser.GameObjects.Text;
    if (titleObj) {
      titleObj.setText(`═══ YOUR DECK (${this.selectedCards.length}/${SLOT_COUNT}) ═══`);
    }
  }

  private updateTitle(text: string): void {
    this.titleText.setText(text);
  }

  public getSelectedCards(): string[] {
    return [...this.selectedCards];
  }

  public setLoadout(cards: string[]): void {
    this.selectedCards = [...cards].slice(0, SLOT_COUNT);
    
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (i < this.selectedCards.length) {
        const card = this.cardPool.find(c => c.id === this.selectedCards[i]);
        if (card) {
          this.updateLoadoutSlot(i, card);
        }
      } else {
        this.clearLoadoutSlot(i);
      }
    }
    
    this.updateLoadoutTitle();
  }

  public destroy(): void {
    this.container.destroy();
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }
}

