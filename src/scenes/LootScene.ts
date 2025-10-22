import Phaser from 'phaser';
import { Card, NEUTRAL_CONSUMABLE_ITEMS, NEUTRAL_REUSABLE_ITEMS, getCardsForClass, getAdvancedCardsForClass } from '../game/cards';
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
  
  private selectedCard: Card | null = null;
  private isReady: boolean = false;
  private userId: string = '';

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
    
    this.selectedCard = null;
    this.isReady = false;
    
    console.log('[LootScene] Initialized with gold:', this.goldReward);
  }

  async create(): Promise<void> {
    const { width, height } = this.cameras.main;
    
    // Get user ID
    this.userId = await getCurrentUserId();
    console.log('[LootScene] User ID:', this.userId);
    
    // Add gold to player's inventory
    addGold(this.userId, this.goldReward);
    const totalGold = getGold(this.userId);
    
    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);
    
    // Title
    const title = this.add.text(width / 2, 60, '🎉 Victory! 🎉', {
      fontSize: '48px',
      fontFamily: 'Arial Black',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);
    
    // Gold reward display
    const goldText = this.add.text(width / 2, 140, `💰 +${this.goldReward} Gold (Total: ${totalGold})`, {
      fontSize: '36px',
      fontFamily: 'Arial',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    
    // Subtitle
    const subtitle = this.add.text(width / 2, 200, 'Choose 1 card to add to your deck:', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#ffffff',
    }).setOrigin(0.5);
    
    // Generate 3 card options
    const cardOptions = this.generateCardOptions();
    
    // Display card options
    const startX = width / 2 - 350;
    const cardY = 320;
    const cardSpacing = 250;
    
    cardOptions.forEach((card, index) => {
      this.createCardOption(card, startX + (index * cardSpacing), cardY);
    });
    
    // Continue button (disabled until card is selected)
    const continueBtn = this.add.text(width / 2, height - 80, 'Continue to Map', {
      fontSize: '28px',
      fontFamily: 'Arial',
      color: '#888888',
      backgroundColor: '#333333',
      padding: { x: 30, y: 15 },
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: false });
    
    // Store reference for updating
    (this as any).continueBtn = continueBtn;
    
    continueBtn.on('pointerdown', () => {
      if (!this.selectedCard) return;
      
      console.log('[LootScene] Player selected:', this.selectedCard.name);
      
      // Add card to player's inventory
      addCardToDeck(this.userId, this.selectedCard);
      
      // Transition back to map
      this.transitionToMap();
    });
  }
  
  private generateCardOptions(): Card[] {
    const myPlayer = this.players.find(p => p.userId === this.userId);
    const myClass = myPlayer?.class || 'Warrior';
    
    const options: Card[] = [];
    
    // 40% chance for consumable, 60% chance for advanced card
    const includeConsumable = Math.random() < 0.4;
    
    if (includeConsumable) {
      const consumables = [...NEUTRAL_CONSUMABLE_ITEMS];
      const randomConsumable = consumables[Math.floor(Math.random() * consumables.length)];
      options.push(randomConsumable);
      console.log('[LootScene] ⚠️ Added consumable to options');
    }
    
    // Build card pool with weighted selection
    const advancedCards = getAdvancedCardsForClass(myClass);
    const classCards = getCardsForClass(myClass);
    const reusableItems = [...NEUTRAL_REUSABLE_ITEMS];
    
    // Weight: 50% advanced, 30% base class, 20% reusable
    const weightedPool: Card[] = [
      ...advancedCards,
      ...advancedCards, // 2x weight
      ...classCards,
      ...reusableItems,
    ];
    
    // Shuffle the pool
    for (let i = weightedPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [weightedPool[i], weightedPool[j]] = [weightedPool[j], weightedPool[i]];
    }
    
    // Pick cards, ensuring no duplicates
    const seenIds = new Set(options.map(c => c.id));
    for (const card of weightedPool) {
      if (!seenIds.has(card.id)) {
        options.push(card);
        seenIds.add(card.id);
        if (options.length >= 3) break;
      }
    }
    
    // If we still need more cards (shouldn't happen), add remaining
    if (options.length < 3) {
      const backup = [...advancedCards, ...classCards, ...reusableItems]
        .filter(c => !seenIds.has(c.id));
      options.push(...backup.slice(0, 3 - options.length));
    }
    
    console.log('[LootScene] 🎁 Generated card options:', options.map(c => `${c.name} (${c.class || 'neutral'})`));
    return options;
  }
  
  private createCardOption(card: Card, x: number, y: number): void {
    const container = this.add.container(x, y);
    
    // Card background
    const cardBg = this.add.rectangle(0, 0, 200, 280, 0x2c3e50)
      .setStrokeStyle(3, 0x34495e);
    
    // Card type indicator
    let bgColor = 0x2c3e50;
    if (card.type === 'attack') bgColor = 0xc0392b;
    else if (card.type === 'defense') bgColor = 0x3498db;
    else if (card.type === 'magic') bgColor = 0x9b59b6;
    else if (card.type === 'neutral') bgColor = 0x7f8c8d;
    
    const typeBg = this.add.rectangle(0, -100, 200, 60, bgColor);
    
    // Card name
    const nameText = this.add.text(0, -100, card.name, {
      fontSize: '18px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 180 },
    }).setOrigin(0.5);
    
    // AP cost
    const apBadge = this.add.circle(-80, -100, 18, 0xf39c12);
    const apText = this.add.text(-80, -100, card.ap.toString(), {
      fontSize: '20px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
    }).setOrigin(0.5);
    
    // Card description
    const descText = this.add.text(0, 0, card.desc, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#ecf0f1',
      align: 'center',
      wordWrap: { width: 180 },
    }).setOrigin(0.5);
    
    // Consumable badge if applicable
    if (NEUTRAL_CONSUMABLE_ITEMS.some(c => c.id === card.id)) {
      const consumableBadge = this.add.text(0, 120, '⚠️ Consumable', {
        fontSize: '12px',
        fontFamily: 'Arial',
        color: '#e74c3c',
        backgroundColor: '#000000',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5);
      container.add(consumableBadge);
    }
    
    container.add([cardBg, typeBg, nameText, apBadge, apText, descText]);
    
    // Make interactive
    cardBg.setInteractive({ useHandCursor: true });
    
    cardBg.on('pointerover', () => {
      cardBg.setStrokeStyle(4, 0xffd700);
      container.setScale(1.05);
    });
    
    cardBg.on('pointerout', () => {
      if (this.selectedCard?.id !== card.id) {
        cardBg.setStrokeStyle(3, 0x34495e);
      }
      if (this.selectedCard?.id !== card.id) {
        container.setScale(1);
      }
    });
    
    cardBg.on('pointerdown', () => {
      this.selectCard(card, container, cardBg);
    });
    
    // Store reference for selection tracking
    (container as any).cardId = card.id;
    (container as any).cardBg = cardBg;
  }
  
  private selectCard(card: Card, container: Phaser.GameObjects.Container, cardBg: Phaser.GameObjects.Rectangle): void {
    // Deselect previous card
    if (this.selectedCard) {
      this.children.list.forEach(child => {
        if (child instanceof Phaser.GameObjects.Container && (child as any).cardId === this.selectedCard?.id) {
          child.setScale(1);
          ((child as any).cardBg as Phaser.GameObjects.Rectangle).setStrokeStyle(3, 0x34495e);
        }
      });
    }
    
    // Select new card
    this.selectedCard = card;
    container.setScale(1.1);
    cardBg.setStrokeStyle(4, 0xffd700);
    
    // Enable continue button
    const continueBtn = (this as any).continueBtn as Phaser.GameObjects.Text;
    if (continueBtn) {
      continueBtn.setColor('#ffffff');
      continueBtn.setBackgroundColor('#27ae60');
      continueBtn.setInteractive({ useHandCursor: true });
    }
    
    console.log('[LootScene] Selected card:', card.name);
  }
  
  private transitionToMap(): void {
    console.log('[LootScene] Transitioning to map...');
    console.log('[LootScene] Current node:', this.currentNodeId);
    console.log('[LootScene] Visited nodes before:', this.visitedNodes);
    
    // Mark the battle node as visited before returning to map
    if (this.currentNodeId && !this.visitedNodes.includes(this.currentNodeId)) {
      this.visitedNodes.push(this.currentNodeId);
      console.log('[LootScene] Marked node as visited:', this.currentNodeId);
    }
    
    console.log('[LootScene] Visited nodes after:', this.visitedNodes);
    
    // Transition back to map
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
}

