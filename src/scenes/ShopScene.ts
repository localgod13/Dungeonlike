import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { SoundManager } from '../game/sound';
import { subscribeMap, sendMapVote, sendMapVoteResult } from '../net/match';

/**
 * Shop scene - Template for item purchasing
 */
export class ShopScene extends Phaser.Scene {
  private soundManager: SoundManager | null = null;
  private lobbyId: string | null = null;
  private players: any[] = [];
  private mapSeed: number | null = null;
  private visitedNodes: string[] = [];
  private currentNodeId: string | null = null;
  private currentStage = 1; // Track battle stage number
  
  // Shop data
  private items: ShopItem[] = [];
  private playerGold = 100; // TODO: Get from player data
  
  // UI elements
  private titleText: Phaser.GameObjects.Text | null = null;
  private goldText: Phaser.GameObjects.Text | null = null;
  private itemContainer: Phaser.GameObjects.Container | null = null;
  private continueButton: Phaser.GameObjects.Text | null = null;

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
    this.currentStage = data.stage || 1; // Receive stage number
    
    console.log('ShopScene initialized with node:', data.nodeId);
    console.log('Current stage:', this.currentStage);
  }

  async create(): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;

    // Fantasy dark background
    this.cameras.main.setBackgroundColor('#0d0820');
    this.createFantasyBackground();

    // Initialize sound
    this.soundManager = new SoundManager(this);

    // Generate shop items
    this.generateShopItems();

    // Get current user and determine if host
    this.userId = await this.getCurrentUserId();
    this.isHost = this.players.length > 0 && this.players[0].userId === this.userId;

    // Create UI
    this.createTitle();
    this.createGoldDisplay();
    this.createItemGrid();
    this.createContinueButton();

    // Setup voting if multiple players
    if (this.players.length > 1 && this.lobbyId) {
      this.setupVoting();
    }

    // Play shop music (if available)
    this.soundManager?.playMusic('shop', { loop: true, volume: 0.3 });
  }

  private async getCurrentUserId(): Promise<string | null> {
    try {
      const { getCurrentUserId } = await import('../net/supa');
      return await getCurrentUserId();
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  private setupVoting(): void {
    if (!this.lobbyId) return;

    subscribeMap(this.lobbyId, {
      onMapVote: this.handleRemoteVote.bind(this),
      onMapVoteResult: this.handleVoteResult.bind(this),
    }).then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
      console.log('Shop voting system initialized');
    }).catch((error) => {
      console.error('Failed to setup shop voting:', error);
    });
  }

  private handleRemoteVote(userId: string, itemId: string): void {
    console.log(`Remote shop vote from ${userId}: ${itemId}`);
    
    if (userId === this.userId) return;
    
    if (!this.shopVotes) {
      this.shopVotes = new Map<string, string>();
    }
    this.shopVotes.set(userId, itemId);
    this.updateVotingUI();
    
    if (this.isHost) {
      this.checkAllVotesIn();
    }
  }

  private handleVoteResult(selectedItemId: string, votes: { [itemId: string]: string[] }): void {
    console.log('🎯 RECEIVED SHOP VOTE RESULT:', selectedItemId, votes);
    this.executeVoteResult(selectedItemId);
  }

  private executeVoteResult(selectedItemId: string): void {
    console.log('🎯 EXECUTING VOTE RESULT:', selectedItemId);
    
    if (selectedItemId === 'continue') {
      this.continueToMap();
    } else {
      // Purchase the selected item
      const item = this.items.find(i => i.id === selectedItemId);
      if (item) {
        this.purchaseItemDirectly(item);
      }
    }
  }

  private checkAllVotesIn(): void {
    if (!this.isHost) return;
    
    const totalPlayers = this.players.length;
    const votesReceived = (this.shopVotes?.size || 0) + (this.myVote ? 1 : 0);
    
    if (votesReceived >= totalPlayers) {
      console.log('All shop votes received, resolving...');
      this.resolveVotes();
    }
  }

  private resolveVotes(): void {
    // Count votes for each item + continue option
    const voteCounts = new Map<string, string[]>();
    
    // Add remote votes
    if (this.shopVotes) {
      for (const [userId, itemId] of this.shopVotes.entries()) {
        if (!voteCounts.has(itemId)) {
          voteCounts.set(itemId, []);
        }
        voteCounts.get(itemId)!.push(userId);
      }
    }
    
    // Add my vote
    if (this.myVote) {
      if (!voteCounts.has(this.myVote)) {
        voteCounts.set(this.myVote, []);
      }
      voteCounts.get(this.myVote)!.push(this.userId!);
    }
    
    // Find winner(s)
    let maxVotes = 0;
    let winningOptions: string[] = [];
    
    for (const [option, voters] of voteCounts.entries()) {
      if (voters.length > maxVotes) {
        maxVotes = voters.length;
        winningOptions = [option];
      } else if (voters.length === maxVotes) {
        winningOptions.push(option);
      }
    }
    
    // Select winner (coin toss if tie)
    const selectedOption = winningOptions[Math.floor(Math.random() * winningOptions.length)];
    
    console.log(`Shop vote resolution: ${selectedOption} wins with ${maxVotes} votes`);
    
    // Convert Map to object for network
    const votesObject: { [itemId: string]: string[] } = {};
    for (const [itemId, voters] of voteCounts.entries()) {
      votesObject[itemId] = voters;
    }
    
    // Broadcast result
    if (this.lobbyId) {
      sendMapVoteResult(this.lobbyId, selectedOption, votesObject).catch(err => {
        console.error('Failed to send shop vote result:', err);
      });
    }
    
    // Host should also execute the result directly (in case network fails)
    console.log('🎯 HOST EXECUTING RESULT DIRECTLY:', selectedOption);
    this.executeVoteResult(selectedOption);
  }

  private updateVotingUI(): void {
    // Remove old UI
    if (this.votingUI) {
      this.votingUI.destroy();
    }
    
    if (this.players.length <= 1) return;
    
    // Create voting status UI
    this.votingUI = this.add.container(50, this.scale.height - 100);
    this.votingUI.setScrollFactor(0);
    this.votingUI.setDepth(1000);
    
    const bg = this.add.rectangle(0, 0, 300, 80, 0x1a0f2e, 0.9);
    bg.setStrokeStyle(2, 0x8b7355, 0.8);
    this.votingUI.add(bg);
    
    // Voting status text
    const totalPlayers = this.players.length;
    const votesReceived = (this.shopVotes?.size || 0) + (this.myVote ? 1 : 0);
    
    const statusText = this.add.text(0, -15, 'Voting for Purchase...', {
      fontSize: '16px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });
    statusText.setOrigin(0.5);
    this.votingUI.add(statusText);
    
    const progressText = this.add.text(0, 10, `${votesReceived}/${totalPlayers} votes`, {
      fontSize: '14px',
      color: '#b8a890',
      fontFamily: 'Georgia, serif',
    });
    progressText.setOrigin(0.5);
    this.votingUI.add(progressText);
    
    // Show current vote
    if (this.myVote) {
      const myVoteText = this.add.text(0, 30, `Your vote: ${this.myVote === 'continue' ? 'Continue' : this.getItemName(this.myVote)}`, {
        fontSize: '12px',
        color: '#44ff88',
        fontFamily: 'Georgia, serif',
      });
      myVoteText.setOrigin(0.5);
      this.votingUI.add(myVoteText);
    }
  }

  private getItemName(itemId: string): string {
    const item = this.items.find(i => i.id === itemId);
    return item ? item.name : 'Unknown';
  }

  private createFantasyBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Create gradient background
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x0d0820, 0x0d0820, 0x1a0f2e, 0x1a0f2e, 1, 1, 1, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.setDepth(-100);
    
    // Add decorative elements
    this.createCornerDecorations();
  }

  private createCornerDecorations(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Corner scrolls
    const scrollGraphics = this.add.graphics();
    scrollGraphics.lineStyle(3, 0x8b7355, 0.6);
    
    // Top-left scroll
    scrollGraphics.beginPath();
    scrollGraphics.moveTo(50, 50);
    scrollGraphics.lineTo(150, 50);
    scrollGraphics.lineTo(170, 70);
    scrollGraphics.lineTo(150, 90);
    scrollGraphics.lineTo(50, 90);
    scrollGraphics.lineTo(30, 70);
    scrollGraphics.closePath();
    scrollGraphics.strokePath();
    
    // Top-right scroll
    scrollGraphics.beginPath();
    scrollGraphics.moveTo(width - 50, 50);
    scrollGraphics.lineTo(width - 150, 50);
    scrollGraphics.lineTo(width - 170, 70);
    scrollGraphics.lineTo(width - 150, 90);
    scrollGraphics.lineTo(width - 50, 90);
    scrollGraphics.lineTo(width - 30, 70);
    scrollGraphics.closePath();
    scrollGraphics.strokePath();
    
    scrollGraphics.setDepth(-50);
  }

  private createTitle(): void {
    const width = this.scale.width;
    
    // Shop title with glow
    this.titleText = this.add.text(width / 2, 80, 'MYSTERIOUS MERCHANT', {
      fontSize: '48px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#8b7355',
      strokeThickness: 3,
    });
    this.titleText.setOrigin(0.5);
    this.titleText.setDepth(100);

    // Add glow effect
    this.tweens.add({
      targets: this.titleText,
      alpha: { from: 0.8, to: 1.0 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
    });
  }

  private createGoldDisplay(): void {
    const width = this.scale.width;
    
    // Gold display
    const goldBg = this.add.rectangle(width - 120, 80, 200, 50, 0x1a0f2e, 0.9);
    goldBg.setStrokeStyle(2, 0x8b7355, 0.8);
    goldBg.setDepth(50);
    
    this.goldText = this.add.text(width - 120, 80, `💰 ${this.playerGold}`, {
      fontSize: '20px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });
    this.goldText.setOrigin(0.5);
    this.goldText.setDepth(100);
  }

  private generateShopItems(): void {
    // TODO: Generate based on player level, seed, etc.
    this.items = [
      {
        id: 'health_potion',
        name: 'Health Potion',
        description: 'Restores 50 HP',
        cost: 25,
        type: 'consumable',
        icon: '🧪',
      },
      {
        id: 'mana_potion',
        name: 'Mana Potion', 
        description: 'Restores 30 MP',
        cost: 20,
        type: 'consumable',
        icon: '💙',
      },
      {
        id: 'iron_sword',
        name: 'Iron Sword',
        description: '+5 Attack Power',
        cost: 75,
        type: 'weapon',
        icon: '⚔️',
      },
      {
        id: 'leather_armor',
        name: 'Leather Armor',
        description: '+3 Defense',
        cost: 60,
        type: 'armor',
        icon: '🛡️',
      },
    ];
  }

  private createItemGrid(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    this.itemContainer = this.add.container(width / 2, height / 2);
    this.itemContainer.setDepth(50);
    
    // Create item slots (2x2 grid)
    const slotSize = 200;
    const spacing = 50;
    const startX = -slotSize - spacing / 2;
    const startY = -slotSize - spacing / 2;
    
    for (let i = 0; i < Math.min(this.items.length, 4); i++) {
      const item = this.items[i];
      const row = Math.floor(i / 2);
      const col = i % 2;
      
      const x = startX + col * (slotSize + spacing);
      const y = startY + row * (slotSize + spacing);
      
      this.createItemSlot(item, x, y);
    }
  }

  private createItemSlot(item: ShopItem, x: number, y: number): void {
    if (!this.itemContainer) return;
    
    const slotSize = 200;
    
    // Item slot background
    const slotBg = this.add.rectangle(x, y, slotSize, slotSize, 0x1a0f2e, 0.9);
    slotBg.setStrokeStyle(2, 0x8b7355, 0.8);
    slotBg.setInteractive();
    
    // Item icon
    const icon = this.add.text(x, y - 40, item.icon, {
      fontSize: '48px',
    });
    icon.setOrigin(0.5);
    
    // Item name
    const name = this.add.text(x, y, item.name, {
      fontSize: '16px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });
    name.setOrigin(0.5);
    
    // Item description
    const description = this.add.text(x, y + 20, item.description, {
      fontSize: '12px',
      color: '#b8a890',
      fontFamily: 'Georgia, serif',
    });
    description.setOrigin(0.5);
    
    // Item cost
    const cost = this.add.text(x, y + 50, `${item.cost}💰`, {
      fontSize: '14px',
      color: '#ff6b6b',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });
    cost.setOrigin(0.5);
    
    // Purchase button
    const canAfford = this.playerGold >= item.cost;
    const buyButton = this.add.text(x, y + 75, canAfford ? 'VOTE TO BUY' : 'TOO EXPENSIVE', {
      fontSize: '14px',
      color: canAfford ? '#44ff88' : '#666666',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });
    buyButton.setOrigin(0.5);
    
    if (canAfford) {
      buyButton.setInteractive();
      buyButton.on('pointerdown', () => this.voteForItem(item.id));
      buyButton.on('pointerover', () => {
        buyButton.setColor('#66ffaa');
        // TODO: Add UI hover sound
      });
      buyButton.on('pointerout', () => {
        buyButton.setColor('#44ff88');
      });
    }
    
    // Add all elements to container
    this.itemContainer.add([slotBg, icon, name, description, cost, buyButton]);
  }

  private async voteForItem(itemId: string): Promise<void> {
    if (this.players.length > 1) {
      // Multiplayer: Vote for item
      this.myVote = itemId;
      this.updateVotingUI();
      
      if (this.lobbyId) {
        try {
          await sendMapVote(this.lobbyId, itemId);
          console.log(`Voted for item: ${itemId}`);
        } catch (error) {
          console.error('Failed to send shop vote:', error);
        }
      }
      
      if (this.isHost) {
        this.checkAllVotesIn();
      }
    } else {
      // Single player: Direct purchase
      const item = this.items.find(i => i.id === itemId);
      if (item) {
        this.purchaseItemDirectly(item);
      }
    }
  }

  private purchaseItemDirectly(item: ShopItem): void {
    if (this.playerGold < item.cost) {
      console.log('Cannot afford item');
      return;
    }
    
    this.playerGold -= item.cost;
    console.log(`✅ Purchased ${item.name} for ${item.cost} gold. New balance: ${this.playerGold}`);
    
    // TODO: Add item to player inventory
    
    // Update gold display
    if (this.goldText) {
      this.goldText.setText(`💰 ${this.playerGold}`);
    }
    
    // Refresh item grid
    this.itemContainer?.destroy();
    this.createItemGrid();
  }

  private createContinueButton(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    this.continueButton = this.add.text(width / 2, height - 80, 'CONTINUE JOURNEY', {
      fontSize: '24px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#8b7355',
      strokeThickness: 2,
    });
    this.continueButton.setOrigin(0.5);
    this.continueButton.setInteractive();
    this.continueButton.setDepth(100);
    
    this.continueButton.on('pointerdown', () => this.voteToContinue());
    this.continueButton.on('pointerover', () => {
      this.continueButton?.setColor('#f4e4bc');
      // TODO: Add UI hover sound
    });
    this.continueButton.on('pointerout', () => {
      this.continueButton?.setColor('#d4af37');
    });
  }

  private async voteToContinue(): Promise<void> {
    if (this.players.length > 1) {
      // Multiplayer: Vote to continue
      this.myVote = 'continue';
      this.updateVotingUI();
      
      if (this.lobbyId) {
        try {
          await sendMapVote(this.lobbyId, 'continue');
          console.log('Voted to continue');
        } catch (error) {
          console.error('Failed to send continue vote:', error);
        }
      }
      
      if (this.isHost) {
        this.checkAllVotesIn();
      }
    } else {
      // Single player: Direct continue
      this.continueToMap();
    }
  }

  private continueToMap(): void {
    // Mark this node as visited
    if (this.currentNodeId) {
      this.visitedNodes.push(this.currentNodeId);
    }
    
    // Return to map
    this.scene.start('MapScene', {
      lobbyId: this.lobbyId,
      players: this.players,
      mapSeed: this.mapSeed,
      visitedNodes: this.visitedNodes,
      currentNodeId: this.currentNodeId,
      stage: this.currentStage, // Pass stage back to map
    });
  }

  shutdown(): void {
    // Cleanup
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

// Item data structure
interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'weapon' | 'armor' | 'consumable' | 'accessory';
  icon: string;
}
