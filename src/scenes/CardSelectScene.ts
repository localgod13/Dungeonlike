import Phaser from 'phaser';
import { getCurrentUserId } from '../net/supa';
import {
  subscribeSelection,
  sendSelectPick,
  sendSelectSwap,
  sendSelectReady,
  sendSelectCommit,
} from '../net/match';
import { Loadout } from '../net/proto';
import { CardSelectUI } from '../ui/cardSelectUi';
import { SoundManager } from '../game/sound';
import { getAllAvailableCardsForClass } from '../game/cards';
import { clearPersistedUltimatePower } from '../game/ultimate';
import { setupCustomCursor } from '../utils/cursor';
import { clearAllInventories, initializeInventory, getPermanentDeck, getConsumables, getGold } from '../game/inventory';
import { getCardById } from '../game/cards';

/**
 * Card selection scene - players choose up to 10 cards for their deck before battle
 */

interface Player {
  userId: string;
  name: string;
  isHost: boolean;
  selectedClass?: string; // 'Warrior', 'Huntress', or 'Mage'
}

export class CardSelectScene extends Phaser.Scene {
  private lobbyId: string | null = null;
  private userId: string | null = null;
  private isHost = false;
  private players: Player[] = [];
  private unsubscribe: (() => void) | null = null;
  private mapSeed: number | undefined = undefined; // For map continuity
  private visitedNodes: string[] = []; // Track visited nodes for map progression
  private currentNodeId: string | null = null; // Track current position on map
  private currentStage = 1; // Track battle stage number
  private hasTransitioned = false; // Prevent duplicate scene transitions

  // UI
  private cardUI!: CardSelectUI;
  private readyButton!: Phaser.GameObjects.Container;
  private readyButtonText!: Phaser.GameObjects.Text;
  private isReady = false;
  private playerStatusContainer!: Phaser.GameObjects.Container;
  private playerStatusTexts = new Map<string, Phaser.GameObjects.Text>();

  // State
  private loadouts = new Map<string, string[]>(); // userId -> cardIds
  private readyStates = new Map<string, boolean>(); // userId -> ready

  // Sound manager
  private soundManager: SoundManager | null = null;

  constructor() {
    super('CardSelectScene');
  }

  init(data: { lobbyId: string; players: Player[]; mapSeed?: number; visitedNodes?: string[]; currentNodeId?: string; stage?: number; world?: 'world1' | 'world2' }): void {
    this.lobbyId = data.lobbyId;
    this.players = data.players || [];
    this.mapSeed = data.mapSeed; // Store map seed for continuity
    this.visitedNodes = data.visitedNodes || []; // Store visited nodes
    this.hasTransitioned = false; // Reset transition flag for new scene instance
    
    // Clear persisted ultimate power and inventories when starting a NEW run (no visited nodes)
    // NOTE: We check ONLY visitedNodes, NOT stage, because stage resets per battle but visited nodes persist
    const isNewRun = !data.visitedNodes || data.visitedNodes.length === 0;
    if (isNewRun) {
      clearPersistedUltimatePower();
      clearAllInventories();
      console.log('🆕 New run detected - Ultimate power and inventories reset');
      console.log('   visitedNodes:', data.visitedNodes, 'stage:', data.stage);
    } else {
      console.log('↪️ Continuing run - Ultimate power and inventory will carry over');
      console.log('   visitedNodes:', data.visitedNodes?.length, 'stage:', data.stage);
    }
    this.currentNodeId = data.currentNodeId || null; // Store current position
    this.currentStage = data.stage || 1; // Store battle stage number
    (this as any).worldKey = data.world || 'world1';
    
    console.log(`Card selection initialized for lobby: ${this.lobbyId}`);
    console.log(`Map seed:`, this.mapSeed);
    console.log(`Players:`, this.players);
    console.log(`Visited nodes:`, this.visitedNodes);
    console.log(`Current node:`, this.currentNodeId);
    console.log(`Battle stage:`, this.currentStage);
  }

  async create(): Promise<void> {
    console.log('Card selection scene started');
    
    // Set up custom cursor
    setupCustomCursor(this);

    // Get current user
    this.userId = await getCurrentUserId();
    
    // Initialize inventory for all players
    this.players.forEach(player => {
      initializeInventory(player.userId);
    });
    
    if (!this.userId || !this.lobbyId) {
      console.error('Missing userId or lobbyId');
      this.scene.start('MainMenu');
      return;
    }

    // Determine if host
    this.isHost = this.players.length > 0 && this.players[0].userId === this.userId;

    // Set background color (fallback if image fails to load)
    this.cameras.main.setBackgroundColor('#0d0d0d');

    // Add background image
    const bg = this.add.image(0, 0, 'cardselectbg');
    bg.setOrigin(0, 0);
    bg.setDepth(-1); // Behind everything
    
    // Scale background to cover screen while maintaining aspect ratio
    const scaleX = this.scale.width / bg.width;
    const scaleY = this.scale.height / bg.height;
    const scale = Math.max(scaleX, scaleY); // Use max to cover entire screen
    bg.setScale(scale);
    
    // Center the background
    bg.setPosition(
      (this.scale.width - bg.width * scale) / 2,
      (this.scale.height - bg.height * scale) / 2
    );
    
    console.log(`Card select background loaded: ${bg.width}x${bg.height}, scaled: ${scale.toFixed(2)}x`);

    // Initialize sound manager and ensure title music is stopped
    this.soundManager = new SoundManager(this);
    
    // Stop any title music that might still be playing/fading
    const titleMusic = this.sound.getAllPlaying().find(s => s.key === 'music_title');
    if (titleMusic) {
      console.log('Stopping title music in card selection');
      titleMusic.stop();
    }

    // Play card selection music with fade in
    this.soundManager.playMusicWithFadeIn('music_cardselect', { 
      volume: 0.4, 
      loop: true 
    }, 1500); // 1.5 second fade in
    console.log('Card selection music started with fade in');

    // Get current player's class
    const currentPlayer = this.players.find(p => p.userId === this.userId);
    const playerClass = currentPlayer?.selectedClass || 'Warrior';
    console.log(`Current player class: ${playerClass}`);
    
    // Get base class-specific card pool + neutral items
    const baseCardPool = getAllAvailableCardsForClass(playerClass);
    
    // Get collected cards from inventory
    const collectedCards = getPermanentDeck(this.userId);
    const playerGold = getGold(this.userId);
    console.log(`[CardSelect] 💰 Player gold:`, playerGold);
    console.log(`[CardSelect] 🃏 Collected cards from inventory:`, collectedCards.map(c => c.name));
    
    // Get consumables from inventory
    const consumables = getConsumables(this.userId);
    const consumableCards = Array.from(consumables.entries())
      .map(([cardId, count]) => {
        const card = getCardById(cardId);
        return card ? { ...card, consumableCount: count } : null;
      })
      .filter(c => c !== null);
    console.log(`[CardSelect] ⚠️ Consumables from inventory:`, consumableCards.map(c => `${c?.name} x${c?.consumableCount}`));
    
    // Combine all available cards (base + collected + consumables)
    const classCardPool = [
      ...baseCardPool,
      ...collectedCards,
      ...consumableCards
    ];
    console.log(`Loaded ${classCardPool.length} cards (class + neutral) for ${playerClass}`);
    
    // Display gold in top-right corner (already fetched above)
    this.add.text(this.scale.width - 20, 20, `💰 ${playerGold} Gold`, {
      fontSize: '28px',
      fontFamily: 'Arial Black',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(1, 0);

    // Create UI with class-specific cards
    this.cardUI = new CardSelectUI(
      this,
      classCardPool,
      (cardId) => this.handleCardPick(cardId),
      (outId, inId) => this.handleCardSwap(outId, inId)
    );

    this.createReadyButton();
    this.createPlayerStatus();

    // Initialize loadouts and ready states
    this.players.forEach(player => {
      this.loadouts.set(player.userId, []);
      this.readyStates.set(player.userId, false);
    });

    // Subscribe to selection updates
    subscribeSelection(this.lobbyId, {
      onSelectionPick: this.handleRemotePick.bind(this),
      onSelectionSwap: this.handleRemoteSwap.bind(this),
      onSelectionReady: this.handleRemoteReady.bind(this),
      onSelectionCommit: this.handleCommit.bind(this),
    }).then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
    }).catch((error) => {
      console.error('Failed to subscribe to selection:', error);
    });
  }

  private createReadyButton(): void {
    const centerX = this.scale.width / 2;
    const y = this.scale.height - 80;

    const container = this.add.container(centerX, y);

    const bg = this.add.rectangle(0, 0, 200, 50, 0x666666);
    bg.setStrokeStyle(2, 0xaaaaaa);
    bg.setInteractive({ useHandCursor: true });
    container.add(bg);

    const text = this.add.text(0, 0, 'Ready', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    container.add(text);

    bg.on('pointerover', () => {
      bg.setFillStyle(0x888888);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(this.isReady ? 0x44aa44 : 0x666666);
    });
    bg.on('pointerdown', () => {
      this.toggleReady();
    });

    this.readyButton = container;
    this.readyButtonText = text;
  }

  private createPlayerStatus(): void {
    const container = this.add.container(50, 50);

    const title = this.add.text(0, 0, 'Players:', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    container.add(title);

    this.players.forEach((player, index) => {
      const y = 30 + index * 30;
      const displayName = player.selectedClass ? `${player.name} (${player.selectedClass})` : player.name;
      const playerText = this.add.text(0, y, `${displayName}: Not Ready`, {
        fontSize: '16px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      });
      container.add(playerText);
      this.playerStatusTexts.set(player.userId, playerText);
    });

    this.playerStatusContainer = container;
  }

  private handleCardPick(cardId: string): void {
    console.log(`Picked card: ${cardId}`);
    
    // Update local loadout
    if (this.userId) {
      const myLoadout = this.loadouts.get(this.userId) || [];
      console.log(`Current loadout before pick:`, myLoadout);
      
      // Don't add if already in loadout or at capacity
      if (myLoadout.includes(cardId)) {
        console.log(`Card ${cardId} already in loadout, skipping`);
        return;
      }
      
      if (myLoadout.length < 10) {
        myLoadout.push(cardId);
        this.loadouts.set(this.userId, myLoadout);
        console.log(`Added ${cardId}. New loadout:`, myLoadout);
      } else {
        console.log(`Loadout at capacity (${myLoadout.length}/10), cannot add ${cardId}`);
      }
    }

    // Broadcast pick
    if (this.lobbyId) {
      sendSelectPick(this.lobbyId, cardId).catch(err => {
        console.error('Failed to send pick:', err);
      });
    }

    // If ready, unready
    if (this.isReady) {
      this.toggleReady();
    }
  }

  private handleCardSwap(outId: string, inId: string): void {
    console.log(`Swapped card: ${outId} -> ${inId}`);
    
    // Update local loadout
    if (this.userId) {
      const myLoadout = this.loadouts.get(this.userId) || [];
      const index = myLoadout.indexOf(outId);
      if (index !== -1) {
        myLoadout[index] = inId;
        this.loadouts.set(this.userId, myLoadout);
      }
    }

    // Broadcast swap
    if (this.lobbyId) {
      sendSelectSwap(this.lobbyId, outId, inId).catch(err => {
        console.error('Failed to send swap:', err);
      });
    }

    // If ready, unready
    if (this.isReady) {
      this.toggleReady();
    }
  }

  private toggleReady(): void {
    this.isReady = !this.isReady;

    // Update button appearance
    const bg = this.readyButton.getAt(0) as Phaser.GameObjects.Rectangle;
    if (this.isReady) {
      bg.setFillStyle(0x44aa44);
      this.readyButtonText.setText('Unready');
      
      // Don't fade out music here - keep it playing until battle transition
      // This prevents silence between scenes
    } else {
      bg.setFillStyle(0x666666);
      this.readyButtonText.setText('Ready');
    }

    // Update own ready state
    if (this.userId) {
      this.readyStates.set(this.userId, this.isReady);
      this.updatePlayerStatus(this.userId, this.isReady);
    }

    // Broadcast ready state
    if (this.lobbyId) {
      sendSelectReady(this.lobbyId, this.isReady).catch(err => {
        console.error('Failed to send ready:', err);
      });
    }

    // If host and all ready, commit
    if (this.isHost) {
      this.checkAllReady();
    }
  }

  private handleRemotePick(userId: string, cardId: string): void {
    // Safety check: don't process if scene is shutting down
    if (!this.scene.isActive()) return;
    
    console.log(`Remote pick from ${userId}: ${cardId}`);
    
    const loadout = this.loadouts.get(userId) || [];
    
    // Don't add if already in loadout or at capacity
    if (loadout.includes(cardId) || loadout.length >= 10) {
      console.log(`Skipping duplicate pick: card ${cardId} already in loadout or at capacity`);
      return;
    }
    
    loadout.push(cardId);
    this.loadouts.set(userId, loadout);
    console.log(`Added ${cardId} to ${userId}'s loadout. New loadout:`, loadout);
  }

  private handleRemoteSwap(userId: string, outId: string, inId: string): void {
    // Safety check: don't process if scene is shutting down
    if (!this.scene.isActive()) return;
    
    console.log(`Remote swap from ${userId}: ${outId} -> ${inId}`);
    
    const loadout = this.loadouts.get(userId) || [];
    const index = loadout.indexOf(outId);
    if (index !== -1) {
      loadout[index] = inId;
      this.loadouts.set(userId, loadout);
    }
  }

  private handleRemoteReady(userId: string, ready: boolean): void {
    // Safety check: don't process if scene is shutting down
    if (!this.scene.isActive()) return;
    
    console.log(`${userId} is ${ready ? 'ready' : 'not ready'}`);
    
    this.readyStates.set(userId, ready);
    this.updatePlayerStatus(userId, ready);

    // If host and all ready, commit
    if (this.isHost) {
      this.checkAllReady();
    }
  }

  private updatePlayerStatus(userId: string, ready: boolean): void {
    const text = this.playerStatusTexts.get(userId);
    if (text) {
      const player = this.players.find(p => p.userId === userId);
      const name = player?.name || 'Unknown';
      const displayName = player?.selectedClass ? `${name} (${player.selectedClass})` : name;
      text.setText(`${displayName}: ${ready ? '✓ Ready' : 'Not Ready'}`);
      text.setColor(ready ? '#44aa44' : '#aaaaaa');
    }
  }

  private checkAllReady(): void {
    const allReady = this.players.every(player => 
      this.readyStates.get(player.userId) === true
    );

    if (allReady && this.players.length > 0) {
      console.log('All players ready! Committing loadouts...');
      this.commitLoadouts().catch(err => {
        console.error('Failed to commit loadouts:', err);
      });
    }
  }

  private async commitLoadouts(): Promise<void> {
    // Build loadouts array
    const loadouts: Loadout[] = this.players.map(player => {
      const cards = this.loadouts.get(player.userId) || [];
      console.log(`Building loadout for ${player.userId} (${player.name}):`, cards);
      return {
        userId: player.userId,
        cards: cards,
      };
    });

    console.log('Committing loadouts:', loadouts);
    console.log('All loadout entries:', Array.from(this.loadouts.entries()));

    // Send commit message and wait for it to be sent
    if (this.lobbyId) {
      try {
        await sendSelectCommit(this.lobbyId, loadouts);
        console.log('✅ Commit message sent successfully');
        
        // Add a small delay to ensure message is processed, then transition
        console.log('🎮 Host transitioning after commit delay...');
        this.time.delayedCall(100, () => {
          this.transitionToBattle(loadouts);
        });
      } catch (err) {
        console.error('Failed to send commit:', err);
        return; // Don't transition if commit failed
      }
    }
  }

  private handleCommit(loadouts: Loadout[]): void {
    // Safety check: don't process if scene is shutting down
    if (!this.scene.isActive()) return;
    
    console.log('🔥 COMMIT MESSAGE RECEIVED!');
    console.log('Received loadout commit:', loadouts);
    console.log(`[CardSelect] handleCommit - isHost: ${this.isHost}, userId: ${this.userId}`);
    console.log(`[CardSelect] Scene active: ${this.scene.isActive()}`);
    
    // Non-host players transition to battle when they receive the commit
    if (!this.isHost) {
      console.log('🎮 Non-host transitioning to battle...');
      this.transitionToBattle(loadouts);
    } else {
      console.log('🎮 Host ignoring commit message (already transitioning)');
    }
  }

  private transitionToBattle(loadouts: Loadout[]): void {
    console.log('🎬 TRANSITIONING TO BATTLE with loadouts:', loadouts);
    console.log(`🎬 Scene active: ${this.scene.isActive()}, Scene key: ${this.scene.key}`);

    // Prevent multiple transitions
    if (this.hasTransitioned) {
      console.log('⚠️ Already transitioning to battle, skipping...');
      return;
    }
    this.hasTransitioned = true;

    if (!this.scene.isActive()) {
      console.log('⚠️ Scene already inactive, skipping transition');
      return;
    }

    // CRITICAL: Stop ALL sound and tweens to prevent volume tween crash
    console.log('🔇 Stopping all sounds and tweens...');
    this.tweens.killAll();
    this.sound.stopAll();
    
    // Destroy sound manager to prevent any lingering tweens
    if (this.soundManager) {
      console.log('🔇 Destroying sound manager...');
      this.soundManager.destroy();
      this.soundManager = null;
    }

    // Show loading indicator to confirm scene is transitioning
    const loadingText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2,
      'Loading Battle...',
      {
        fontSize: '48px',
        color: '#ffffff',
        fontFamily: 'Arial Black',
        stroke: '#000000',
        strokeThickness: 8,
      }
    ).setOrigin(0.5).setDepth(10000);

    // Unsubscribe from network updates BEFORE transitioning
    if (this.unsubscribe) {
      console.log('🔌 Unsubscribing from network...');
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Destroy UI to free up resources
    if (this.cardUI) {
      console.log('🗑️ Destroying card UI...');
      this.cardUI.destroy();
    }

    // Prepare player data for battle scene
    const battlePlayers = this.players.map(player => ({
      id: player.userId,
      userId: player.userId,
      side: 'party' as const,
      name: player.name,
      selectedClass: player.selectedClass || 'Warrior',
      hp: 100,
      maxHp: 100,
      ap: 5,
      isHost: player.isHost,
    }));

    console.log('=== CARD SELECT SCENE TRANSITION ===');
    console.log('this.players:', this.players);
    console.log('battlePlayers with classes:', battlePlayers.map(p => ({ name: p.name, class: p.selectedClass })));
    console.log('=== END TRANSITION ===');

    // Use a small delay to ensure the loading text renders
    this.time.delayedCall(50, () => {
      console.log('🚀 Starting BattleScene...');
      // Transition to battle (card music will be handled by battle scene)
      this.scene.start('BattleScene', {
        lobbyId: this.lobbyId,
        players: battlePlayers,
        loadouts: loadouts,
        mapSeed: this.mapSeed, // Pass map seed for continuity
        visitedNodes: this.visitedNodes, // Pass visited nodes for map progression
        currentNodeId: this.currentNodeId, // Pass current position
        stage: this.currentStage, // Pass battle stage number
        world: (this as any).worldKey,
      });
    });
  }

  shutdown(): void {
    console.log('Card select scene shutting down');
    
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    // Music crossfade is now handled by the BattleScene
    // The battle scene will stop/fade out the card select music when it starts
  }

  destroy(): void {
    this.shutdown();
    if (this.cardUI) {
      this.cardUI.destroy();
    }
    // Clean up sound manager
    if (this.soundManager) {
      this.soundManager.destroy();
      this.soundManager = null;
    }
  }
}

