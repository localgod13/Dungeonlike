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
const CARD_OVERLAP = 60; // How much cards overlap when fanned out
const FAN_ARC = 0.3; // Arc angle for fan spread (in radians)

export class CardSelectUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private selectedCards: string[] = [];
  private selectedItems: string[] = []; // Separate tracking for items
  private onCardPick?: (cardId: string) => void;
  private onCardSwap?: (outId: string, inId: string) => void;
  private pendingSwap: string | null = null;
  private cardPool: Card[]; // Class-specific card pool
  
  // UI elements
  private titleText!: Phaser.GameObjects.Text;
  private poolContainer!: Phaser.GameObjects.Container;
  private itemPoolContainer!: Phaser.GameObjects.Container; // Separate container for items
  private loadoutContainer!: Phaser.GameObjects.Container;
  private itemLoadoutContainer!: Phaser.GameObjects.Container; // Separate container for item slots
  private loadoutSlots: Phaser.GameObjects.Container[] = [];
  private itemSlots: Phaser.GameObjects.Container[] = []; // 2 item slots
  private cardButtons: Map<string, Phaser.GameObjects.Container> = new Map();
  
  private readonly MAX_ITEMS = 2; // Limit items to 2

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
    const leftX = this.scene.scale.width * 0.25;
    const rightX = this.scene.scale.width * 0.75;
    
    // Title
    this.titleText = this.scene.add.text(
      centerX,
      30,
      'Build Your Deck - Choose 10 Class Cards + 2 Items',
      {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      }
    );
    this.titleText.setOrigin(0.5);
    this.container.add(this.titleText);

    // CLASS CARDS section - LEFT side
    const poolY = 80;
    const classPoolTitle = this.scene.add.text(
      leftX,
      poolY,
      '═══ CLASS CARDS ═══',
      {
        fontSize: '20px',
        color: '#ffaa00',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      }
    );
    classPoolTitle.setOrigin(0.5);
    this.container.add(classPoolTitle);

    // Class cards pool container
    this.poolContainer = this.scene.add.container(0, 0);
    this.container.add(this.poolContainer);
    this.createCardPool(poolY + 40, leftX);

    // ITEM CARDS section - RIGHT side
    const itemPoolTitle = this.scene.add.text(
      rightX,
      poolY,
      '═══ ITEM CARDS ═══',
      {
        fontSize: '20px',
        color: '#888888',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      }
    );
    itemPoolTitle.setOrigin(0.5);
    this.container.add(itemPoolTitle);

    // Item cards pool container
    this.itemPoolContainer = this.scene.add.container(0, 0);
    this.container.add(this.itemPoolContainer);
    this.createItemPool(poolY + 40, rightX);

    // DECK section - bottom left area
    const loadoutY = screenHeight - 210; // Moved down 50px (was -260, now -210)
    const loadoutTitle = this.scene.add.text(
      leftX,
      loadoutY - 120, // Moved up 50px (was -70, now -120)
      `═══ YOUR DECK (0/${SLOT_COUNT}) ═══`,
      {
        fontSize: '20px',
        color: '#00ff88',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      }
    );
    loadoutTitle.setOrigin(0.5);
    loadoutTitle.setName('loadoutTitle');
    this.container.add(loadoutTitle);

    // Loadout container for deck cards
    this.loadoutContainer = this.scene.add.container(0, 0);
    this.container.add(this.loadoutContainer);
    this.createLoadoutSlots(loadoutY, leftX);

    // ITEMS section - bottom right area
    const itemLoadoutTitle = this.scene.add.text(
      rightX,
      loadoutY - 120, // Moved up 50px (was -70, now -120)
      `═══ ITEMS (0/${this.MAX_ITEMS}) ═══`,
      {
        fontSize: '20px',
        color: '#ff8800',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      }
    );
    itemLoadoutTitle.setOrigin(0.5);
    itemLoadoutTitle.setName('itemLoadoutTitle');
    this.container.add(itemLoadoutTitle);

    // Item slots container
    this.itemLoadoutContainer = this.scene.add.container(0, 0);
    this.container.add(this.itemLoadoutContainer);
    this.createItemSlots(loadoutY, rightX);
  }

  private createCardPool(startY: number, centerX: number): void {
    // Get only class cards (cards with a defined class)
    const classCards = this.cardPool.filter(c => c.class !== undefined);
    console.log(`[Class Card Pool] Total cards in fan: ${classCards.length}`);
    
    // Calculate fan layout - cards overlap significantly
    const totalCards = classCards.length;
    const maxFanWidth = (this.scene.scale.width / 2) - 150; // Half screen minus larger margins
    const actualCardSpacing = Math.min(CARD_OVERLAP, maxFanWidth / Math.max(totalCards - 1, 1));
    
    // Calculate total width including card width at each end
    // We want the CENTER of the fan to align with centerX
    const totalFanWidth = actualCardSpacing * (totalCards - 1) + CARD_WIDTH;
    const fanStartX = centerX - totalFanWidth / 2 + CARD_WIDTH / 2;
    
    console.log(`[Class Pool] ${totalCards} cards, spacing: ${actualCardSpacing.toFixed(1)}px, total width: ${totalFanWidth.toFixed(1)}px, centerX: ${centerX}, startX: ${fanStartX.toFixed(1)}`);
    
    // Create overlapping fan of class cards
    classCards.forEach((card, index) => {
      // Position cards in a horizontal fan with overlapping
      const x = fanStartX + (index * actualCardSpacing);
      const y = startY + CARD_HEIGHT / 2;
      
      // Set initial depth based on index (left cards behind, right cards in front)
      const baseDepth = 100 + index;
      
      const cardButton = this.createCardButton(card, x, y, index, baseDepth, false);
      this.poolContainer.add(cardButton);
      this.cardButtons.set(card.id, cardButton);
    });
  }

  private createItemPool(startY: number, centerX: number): void {
    // Get only neutral/item cards (cards without a defined class)
    const itemCards = this.cardPool.filter(c => c.class === undefined);
    console.log(`[Item Card Pool] Total cards in fan: ${itemCards.length}`);
    
    // Calculate fan layout - cards overlap significantly
    const totalCards = itemCards.length;
    const maxFanWidth = (this.scene.scale.width / 2) - 150; // Half screen minus larger margins
    const actualCardSpacing = Math.min(CARD_OVERLAP, maxFanWidth / Math.max(totalCards - 1, 1));
    
    // Calculate total width including card width at each end
    // We want the CENTER of the fan to align with centerX
    const totalFanWidth = actualCardSpacing * (totalCards - 1) + CARD_WIDTH;
    const fanStartX = centerX - totalFanWidth / 2 + CARD_WIDTH / 2;
    
    console.log(`[Item Pool] ${totalCards} cards, spacing: ${actualCardSpacing.toFixed(1)}px, total width: ${totalFanWidth.toFixed(1)}px, centerX: ${centerX}, startX: ${fanStartX.toFixed(1)}`);
    
    // Create overlapping fan of item cards
    itemCards.forEach((card, index) => {
      // Position cards in a horizontal fan with overlapping
      const x = fanStartX + (index * actualCardSpacing);
      const y = startY + CARD_HEIGHT / 2;
      
      // Set initial depth based on index (left cards behind, right cards in front)
      const baseDepth = 100 + index;
      
      const cardButton = this.createCardButton(card, x, y, index, baseDepth, true);
      this.itemPoolContainer.add(cardButton);
      this.cardButtons.set(card.id, cardButton);
    });
  }

  private createCardButton(card: Card, x: number, y: number, index: number, baseDepth: number, isItem: boolean): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setData('cardId', card.id);
    container.setData('baseDepth', baseDepth);
    container.setData('originalY', y);
    container.setData('originalIndex', index);
    container.setData('isItem', isItem); // Track if this is an item card
    container.setDepth(baseDepth);

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

    // Add a glow effect (hidden by default)
    const glowCircle = this.scene.add.circle(0, 0, CARD_WIDTH * 0.7, 0xffffff, 0.3);
    glowCircle.setVisible(false);
    glowCircle.setName('glow');
    container.addAt(glowCircle, 1); // Add behind the card image but in front of nothing

    // Make interactive with hover effects
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      // Show glow effect
      glowCircle.setVisible(true);
      this.scene.tweens.add({
        targets: glowCircle,
        alpha: 0.5,
        scale: 1.3,
        duration: 200,
        ease: 'Power2',
      });
      
      // CRITICAL: Bring card to ABSOLUTE front using bringToTop
      // Use the appropriate container based on card type
      const parentContainer = isItem ? this.itemPoolContainer : this.poolContainer;
      parentContainer.bringToTop(container);
      container.setDepth(1000);
      
      // Enhance visuals
      bg.setStrokeStyle(5, 0xffff00, 1);
      
      // Lift card up slightly and scale
      this.scene.tweens.add({
        targets: container,
        y: y - 40,
        scale: 1.15,
        duration: 200,
        ease: 'Power2',
      });
    });
    bg.on('pointerout', () => {
      // Hide glow effect
      this.scene.tweens.add({
        targets: glowCircle,
        alpha: 0,
        scale: 1,
        duration: 200,
        ease: 'Power2',
        onComplete: () => glowCircle.setVisible(false)
      });
      
      // CRITICAL: Restore card to its original position in the render order
      // Use the appropriate container based on card type
      const originalIndex = container.getData('originalIndex');
      const parentContainer = isItem ? this.itemPoolContainer : this.poolContainer;
      parentContainer.moveTo(container, originalIndex);
      
      // Return to base depth
      container.setDepth(baseDepth);
      
      // Reset visuals
      bg.setStrokeStyle(3, 0x666666, 0.9);
      
      // Return card to original position
      this.scene.tweens.add({
        targets: container,
        y: y,
        scale: 1,
        duration: 200,
        ease: 'Power2',
      });
    });
    bg.on('pointerdown', () => {
      this.handleCardClick(card.id, isItem);
    });

    return container;
  }

  private createLoadoutSlots(y: number, centerX: number): void {
    // Create overlapping fan layout for deck slots with more separation
    const deckOverlap = 70; // Spacing between cards
    const maxDeckWidth = (this.scene.scale.width / 2) - 200; // Half screen minus margins
    const actualSlotSpacing = Math.min(deckOverlap, maxDeckWidth / Math.max(SLOT_COUNT - 1, 1));
    
    // Calculate total width including the card width at each end
    // We want the CENTER of the fan to align with centerX
    const totalCardWidth = actualSlotSpacing * (SLOT_COUNT - 1) + SLOT_WIDTH;
    const deckStartX = centerX - totalCardWidth / 2 + SLOT_WIDTH / 2 + 100; // Move 100px to the right

    console.log(`[Deck Layout] ${SLOT_COUNT} slots, spacing: ${actualSlotSpacing.toFixed(1)}px, total width: ${totalCardWidth.toFixed(1)}px, centerX: ${centerX}, startX: ${deckStartX.toFixed(1)} (+100px right)`);

    for (let i = 0; i < SLOT_COUNT; i++) {
      const x = deckStartX + (i * actualSlotSpacing);
      const slotY = y;
      const baseDepth = 50 + i; // Lower depth than card pool
      
      const slot = this.createLoadoutSlot(x, slotY, i, baseDepth, false);
      this.loadoutContainer.add(slot);
      this.loadoutSlots.push(slot);
    }
  }

  private createItemSlots(y: number, centerX: number): void {
    // Create 2 item slots with good spacing
    const itemSpacing = 160; // Good spacing between 2 items
    
    // Calculate total width including card width at each end
    // We want the CENTER of the items to align with centerX
    const totalWidth = itemSpacing * (this.MAX_ITEMS - 1) + SLOT_WIDTH;
    const itemStartX = centerX - totalWidth / 2 + SLOT_WIDTH / 2;

    console.log(`[Item Slots] ${this.MAX_ITEMS} slots, spacing: ${itemSpacing}px, total width: ${totalWidth.toFixed(1)}px, centerX: ${centerX}, startX: ${itemStartX.toFixed(1)}`);

    for (let i = 0; i < this.MAX_ITEMS; i++) {
      const x = itemStartX + (i * itemSpacing);
      const slotY = y;
      const baseDepth = 50 + i;
      
      const slot = this.createLoadoutSlot(x, slotY, i, baseDepth, true);
      this.itemLoadoutContainer.add(slot);
      this.itemSlots.push(slot);
    }
  }

  private createLoadoutSlot(x: number, y: number, index: number, baseDepth: number, isItem: boolean): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.setSize(SLOT_WIDTH, SLOT_HEIGHT);
    container.setData('slotIndex', index);
    container.setData('cardId', null);
    container.setData('baseDepth', baseDepth);
    container.setData('originalY', y);
    container.setData('originalIndex', index);
    container.setData('isItem', isItem); // Track if this is an item slot
    container.setDepth(baseDepth);
    
    // Start invisible - will be shown when card is added
    container.setVisible(false);

    return container;
  }

  private handleCardClick(cardId: string, isItem: boolean): void {
    if (isItem) {
      // Handle item card clicks
      if (this.selectedItems.length < this.MAX_ITEMS && !this.selectedItems.includes(cardId)) {
        // Add item to item slots
        this.addItemToLoadout(cardId);
        if (this.onCardPick) {
          this.onCardPick(cardId);
        }
      } else if (this.selectedItems.length === this.MAX_ITEMS && !this.selectedItems.includes(cardId)) {
        // Initiate item swap
        this.pendingSwap = cardId;
        this.highlightItemSlots(true);
        this.updateTitle('Click an item to swap');
      }
    } else {
      // Handle regular card clicks
      if (this.selectedCards.length < SLOT_COUNT && !this.selectedCards.includes(cardId)) {
        // Pick card
        this.addCardToLoadout(cardId);
        if (this.onCardPick) {
          this.onCardPick(cardId);
        }
      } else if (this.selectedCards.length === SLOT_COUNT && !this.selectedCards.includes(cardId)) {
        // Initiate swap - highlight filled loadout slots
        this.pendingSwap = cardId;
        this.highlightLoadoutSlots(true);
        this.updateTitle('Click a card in your deck to swap');
      }
    }
  }

  private handleSlotClick(index: number, isItem: boolean): void {
    const slot = isItem ? this.itemSlots[index] : this.loadoutSlots[index];
    const cardId = slot.getData('cardId');
    
    // Only allow interaction with filled slots
    if (!cardId) return;
    
    if (this.pendingSwap) {
      // Complete swap
      if (isItem) {
        this.removeItemFromLoadout(cardId);
        this.addItemToLoadout(this.pendingSwap);
        this.highlightItemSlots(false);
      } else {
        this.removeCardFromLoadout(cardId);
        this.addCardToLoadout(this.pendingSwap);
        this.highlightLoadoutSlots(false);
      }
      
      if (this.onCardSwap) {
        this.onCardSwap(cardId, this.pendingSwap);
      }
      
      this.pendingSwap = null;
      this.updateTitle('Build Your Deck - Choose 10 Class Cards + 2 Items');
    } else {
      // Remove card from deck or item slot
      if (isItem) {
        this.removeItemFromLoadout(cardId);
      } else {
        this.removeCardFromLoadout(cardId);
      }
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
    this.updateLoadoutSlotContent(slot, index, card, false);
  }

  private updateLoadoutSlotContent(slot: Phaser.GameObjects.Container, index: number, card: Card, isItem: boolean): void {
    slot.setData('cardId', card.id);
    
    const baseDepth = slot.getData('baseDepth');
    const originalY = slot.getData('originalY');
    
    // Make slot visible now that it has a card
    slot.setVisible(true);

    // Remove old content
    const bg = slot.getByName('bg') as Phaser.GameObjects.Rectangle;
    if (bg) bg.destroy();
    
    const oldText = slot.getByName('emptyText') as Phaser.GameObjects.Text;
    if (oldText) oldText.destroy();

    const existing = slot.getByName('cardContent');
    if (existing) existing.destroy();
    
    const existingGlow = slot.getByName('glow');
    if (existingGlow) existingGlow.destroy();
    
    // Add glow effect (hidden by default) - add first
    const glowCircle = this.scene.add.circle(0, 0, SLOT_WIDTH * 0.6, 0x00ff88, 0.3);
    glowCircle.setVisible(false);
    glowCircle.setName('glow');
    slot.add(glowCircle);
    
    // Create background for the card slot
    const borderColor = isItem ? 0xff8800 : 0x66ff66;
    const newBg = this.scene.add.rectangle(0, 0, SLOT_WIDTH, SLOT_HEIGHT, 0x000000, 0);
    newBg.setStrokeStyle(3, borderColor, 1);
    newBg.setName('bg');
    slot.add(newBg);

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
    
    newBg.setFillStyle(0x000000, 0); // Transparent fill since image is showing

    // Enable pointer cursor and hover effects for filled slots
    newBg.setInteractive({ useHandCursor: true });
    
    // Add hover effects
    const highlightColor = isItem ? 0xffaa44 : 0x00ffaa;
    
    newBg.on('pointerover', () => {
      // Show glow effect
      glowCircle.setVisible(true);
      this.scene.tweens.add({
        targets: glowCircle,
        alpha: 0.5,
        scale: 1.2,
        duration: 150,
        ease: 'Power2',
      });
      
      // Bring to front - use appropriate container
      const parentContainer = isItem ? this.itemLoadoutContainer : this.loadoutContainer;
      parentContainer.bringToTop(slot);
      slot.setDepth(1000);
      
      // Enhance border
      newBg.setStrokeStyle(5, highlightColor, 1);
      
      // Lift and scale
      this.scene.tweens.add({
        targets: slot,
        y: originalY - 30,
        scale: 1.15,
        duration: 150,
        ease: 'Power2',
      });
    });
    
    newBg.on('pointerout', () => {
      // Hide glow effect
      this.scene.tweens.add({
        targets: glowCircle,
        alpha: 0,
        scale: 1,
        duration: 150,
        ease: 'Power2',
        onComplete: () => glowCircle.setVisible(false)
      });
      
      // Return to original position in render order
      const originalIndex = slot.getData('originalIndex');
      const parentContainer = isItem ? this.itemLoadoutContainer : this.loadoutContainer;
      parentContainer.moveTo(slot, originalIndex);
      slot.setDepth(baseDepth);
      
      // Reset border
      newBg.setStrokeStyle(3, borderColor, 1);
      
      // Return to position
      this.scene.tweens.add({
        targets: slot,
        y: originalY,
        scale: 1,
        duration: 150,
        ease: 'Power2',
      });
    });
    
    newBg.on('pointerdown', () => {
      this.handleSlotClick(index, isItem);
    });
  }

  private clearLoadoutSlot(index: number): void {
    const slot = this.loadoutSlots[index];
    slot.setData('cardId', null);

    const bg = slot.getByName('bg') as Phaser.GameObjects.Rectangle;
    if (bg) bg.destroy();
    
    const cardContent = slot.getByName('cardContent');
    if (cardContent) cardContent.destroy();
    
    const existingGlow = slot.getByName('glow');
    if (existingGlow) existingGlow.destroy();
    
    // Hide the slot since it's empty
    slot.setVisible(false);
  }

  private highlightLoadoutSlots(highlight: boolean): void {
    this.loadoutSlots.forEach(slot => {
      const bg = slot.getByName('bg') as Phaser.GameObjects.Rectangle;
      const cardId = slot.getData('cardId');
      
      // Only highlight slots that have cards
      if (bg && cardId) {
        if (highlight) {
          bg.setStrokeStyle(4, 0xffff00, 1);
        } else {
          bg.setStrokeStyle(3, 0x66ff66, 1);
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

  private updateItemLoadoutTitle(): void {
    const titleObj = this.container.getByName('itemLoadoutTitle') as Phaser.GameObjects.Text;
    if (titleObj) {
      titleObj.setText(`═══ ITEMS (${this.selectedItems.length}/${this.MAX_ITEMS}) ═══`);
    }
  }

  private addItemToLoadout(cardId: string): void {
    const card = this.cardPool.find(c => c.id === cardId);
    if (!card) return;

    const emptySlotIndex = this.selectedItems.length;
    if (emptySlotIndex >= this.MAX_ITEMS) return;

    this.selectedItems.push(cardId);
    this.updateItemSlot(emptySlotIndex, card);
    this.updateItemLoadoutTitle();
  }

  private removeItemFromLoadout(cardId: string): void {
    const index = this.selectedItems.indexOf(cardId);
    if (index === -1) return;

    this.selectedItems.splice(index, 1);
    
    // Rebuild all item slots
    for (let i = 0; i < this.MAX_ITEMS; i++) {
      if (i < this.selectedItems.length) {
        const card = this.cardPool.find(c => c.id === this.selectedItems[i]);
        if (card) {
          this.updateItemSlot(i, card);
        }
      } else {
        this.clearItemSlot(i);
      }
    }
    
    this.updateItemLoadoutTitle();
  }

  private updateItemSlot(index: number, card: Card): void {
    const slot = this.itemSlots[index];
    this.updateLoadoutSlotContent(slot, index, card, true);
  }

  private clearItemSlot(index: number): void {
    const slot = this.itemSlots[index];
    slot.setData('cardId', null);

    const bg = slot.getByName('bg') as Phaser.GameObjects.Rectangle;
    if (bg) bg.destroy();
    
    const cardContent = slot.getByName('cardContent');
    if (cardContent) cardContent.destroy();
    
    const existingGlow = slot.getByName('glow');
    if (existingGlow) existingGlow.destroy();
    
    // Hide the slot since it's empty
    slot.setVisible(false);
  }

  private highlightItemSlots(highlight: boolean): void {
    this.itemSlots.forEach(slot => {
      const bg = slot.getByName('bg') as Phaser.GameObjects.Rectangle;
      const cardId = slot.getData('cardId');
      
      // Only highlight slots that have cards
      if (bg && cardId) {
        if (highlight) {
          bg.setStrokeStyle(4, 0xffff00, 1);
        } else {
          bg.setStrokeStyle(3, 0xff8800, 1);
        }
      }
    });
  }

  private updateTitle(text: string): void {
    this.titleText.setText(text);
  }

  public getSelectedCards(): string[] {
    // Return combined list of regular cards and items
    return [...this.selectedCards, ...this.selectedItems];
  }

  public setLoadout(cards: string[]): void {
    // Separate cards into regular and items
    const regularCards: string[] = [];
    const itemCards: string[] = [];
    
    cards.forEach(cardId => {
      const card = this.cardPool.find(c => c.id === cardId);
      if (card) {
        if (card.class === undefined) {
          // Item card
          if (itemCards.length < this.MAX_ITEMS) {
            itemCards.push(cardId);
          }
        } else {
          // Regular card
          if (regularCards.length < SLOT_COUNT) {
            regularCards.push(cardId);
          }
        }
      }
    });
    
    this.selectedCards = regularCards;
    this.selectedItems = itemCards;
    
    // Update regular card slots
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
    
    // Update item slots
    for (let i = 0; i < this.MAX_ITEMS; i++) {
      if (i < this.selectedItems.length) {
        const card = this.cardPool.find(c => c.id === this.selectedItems[i]);
        if (card) {
          this.updateItemSlot(i, card);
        }
      } else {
        this.clearItemSlot(i);
      }
    }
    
    this.updateLoadoutTitle();
    this.updateItemLoadoutTitle();
  }

  public destroy(): void {
    this.container.destroy();
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }
}

