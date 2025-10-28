import Phaser from 'phaser';
import { Card, getAllAvailableCardsForClass } from '../game/cards';
import { SoundManager } from '../game/sound';
import { subscribeMap, sendMapVote, sendMapVoteResult } from '../net/match';
import { getGold, spendGold, initializeInventory, addCardToDeck } from '../game/inventory';
import { getCurrentUserId } from '../net/supa';
import { setupCustomCursor } from '../utils/cursor';

/**
 * Shop scene - Purchase cards with goldc
 */
export class ShopScene extends Phaser.Scene {
  private soundManager: SoundManager | null = null;
  private lobbyId: string | null = null;
  private players: any[] = [];
  private mapSeed: number | null = null;
  private visitedNodes: string[] = [];
  private currentNodeId: string | null = null;
  private currentStage = 1;
  private hasTransitioned = false; // Prevent duplicate scene transitions
  
  // Shop data
  private shopCards: ShopCard[] = [];
  private playerGold = 0;
  private userId: string = '';
  private isHost = false;
  
  // UI elements
  private titleText: Phaser.GameObjects.Text | null = null;
  private goldText: Phaser.GameObjects.Text | null = null;
  private cardContainers: Phaser.GameObjects.Container[] = [];
  private continueButton: Phaser.GameObjects.Container | null = null;
  private fadeOverlay: Phaser.GameObjects.Rectangle | null = null;
  
  // Ready system (no more voting on purchases)
  private readyPlayers = new Set<string>(); // Track which players are ready to continue
  private readyIndicators: Phaser.GameObjects.Container | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super({ key: 'ShopScene' });
  }

  init(data: { 
    lobbyId?: string; 
    players?: any[]; 
    mapSeed?: number; 
    visitedNodes?: string[]; 
    currentNodeId?: string;
    nodeId?: string;
    stage?: number;
  }): void {
    this.lobbyId = data.lobbyId || null;
    this.players = data.players || [];
    this.mapSeed = data.mapSeed || null;
    this.visitedNodes = data.visitedNodes || [];
    this.currentNodeId = data.currentNodeId || null;
    this.currentStage = data.stage || 1;
    this.hasTransitioned = false; // Reset transition flag for new scene instance
    
    console.log('[ShopScene] Initialized with node:', data.nodeId);
    console.log('[ShopScene] Current stage:', this.currentStage);
  }

  async create(): Promise<void> {
    // Set up custom cursor
    setupCustomCursor(this);
    const width = this.scale.width;
    const height = this.scale.height;

    // Get current user and load gold from inventory
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('[ShopScene] Failed to get user ID');
      return;
    }
    this.userId = userId;
    initializeInventory(this.userId);
    this.playerGold = getGold(this.userId);
    console.log('[ShopScene] Player gold:', this.playerGold);
    
    this.isHost = this.players.length > 0 && this.players[0].userId === this.userId;

    // Fantasy dark background
    this.cameras.main.setBackgroundColor('#0d0820');
    this.createFantasyBackground();
    
    // Fade-in from black
    this.fadeOverlay = this.add.rectangle(0, 0, width, height, 0x000000, 1);
    this.fadeOverlay.setOrigin(0);
    this.fadeOverlay.setDepth(50000);
    
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

    // Initialize sound
    this.soundManager = new SoundManager(this);

    // Generate shop cards
    this.generateShopCards();

    // Create UI
    this.createTitle();
    this.createGoldDisplay();
    this.createCardGrid();
    this.createContinueButton();

    // Setup ready system if multiple players
    if (this.players.length > 1 && this.lobbyId) {
      this.setupReadySystem();
      this.updateReadyIndicators();
    }

    // Play merchant music
    this.soundManager?.playMusic('music_merchant', { loop: true, volume: 0.3 });
  }

  private setupReadySystem(): void {
    if (!this.lobbyId) return;

    subscribeMap(this.lobbyId, {
      onMapVote: this.handleRemoteReady.bind(this),
      onMapVoteResult: this.handleAllReady.bind(this),
    }).then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
      console.log('[ShopScene] Ready system initialized');
    }).catch((error) => {
      console.error('[ShopScene] Failed to setup ready system:', error);
    });
  }

  private handleRemoteReady(userId: string, readyStatus: string): void {
    console.log(`[ShopScene] Remote ready from ${userId}: ${readyStatus}`);
    
    if (userId === this.userId) return;
    
    // Mark player as ready
    if (readyStatus === 'ready') {
      this.readyPlayers.add(userId);
      console.log(`[ShopScene] ${userId} is ready to continue`);
      this.updateReadyIndicators();
      
      if (this.isHost) {
        this.checkAllPlayersReady();
      }
    }
  }

  private handleAllReady(signal: string, data: any): void {
    console.log('[ShopScene] Received all ready signal');
    
    // Prevent duplicate execution if we're the host (we already called this locally)
    if (this.isHost) {
      console.log('[ShopScene] Host ignoring ready signal (already executed locally)');
      return;
    }
    
    this.continueToMap();
  }

  private checkAllPlayersReady(): void {
    if (!this.isHost) return;
    
    const totalPlayers = this.players.length;
    const readyCount = this.readyPlayers.size;
    
    console.log(`[ShopScene] ${readyCount}/${totalPlayers} players ready`);
    
    if (readyCount >= totalPlayers) {
      console.log('[ShopScene] All players ready, continuing to map...');
      
      // Signal all players to continue
      if (this.lobbyId) {
        sendMapVoteResult(this.lobbyId, 'continue', {}).catch(err => {
          console.error('[ShopScene] Failed to send ready signal:', err);
        });
      }
      
      this.continueToMap();
    }
  }

  private createFantasyBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Load merchant background image
    const backgroundImage = this.add.image(width / 2, height / 2, 'merchantbg');
    
    // Scale the image to fit the screen while maintaining aspect ratio
    const scaleX = width / 1536; // 1536 is the original image width
    const scaleY = height / 1024; // 1024 is the original image height
    const scale = Math.max(scaleX, scaleY); // Use the larger scale to ensure full coverage
    backgroundImage.setScale(scale);
    
    // Add a dark overlay for better text readability
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.3);
    overlay.setDepth(-90);
    backgroundImage.setDepth(-100);
    
    // Decorative border
    const border = this.add.graphics();
    border.lineStyle(3, 0xd4af37, 0.3);
    border.strokeRect(20, 20, width - 40, height - 40);
    border.setDepth(-50);
  }

  private createTitle(): void {
    const width = this.scale.width;
    
    this.titleText = this.add.text(width / 2, 60, 'MERCHANT\'S WARES', {
      fontSize: '48px',
      color: '#d4af37',
      fontFamily: 'Arial Black',
      stroke: '#000000',
      strokeThickness: 6,
    });
    this.titleText.setOrigin(0.5);
    this.titleText.setDepth(100);

    this.tweens.add({
      targets: this.titleText,
      alpha: { from: 0.9, to: 1.0 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
    });
  }

  private createGoldDisplay(): void {
    const width = this.scale.width;
    
    this.goldText = this.add.text(width - 30, 30, `💰 ${this.playerGold} Gold`, {
      fontSize: '28px',
      color: '#ffd700',
      fontFamily: 'Arial Black',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.goldText.setOrigin(1, 0);
    this.goldText.setDepth(100);
  }

  private generateShopCards(): void {
    const myPlayer = this.players.find(p => p.userId === this.userId);
    const myClass = myPlayer?.class || 'Warrior';
    
    // Get all available cards for the player's class
    const allCards = getAllAvailableCardsForClass(myClass);
    
    // Shuffle cards
    const shuffled = [...allCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Base prices for card types
    const basePrice = 40;
    
    // Pick 6 cards with pricing tiers
    const selectedCards = shuffled.slice(0, 6);
    
    this.shopCards = selectedCards.map((card, index) => {
      let discount = 0;
      let discountLabel = '';
      
      if (index < 2) {
        // First 2: Normal price
        discount = 0;
        discountLabel = '';
      } else if (index < 5) {
        // Next 3: 25% off
        discount = 0.25;
        discountLabel = '25% OFF';
      } else {
        // Last 1: 50% off
        discount = 0.5;
        discountLabel = '50% OFF!';
      }
      
      const price = Math.round(basePrice * (1 - discount));
      
      return {
        card,
        price,
        discount,
        discountLabel,
      };
    });
    
    console.log('[ShopScene] Generated shop cards:', this.shopCards.map(sc => ({
      name: sc.card.name,
      price: sc.price,
      discount: sc.discountLabel
    })));
  }

  private createCardGrid(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    const CARD_WIDTH = 140;
    const CARD_HEIGHT = 210;
    const CARD_SPACING = 30;
    
    // 3x2 grid layout
    const cardsPerRow = 3;
    const rows = 2;
    
    const totalWidth = (CARD_WIDTH * cardsPerRow) + (CARD_SPACING * (cardsPerRow - 1));
    const totalHeight = (CARD_HEIGHT * rows) + (CARD_SPACING * (rows - 1));
    
    const startX = (width - totalWidth) / 2 + (CARD_WIDTH / 2);
    const startY = (height - totalHeight) / 2 + 80;
    
    this.shopCards.forEach((shopCard, index) => {
      const row = Math.floor(index / cardsPerRow);
      const col = index % cardsPerRow;
      
      const x = startX + col * (CARD_WIDTH + CARD_SPACING);
      const y = startY + row * (CARD_HEIGHT + CARD_SPACING);
      
      this.createShopCard(shopCard, x, y);
    });
  }

  private createShopCard(shopCard: ShopCard, x: number, y: number): void {
    const CARD_WIDTH = 140;
    const CARD_HEIGHT = 210;
    
    const container = this.add.container(x, y);
    container.setDepth(10);
    
    // Card background image based on type
    const imageKey = `card_${shopCard.card.type}`;
    const cardImage = this.add.image(0, 0, imageKey);
    cardImage.setDisplaySize(CARD_WIDTH, CARD_HEIGHT);
    
    if (shopCard.card.type === 'neutral') {
      cardImage.setTint(0x888888);
    }
    
    container.add(cardImage);
    
    // Border frame
    const canAfford = this.playerGold >= shopCard.price;
    const border = this.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0);
    border.setStrokeStyle(3, canAfford ? 0x444444 : 0xff4444, 0.8);
    container.add(border);
    
    // Card name
    const words = shopCard.card.name.split(' ');
    const displayText = words.length > 1 ? words.join('\n') : shopCard.card.name;
    
    const nameText = this.add.text(0, -CARD_HEIGHT / 2 + 50, displayText, {
      fontSize: '15px',
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
    
    // AP badge
    const apBadge = this.add.container(CARD_WIDTH / 2 - 8, -CARD_HEIGHT / 2 + 8);
    const apBg = this.add.circle(0, 0, 12, 0x000000, 0.9);
    apBg.setStrokeStyle(2, 0xffaa00, 1);
    apBadge.add(apBg);
    
    const apText = this.add.text(0, 0, `${shopCard.card.ap}`, {
      fontSize: '14px',
      color: '#ffaa00',
      fontFamily: 'Arial',
      fontStyle: 'bold',
    });
    apText.setOrigin(0.5);
    apBadge.add(apText);
    container.add(apBadge);
    
    // Description
    const descText = this.add.text(0, 20, shopCard.card.desc, {
      fontSize: '13px',
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
    
    // Price background
    const priceBg = this.add.rectangle(0, CARD_HEIGHT / 2 - 30, CARD_WIDTH - 10, 50, 0x000000, 0.85);
    container.add(priceBg);
    
    // Discount label (if applicable)
    if (shopCard.discountLabel) {
      const discountBadge = this.add.text(0, CARD_HEIGHT / 2 - 50, shopCard.discountLabel, {
        fontSize: '13px',
        color: '#ffff00',
        fontFamily: 'Arial Black',
        backgroundColor: '#ff4444',
        padding: { x: 6, y: 3 },
        stroke: '#000000',
        strokeThickness: 2,
      });
      discountBadge.setOrigin(0.5);
      container.add(discountBadge);
    }
    
    // Price text
    const priceText = this.add.text(0, CARD_HEIGHT / 2 - 30, `${shopCard.price} Gold`, {
      fontSize: '16px',
      color: canAfford ? '#ffd700' : '#ff4444',
      fontFamily: 'Arial Black',
      stroke: '#000000',
      strokeThickness: 3,
    });
    priceText.setOrigin(0.5);
    container.add(priceText);
    
    // Make interactive if can afford
    if (canAfford) {
      border.setInteractive({ useHandCursor: true });
      
      border.on('pointerover', () => {
        border.setStrokeStyle(4, 0xffffff, 1);
        this.tweens.add({
          targets: container,
          scale: 1.05,
          duration: 150,
          ease: 'Power2',
        });
      });
      
      border.on('pointerout', () => {
        border.setStrokeStyle(3, 0x444444, 0.8);
        this.tweens.add({
          targets: container,
          scale: 1,
          duration: 150,
          ease: 'Power2',
        });
      });
      
      border.on('pointerdown', () => {
        this.purchaseCard(shopCard);
      });
    } else {
      // Show "Can't Afford" text
      const cantAffordText = this.add.text(0, CARD_HEIGHT / 2 - 12, 'Not Enough Gold', {
        fontSize: '11px',
        color: '#ff4444',
        fontFamily: 'Arial',
        fontStyle: 'bold',
      });
      cantAffordText.setOrigin(0.5);
      container.add(cantAffordText);
    }
    
    this.cardContainers.push(container);
  }

  private purchaseCard(shopCard: ShopCard): void {
    if (this.playerGold < shopCard.price) {
      console.log('[ShopScene] Cannot afford card');
      this.showPurchaseFeedback('Not enough gold!', 0xff4444);
      return;
    }
    
    const success = spendGold(this.userId, shopCard.price);
    if (!success) {
      console.log('[ShopScene] Failed to spend gold');
      this.showPurchaseFeedback('Purchase failed!', 0xff4444);
      return;
    }
    
    // Add card to inventory
    addCardToDeck(this.userId, shopCard.card);
    
    this.playerGold = getGold(this.userId);
    console.log(`[ShopScene] Purchased ${shopCard.card.name} for ${shopCard.price} gold. New balance: ${this.playerGold}`);
    
    // Show success feedback
    this.showPurchaseFeedback(`Purchased ${shopCard.card.name}!`, 0x44ff88);
    
    // Update gold display
    if (this.goldText) {
      this.goldText.setText(`💰 ${this.playerGold} Gold`);
      
      // Pulse animation on gold text
      this.tweens.add({
        targets: this.goldText,
        scale: 1.2,
        duration: 200,
        yoyo: true,
        ease: 'Power2',
      });
    }
    
    // Refresh card grid
    this.cardContainers.forEach(c => c.destroy());
    this.cardContainers = [];
    this.generateShopCards();
    this.createCardGrid();
  }
  
  private showPurchaseFeedback(message: string, color: number): void {
    const width = this.scale.width;
    const feedbackText = this.add.text(width / 2, 200, message, {
      fontSize: '32px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontFamily: 'Arial Black',
      stroke: '#000000',
      strokeThickness: 6,
    });
    feedbackText.setOrigin(0.5);
    feedbackText.setDepth(10000);
    feedbackText.setAlpha(0);
    
    // Fade in and out
    this.tweens.add({
      targets: feedbackText,
      alpha: 1,
      duration: 300,
      ease: 'Power2',
      yoyo: true,
      hold: 1000,
      onComplete: () => {
        feedbackText.destroy();
      }
    });
  }

  private createContinueButton(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    this.continueButton = this.add.container(width / 2, height - 100);
    this.continueButton.setDepth(100);
    
    const lockButtonImage = this.add.image(0, 0, 'lock_button');
    lockButtonImage.setDisplaySize(120, 80);
    lockButtonImage.setInteractive({ useHandCursor: true });
    this.continueButton.add(lockButtonImage);
    
    // Pulse animation
    this.tweens.add({
      targets: this.continueButton,
      scale: 1.05,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    lockButtonImage.on('pointerover', () => {
      lockButtonImage.setTint(0xcccccc);
    });
    
    lockButtonImage.on('pointerout', () => {
      lockButtonImage.clearTint();
    });
    
    lockButtonImage.on('pointerdown', () => {
      // Disable button to prevent double-click
      lockButtonImage.disableInteractive();
      lockButtonImage.setAlpha(0.5);
      this.markReady();
    });
  }

  private async markReady(): Promise<void> {
    // Mark self as ready
    if (this.userId) {
      this.readyPlayers.add(this.userId);
      console.log('[ShopScene] Marked self as ready');
    }
    
    this.updateReadyIndicators();
    
    if (this.players.length > 1 && this.lobbyId) {
      // Notify other players
      try {
        await sendMapVote(this.lobbyId, 'ready');
        console.log('[ShopScene] Sent ready signal');
      } catch (error) {
        console.error('[ShopScene] Failed to send ready signal:', error);
      }
      
      if (this.isHost) {
        this.checkAllPlayersReady();
      }
    } else {
      // Single player - continue immediately
      this.continueToMap();
    }
  }

  /**
   * Update ready indicators showing which players are ready to continue
   */
  private updateReadyIndicators(): void {
    // Remove old indicators
    if (this.readyIndicators) {
      this.readyIndicators.destroy();
    }
    
    if (this.players.length <= 1) return;
    
    // Create indicators container
    const width = this.scale.width;
    this.readyIndicators = this.add.container(width - 200, 100);
    this.readyIndicators.setScrollFactor(0);
    this.readyIndicators.setDepth(1100);
    
    // Background
    const bg = this.add.rectangle(0, 0, 180, 40 + (this.players.length * 30), 0x1a0f2e, 0.9);
    bg.setStrokeStyle(2, 0xd4af37, 0.8);
    this.readyIndicators.add(bg);
    
    // Title
    const title = this.add.text(0, -10 - (this.players.length * 15), 'Ready Status', {
      fontSize: '14px',
      color: '#d4af37',
      fontFamily: 'Arial Black',
    });
    title.setOrigin(0.5);
    this.readyIndicators.add(title);
    
    // Player ready status
    this.players.forEach((player, index) => {
      const isReady = this.readyPlayers.has(player.userId);
      const yPos = index * 30 - 5;
      
      // Checkmark or X
      const statusIcon = this.add.text(-70, yPos, isReady ? '✓' : '○', {
        fontSize: '16px',
        color: isReady ? '#44ff88' : '#888888',
        fontFamily: 'Arial Black',
      });
      statusIcon.setOrigin(0.5);
      this.readyIndicators.add(statusIcon);
      
      // Player name
      const nameText = this.add.text(-50, yPos, player.name.substring(0, 10), {
        fontSize: '12px',
        color: isReady ? '#44ff88' : '#ffffff',
        fontFamily: 'Arial',
      });
      nameText.setOrigin(0, 0.5);
      this.readyIndicators.add(nameText);
    });
  }

  private continueToMap(): void {
    // Prevent duplicate transitions
    if (this.hasTransitioned) {
      console.log('[ShopScene] Already transitioning, skipping...');
      return;
    }
    this.hasTransitioned = true;
    console.log('[ShopScene] Starting transition to map...');
    
    // Clear ready indicators
    if (this.readyIndicators) {
      this.readyIndicators.destroy();
      this.readyIndicators = null;
    }
    
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
    // Mark this node as visited
        if (this.currentNodeId && !this.visitedNodes.includes(this.currentNodeId)) {
      this.visitedNodes.push(this.currentNodeId);
    }
    
    // Return to map
    this.scene.start('MapScene', {
      lobbyId: this.lobbyId,
      players: this.players,
      mapSeed: this.mapSeed,
      visitedNodes: this.visitedNodes,
      currentNodeId: this.currentNodeId,
          stage: this.currentStage,
        });
      }
    });
  }

  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  destroy(): void {
    this.shutdown();
    if (this.soundManager) {
      this.soundManager.destroy();
      this.soundManager = null;
    }
  }
}

// Shop card with pricing
interface ShopCard {
  card: Card;
  price: number;
  discount: number;
  discountLabel: string;
}
