import Phaser from 'phaser';
import { Card, NEUTRAL_CONSUMABLE_ITEMS, NEUTRAL_REUSABLE_ITEMS, getCardsForClass } from '../game/cards';
import { addGold, addCardToDeck, getGold } from '../game/inventory';
import { getCurrentUserId } from '../net/supa';

interface Player {
  userId: string;
  userName: string;
  class: string;
}

interface LootSceneData {
  lobbyId: string;
  players: Player[];
  mapSeed?: number;
  visitedNodes?: number[];
  currentNodeId?: number;
  stage: number;
  goldReward: number;
  battleBackground?: string; // Key of the background image used in battle
}

/**
 * Post-battle loot scene
 * Shows gold reward and allows player to select 1 card from 3 options
 */
export class LootScene extends Phaser.Scene {
  private lobbyId: string | null = null;
  private players: Player[] = [];
  private mapSeed?: number;
  private visitedNodes?: number[];
  private currentNodeId?: number;
  private stage: number = 1;
  private goldReward: number = 0;
  private battleBackground: string = 'battleground1';
  private hasTransitioned = false; // Prevent duplicate scene transitions
  
  private selectedCard: Card | null = null;
  private isReady: boolean = false;
  private userId: string = '';
  private fadeOverlay: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super({ key: 'LootScene' });
  }

  init(data: LootSceneData): void {
    this.lobbyId = data.lobbyId;
    this.players = data.players || [];
    this.mapSeed = data.mapSeed;
    this.visitedNodes = data.visitedNodes;
    this.currentNodeId = data.currentNodeId;
    this.stage = data.stage || 1;
    this.goldReward = data.goldReward || 0;
    this.battleBackground = data.battleBackground || 'battleground1';
    this.hasTransitioned = false; // Reset transition flag for new scene instance
    
    this.selectedCard = null;
    this.isReady = false;
    
    console.log('[LootScene] Initialized with gold:', this.goldReward);
    console.log('[LootScene] Using background:', this.battleBackground);
  }

  async create(): Promise<void> {
    const { width, height } = this.cameras.main;
    
    // Get user ID
    this.userId = await getCurrentUserId();
    console.log('[LootScene] User ID:', this.userId);
    
    // Add gold to player's inventory
    addGold(this.userId, this.goldReward);
    const totalGold = getGold(this.userId);
    
    // Use same background as battle
    const bg = this.add.image(0, 0, this.battleBackground);
    bg.setOrigin(0, 0);
    bg.setDepth(-1);
    
    // Scale background to cover screen
    const scaleX = width / bg.width;
    const scaleY = height / bg.height;
    const scale = Math.max(scaleX, scaleY);
    bg.setScale(scale);
    bg.setPosition(
      (width - bg.width * scale) / 2,
      (height - bg.height * scale) / 2
    );
    
    // Darken overlay for better text visibility
    const darkOverlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.5);
    darkOverlay.setOrigin(0);
    darkOverlay.setDepth(0);
    
    // Fade-in effect
    this.fadeOverlay = this.add.rectangle(0, 0, width, height, 0x000000, 1);
    this.fadeOverlay.setOrigin(0);
    this.fadeOverlay.setDepth(10000);
    
    this.tweens.add({
      targets: this.fadeOverlay,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        if (this.fadeOverlay) {
          this.fadeOverlay.destroy();
          this.fadeOverlay = null;
        }
      }
    });
    
    // Title
    const title = this.add.text(width / 2, 80, 'Victory!', {
      fontSize: '52px',
      fontFamily: 'Arial Black',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(1);
    
    // Gold reward display
    const goldText = this.add.text(width / 2, 160, `💰 +${this.goldReward} Gold (Total: ${totalGold})`, {
      fontSize: '32px',
      fontFamily: 'Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(1);
    
    // Subtitle
    const subtitle = this.add.text(width / 2, 220, 'Choose 1 card to add to your deck:', {
      fontSize: '28px',
      fontFamily: 'Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(1);
    
    // Generate 3 card options
    const cardOptions = this.generateCardOptions();
    
    // Display card options - centered with proper spacing
    const CARD_WIDTH = 140;
    const CARD_HEIGHT = 210;
    const cardSpacing = 60;
    const totalWidth = (CARD_WIDTH * 3) + (cardSpacing * 2);
    const startX = (width - totalWidth) / 2 + (CARD_WIDTH / 2);
    const cardY = height / 2 + 20;
    
    cardOptions.forEach((card, index) => {
      this.createCardOption(card, startX + (index * (CARD_WIDTH + cardSpacing)), cardY);
    });
    
    // Continue button (disabled until card is selected) - use same lock button as battle
    const continueBtnContainer = this.add.container(width / 2, height - 120);
    continueBtnContainer.setDepth(1);
    
    const lockButtonImage = this.add.image(0, 0, 'lock_button');
    lockButtonImage.setDisplaySize(120, 80);
    lockButtonImage.setAlpha(0.5); // Start disabled
    lockButtonImage.setInteractive({ useHandCursor: false });
    continueBtnContainer.add(lockButtonImage);
    
    // Store reference for updating
    (this as any).continueBtn = continueBtnContainer;
    (this as any).lockButtonImage = lockButtonImage;
    
    lockButtonImage.on('pointerover', () => {
      if (this.selectedCard) {
        lockButtonImage.setTint(0xcccccc);
      }
    });
    
    lockButtonImage.on('pointerout', () => {
      lockButtonImage.clearTint();
    });
    
    lockButtonImage.on('pointerdown', () => {
      if (!this.selectedCard) return;
      
      console.log('[LootScene] Player selected:', this.selectedCard.name);
      
      // Add card to player's inventory
      addCardToDeck(this.userId, this.selectedCard);
      
      // Disable button
      lockButtonImage.disableInteractive();
      
      // Transition back to map with fade
      this.transitionToMap();
    });
  }
  
  private generateCardOptions(): Card[] {
    const myPlayer = this.players.find(p => p.userId === this.userId);
    const myClass = myPlayer?.class || 'Warrior';
    
    const options: Card[] = [];
    
    // Always include 1 consumable item
    const consumables = [...NEUTRAL_CONSUMABLE_ITEMS];
    const randomConsumable = consumables[Math.floor(Math.random() * consumables.length)];
    options.push(randomConsumable);
    
    // Add 2 more cards (can be class-specific or reusable items)
    const classCards = getCardsForClass(myClass);
    const reusableItems = [...NEUTRAL_REUSABLE_ITEMS];
    const allPossibleCards = [...classCards, ...reusableItems];
    
    // Filter out the already selected consumable
    const remainingCards = allPossibleCards.filter(c => c.id !== randomConsumable.id);
    
    // Shuffle and pick 2
    for (let i = remainingCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingCards[i], remainingCards[j]] = [remainingCards[j], remainingCards[i]];
    }
    
    options.push(...remainingCards.slice(0, 2));
    
    console.log('[LootScene] Generated card options:', options.map(c => c.name));
    return options;
  }
  
  private createCardOption(card: Card, x: number, y: number): void {
    const CARD_WIDTH = 140;
    const CARD_HEIGHT = 210;
    
    const container = this.add.container(x, y);
    container.setDepth(1);
    
    // Card background image based on type (same as in-game)
    const imageKey = `card_${card.type}`;
    const cardImage = this.add.image(0, 0, imageKey);
    cardImage.setDisplaySize(CARD_WIDTH, CARD_HEIGHT);
    cardImage.setName('cardImage');
    
    // Apply gray tint to neutral cards
    if (card.type === 'neutral') {
      cardImage.setTint(0x888888);
    }
    
    container.add(cardImage);
    
    // Border frame
    const border = this.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0);
    border.setStrokeStyle(3, 0x444444, 0.8);
    border.setName('border');
    container.add(border);
    
    // Card name (split multi-word titles vertically like in game)
    const words = card.name.split(' ');
    const displayText = words.length > 1 ? words.join('\n') : card.name;
    
    const nameText = this.add.text(0, -CARD_HEIGHT / 2 + 50, displayText, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 4,
      lineSpacing: -5,
    });
    nameText.setOrigin(0.5);
    container.add(nameText);
    
    // AP cost badge (top right corner like in game)
    const apBadge = this.add.container(CARD_WIDTH / 2 - 8, -CARD_HEIGHT / 2 + 8);
    
    const apBg = this.add.circle(0, 0, 12, 0x000000, 0.9);
    apBg.setStrokeStyle(2, 0xffaa00, 1);
    apBadge.add(apBg);
    
    const apText = this.add.text(0, 0, `${card.ap}`, {
      fontSize: '14px',
      color: '#ffaa00',
      fontFamily: 'Arial',
      fontStyle: 'bold',
    });
    apText.setOrigin(0.5);
    apBadge.add(apText);
    
    container.add(apBadge);
    
    // Description
    const descText = this.add.text(0, 20, card.desc, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'Arial',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 20 },
      stroke: '#000000',
      strokeThickness: 3,
      lineSpacing: -3,
    });
    descText.setOrigin(0.5);
    container.add(descText);
    
    // Make interactive
    border.setInteractive({ useHandCursor: true });
    
    border.on('pointerover', () => {
      border.setStrokeStyle(4, 0xffffff, 1);
      this.tweens.add({
        targets: container,
        scale: 1.08,
        duration: 150,
        ease: 'Power2',
      });
    });
    
    border.on('pointerout', () => {
      if (this.selectedCard?.id !== card.id) {
        border.setStrokeStyle(3, 0x444444, 0.8);
        this.tweens.add({
          targets: container,
          scale: 1,
          duration: 150,
          ease: 'Power2',
        });
      }
    });
    
    border.on('pointerdown', () => {
      this.selectCard(card, container, border);
    });
    
    // Store reference for selection tracking
    (container as any).cardId = card.id;
    (container as any).cardBorder = border;
  }
  
  private selectCard(card: Card, container: Phaser.GameObjects.Container, cardBorder: Phaser.GameObjects.Rectangle): void {
    // Deselect previous card
    if (this.selectedCard) {
      this.children.list.forEach(child => {
        if (child instanceof Phaser.GameObjects.Container && (child as any).cardId === this.selectedCard?.id) {
          this.tweens.add({
            targets: child,
            scale: 1,
            duration: 150,
            ease: 'Power2',
          });
          ((child as any).cardBorder as Phaser.GameObjects.Rectangle).setStrokeStyle(3, 0x444444, 0.8);
        }
      });
    }
    
    // Select new card
    this.selectedCard = card;
    this.tweens.add({
      targets: container,
      scale: 1.12,
      duration: 150,
      ease: 'Power2',
    });
    cardBorder.setStrokeStyle(5, 0x44ff44, 1);
    
    // Enable continue button
    const lockButtonImage = (this as any).lockButtonImage as Phaser.GameObjects.Image;
    if (lockButtonImage) {
      lockButtonImage.setAlpha(1);
      lockButtonImage.setInteractive({ useHandCursor: true });
      
      // Add pulse animation
      const continueBtn = (this as any).continueBtn as Phaser.GameObjects.Container;
      if (continueBtn) {
        this.tweens.add({
          targets: continueBtn,
          scale: 1.05,
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
    
    console.log('[LootScene] Selected card:', card.name);
  }
  
  private transitionToMap(): void {
    // Prevent duplicate transitions
    if (this.hasTransitioned) {
      console.log('[LootScene] Already transitioning, skipping...');
      return;
    }
    this.hasTransitioned = true;
    
    console.log('[LootScene] Transitioning to map...');
    console.log('[LootScene] Current node:', this.currentNodeId);
    console.log('[LootScene] Visited nodes before:', this.visitedNodes);
    
    // Mark the battle node as visited before returning to map
    if (this.currentNodeId && !this.visitedNodes.includes(this.currentNodeId)) {
      this.visitedNodes.push(this.currentNodeId);
      console.log('[LootScene] Marked node as visited:', this.currentNodeId);
    }
    
    console.log('[LootScene] Visited nodes after:', this.visitedNodes);
    
    // Fade to black
    const { width, height } = this.cameras.main;
    const fadeOut = this.add.rectangle(0, 0, width, height, 0x000000, 0);
    fadeOut.setOrigin(0);
    fadeOut.setDepth(20000);
    
    this.tweens.add({
      targets: fadeOut,
      alpha: 1,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        // Transition back to map (map will fade in)
        this.scene.start('MapScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.mapSeed,
          visitedNodes: this.visitedNodes,
          currentNodeId: this.currentNodeId,
          stage: this.stage,
          selectedCard: this.selectedCard, // Pass selected card to be added to deck
        });
      }
    });
  }
}

