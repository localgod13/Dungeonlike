import Phaser from 'phaser';
import { SoundManager } from '../game/sound';
import { subscribeMap, sendMapVote, sendMapVoteResult } from '../net/match';
import { setupCustomCursor } from '../utils/cursor';

/**
 * Event scene - Template for random events with choices
 */
export class EventScene extends Phaser.Scene {
  private soundManager: SoundManager | null = null;
  private lobbyId: string | null = null;
  private players: any[] = [];
  private mapSeed: number | null = null;
  private visitedNodes: string[] = [];
  private currentNodeId: string | null = null;
  private currentStage = 1; // Track battle stage number
  private hasTransitioned = false; // Prevent duplicate scene transitions
  private hasAppliedChoice = false; // Prevent duplicate choice application
  private userId: string | null = null;
  private isHost = false;
  private readyPlayers: Set<string> = new Set(); // Track ready players for multiplayer
  private autoTransitionTimer: Phaser.Time.TimerEvent | null = null; // Auto-proceed timer
  private eventVotes: Map<string, string> | null = null; // Track votes from other players
  private myVote: string | null = null; // Track this player's vote
  
  // Event data
  private currentEvent: EventData | null = null;
  private eventSeed: number = 0;
  
  // UI elements
  private titleText: Phaser.GameObjects.Text | null = null;
  private descriptionText: Phaser.GameObjects.Text | null = null;
  private choiceContainer: Phaser.GameObjects.Container | null = null;
  private continueButton: Phaser.GameObjects.Text | null = null;
  private votingUI: Phaser.GameObjects.Container | null = null;
  private readyIndicators: Phaser.GameObjects.Container | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super({ key: 'EventScene' });
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
    this.eventSeed = this.mapSeed || (Date.now() % 2147483647); // Keep within PostgreSQL integer range
    this.hasTransitioned = false; // Reset transition flag for new scene instance
    this.hasAppliedChoice = false; // Reset choice application flag for new scene instance
    this.readyPlayers.clear(); // Clear ready players for fresh start
    
    // Clean up any existing timers
    if (this.autoTransitionTimer) {
      this.autoTransitionTimer.destroy();
      this.autoTransitionTimer = null;
    }
    
    console.log('EventScene initialized with node:', data.nodeId);
    console.log('Current stage:', this.currentStage);
  }

  async create(): Promise<void> {
    // Set up custom cursor
    setupCustomCursor(this);
    
    // Get current user
    this.userId = await this.getCurrentUserId();
    console.log('[EventScene] Current userId:', this.userId);
    
    // Determine if host (first player)
    this.isHost = this.players.length > 0 && this.players[0].userId === this.userId;
    console.log('[EventScene] Is host:', this.isHost);
    
    // Fantasy dark background
    this.cameras.main.setBackgroundColor('#0d0820');
    this.createFantasyBackground();

    // Initialize sound
    this.soundManager = new SoundManager(this);

    // Generate random event
    this.generateEvent();

    // Create UI
    this.createTitle();
    this.createDescription();
    await this.createChoices(); // Wait for affordability checks
    this.createContinueButton();

    // Setup voting if multiple players
    if (this.players.length > 1 && this.lobbyId) {
      this.setupVoting();
    }

    // Play encounter music
    this.soundManager?.playMusic('music_encounter', { loop: true, volume: 0.3 });
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
      console.log('Event voting system initialized');
    }).catch((error) => {
      console.error('Failed to setup event voting:', error);
    });
  }

  private handleRemoteVote(userId: string, choiceId: string): void {
    console.log(`Remote event vote from ${userId}: ${choiceId}`);
    
    if (userId === this.userId) return;
    
    // Handle ready votes for continue button
    if (choiceId === 'ready') {
      this.readyPlayers.add(userId);
      console.log(`[EventScene] ${userId} is ready to continue`);
      this.updateReadyIndicators();
      
      if (this.isHost) {
        this.checkAllPlayersReady();
      }
      return;
    }
    
    // Handle choice votes
    if (!this.eventVotes) {
      this.eventVotes = new Map<string, string>();
    }
    this.eventVotes.set(userId, choiceId);
    this.updateVotingUI();
    
    if (this.isHost) {
      this.checkAllVotesIn();
    }
  }

  private handleVoteResult(selectedChoiceId: string, votes: { [choiceId: string]: string[] }): void {
    console.log('Received event vote result:', selectedChoiceId, votes);
    
    // Handle continue signal
    if (selectedChoiceId === 'continue') {
      console.log('[EventScene] Received continue signal from host');
      this.continueToMap();
      return;
    }
    
    // Prevent duplicate choice application
    if (this.hasAppliedChoice) {
      console.log('[EventScene] Choice already applied, ignoring vote result');
      return;
    }
    
    // Find the selected choice
    if (!this.currentEvent) return;
    
    const selectedChoice = this.currentEvent.choices.find(c => c.id === selectedChoiceId);
    if (selectedChoice) {
      this.makeChoiceDirectly(selectedChoice);
    }
  }

  private checkAllVotesIn(): void {
    if (!this.isHost) return;
    
    const totalPlayers = this.players.length;
    const votesReceived = (this.eventVotes?.size || 0) + (this.myVote ? 1 : 0);
    
    if (votesReceived >= totalPlayers) {
      console.log('All event votes received, resolving...');
      this.resolveVotes();
    }
  }

  private resolveVotes(): void {
    // Count votes for each choice
    const voteCounts = new Map<string, string[]>();
    
    // Add remote votes
    if (this.eventVotes) {
      for (const [userId, choiceId] of this.eventVotes.entries()) {
        if (!voteCounts.has(choiceId)) {
          voteCounts.set(choiceId, []);
        }
        voteCounts.get(choiceId)!.push(userId);
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
    let winningChoices: string[] = [];
    
    for (const [choiceId, voters] of voteCounts.entries()) {
      if (voters.length > maxVotes) {
        maxVotes = voters.length;
        winningChoices = [choiceId];
      } else if (voters.length === maxVotes) {
        winningChoices.push(choiceId);
      }
    }
    
    // Select winner (coin toss if tie)
    const selectedChoiceId = winningChoices[Math.floor(Math.random() * winningChoices.length)];
    
    console.log(`Event vote resolution: ${selectedChoiceId} wins with ${maxVotes} votes`);
    
    // Convert Map to object for network
    const votesObject: { [choiceId: string]: string[] } = {};
    for (const [choiceId, voters] of voteCounts.entries()) {
      votesObject[choiceId] = voters;
    }
    
    // Broadcast result
    if (this.lobbyId) {
      sendMapVoteResult(this.lobbyId, selectedChoiceId, votesObject).catch(err => {
        console.error('Failed to send event vote result:', err);
      });
    }
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
    const votesReceived = (this.eventVotes?.size || 0) + (this.myVote ? 1 : 0);
    
    const statusText = this.add.text(0, -15, 'Voting for Choice...', {
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
    if (this.myVote && this.currentEvent) {
      const choice = this.currentEvent.choices.find(c => c.id === this.myVote);
      const choiceText = choice ? choice.text.substring(0, 20) + '...' : 'Unknown';
      const myVoteText = this.add.text(0, 30, `Your vote: ${choiceText}`, {
        fontSize: '12px',
        color: '#44ff88',
        fontFamily: 'Georgia, serif',
      });
      myVoteText.setOrigin(0.5);
      this.votingUI.add(myVoteText);
    }
  }

  private createFantasyBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Create gradient background
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x0d0820, 0x0d0820, 0x1a0f2e, 0x1a0f2e, 1, 1, 1, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.setDepth(-100);
    
    // Add mystical elements
    this.createMysticalElements();
  }

  private createMysticalElements(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Floating orbs
    for (let i = 0; i < 6; i++) {
      const orb = this.add.circle(
        Math.random() * width,
        Math.random() * height,
        8,
        0x4a90e2,
        0.3
      );
      orb.setDepth(-50);
      
      // Floating animation
      this.tweens.add({
        targets: orb,
        y: orb.y + (Math.random() - 0.5) * 100,
        alpha: { from: 0.1, to: 0.5 },
        duration: 3000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
      });
    }
    
    // Mystical runes in corners
    const runeGraphics = this.add.graphics();
    runeGraphics.lineStyle(2, 0x8b7355, 0.4);
    
    // Draw simple rune patterns
    const runePositions = [
      { x: 80, y: 80 },
      { x: width - 80, y: 80 },
      { x: 80, y: height - 80 },
      { x: width - 80, y: height - 80 },
    ];
    
    runePositions.forEach(pos => {
      runeGraphics.beginPath();
      runeGraphics.moveTo(pos.x - 20, pos.y);
      runeGraphics.lineTo(pos.x + 20, pos.y);
      runeGraphics.moveTo(pos.x, pos.y - 20);
      runeGraphics.lineTo(pos.x, pos.y + 20);
      runeGraphics.strokePath();
    });
    
    runeGraphics.setDepth(-50);
  }

  private createTitle(): void {
    const width = this.scale.width;
    
    this.titleText = this.add.text(width / 2, 80, 'MYSTERIOUS ENCOUNTER', {
      fontSize: '48px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#8b7355',
      strokeThickness: 3,
    });
    this.titleText.setOrigin(0.5);
    this.titleText.setDepth(100);

    // Add mystical glow
    this.tweens.add({
      targets: this.titleText,
      alpha: { from: 0.7, to: 1.0 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });
  }

  private createDescription(): void {
    const width = this.scale.width;
    
    if (!this.currentEvent) return;
    
    // Description background
    const descBg = this.add.rectangle(width / 2, 200, width - 100, 120, 0x1a0f2e, 0.8);
    descBg.setStrokeStyle(2, 0x8b7355, 0.6);
    descBg.setDepth(50);
    
    this.descriptionText = this.add.text(width / 2, 200, this.currentEvent.description, {
      fontSize: '18px',
      color: '#e8dcc0',
      fontFamily: 'Georgia, serif',
      align: 'center',
      wordWrap: { width: width - 150 },
    });
    this.descriptionText.setOrigin(0.5);
    this.descriptionText.setDepth(100);
  }

  private generateEvent(): void {
    // TODO: Generate based on seed, player level, etc.
    const events: EventData[] = [
      {
        id: 'mysterious_merchant',
        title: 'Mysterious Merchant',
        description: 'A hooded figure approaches you from the shadows. "I have something that might interest you," they whisper, revealing a strange artifact glowing with inner light.',
        choices: [
          {
            id: 'buy_artifact',
            text: 'Purchase the artifact',
            costType: 'gold',
            costAmount: 50,
            consequences: [
              { type: 'gold', amount: -50, target: 'all' }, // Split cost among players
              { type: 'card', cardId: 'random_rare', target: 'all' }, // Everyone gets a card
            ],
            description: 'You pool your gold and receive a glowing crystal that pulses with power.',
          },
          {
            id: 'decline',
            text: 'Decline politely',
            costType: 'none',
            costAmount: 0,
            consequences: [],
            description: 'The merchant nods and disappears into the shadows.',
          },
          {
            id: 'threaten',
            text: 'Demand they hand it over',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'battle', enemyType: 'merchant_guards', chance: 0.7 },
              { type: 'card', cardId: 'random_rare', target: 'all', chance: 0.3 },
            ],
            description: 'The merchant\'s eyes flash with anger...',
          },
        ],
      },
      {
        id: 'ancient_shrine',
        title: 'Ancient Shrine',
        description: 'You discover a weathered shrine dedicated to forgotten gods. Offerings of gold and gems lie scattered around the base. A sense of power emanates from within.',
        choices: [
          {
            id: 'offer_gold',
            text: 'Make an offering',
            costType: 'gold',
            costAmount: 30,
            consequences: [
              { type: 'gold', amount: -30, target: 'all' },
              { type: 'heal', amount: 30, target: 'all' },
            ],
            description: 'The shrine glows warmly as your offering is accepted. Divine light washes over you, healing your wounds.',
          },
          {
            id: 'take_offerings',
            text: 'Take the scattered offerings',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'gold', amount: 50, target: 'all', chance: 0.5 },  // 50% clean steal
              { type: 'damage', amount: 15, target: 'all', chance: 0.5 },  // 50% cursed (no gold)
            ],
            description: 'You grab the offerings...',
          },
          {
            id: 'investigate',
            text: 'Investigate the shrine carefully',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'card', cardId: 'divine_knowledge', target: 'all' },
            ],
            description: 'You discover ancient knowledge inscribed on the walls. The wisdom flows into your mind.',
          },
        ],
      },
      {
        id: 'wounded_traveler',
        title: 'Wounded Traveler',
        description: 'You encounter a bloodied traveler collapsed by the roadside. They appear to be a fellow adventurer who has seen better days. They reach out weakly toward you.',
        choices: [
          {
            id: 'heal_traveler',
            text: 'Use a healing potion on them',
            costType: 'consumable',
            costAmount: 1,
            costItem: 'healing_potion',
            consequences: [
              { type: 'card', cardId: 'companion_card', target: 'all' },
              { type: 'gold', amount: 20, target: 'all' },
            ],
            description: 'The traveler recovers and gratefully offers to aid you. They also share some gold as thanks.',
          },
          {
            id: 'give_gold',
            text: 'Give them gold for medicine',
            costType: 'gold',
            costAmount: 25,
            consequences: [
              { type: 'gold', amount: -25, target: 'all' },
              { type: 'card', cardId: 'random_common', target: 'random' },
            ],
            description: 'The traveler thanks you profusely and shares valuable information about the road ahead.',
          },
          {
            id: 'ignore',
            text: 'Continue on your way',
            costType: 'none',
            costAmount: 0,
            consequences: [],
            description: 'You leave the traveler behind, but the guilt weighs on you.',
          },
        ],
      },
      {
        id: 'cursed_fountain',
        title: 'Cursed Fountain',
        description: 'A bubbling fountain stands before you, its waters glowing with an eerie purple light. Strange whispers emanate from its depths, promising power... at a price.',
        choices: [
          {
            id: 'drink_deeply',
            text: 'Drink deeply from the fountain',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'card', cardId: 'random_rare', target: 'all', chance: 0.5 },
              { type: 'damage', amount: 15, target: 'all', chance: 0.5 },
            ],
            description: 'You drink the cursed waters...',
          },
          {
            id: 'take_sip',
            text: 'Take a cautious sip',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'heal', amount: 15, target: 'all' },
            ],
            description: 'A small sip seems safe. You feel slightly refreshed.',
          },
          {
            id: 'destroy_fountain',
            text: 'Attempt to destroy the fountain',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'gold', amount: 50, target: 'all', chance: 0.4 },  // 40% clean loot
              { type: 'battle', enemyType: 'fountain_guardian', chance: 0.6 },  // 60% guardian spawns
            ],
            description: 'You attack the fountain...',
          },
        ],
      },
      {
        id: 'bandit_ambush',
        title: 'Bandit Ambush!',
        description: 'Bandits leap out from the trees, surrounding you! Their leader steps forward with a wicked grin. "Your gold or your life!" he snarls.',
        choices: [
          {
            id: 'pay_bandits',
            text: 'Pay them off',
            costType: 'gold',
            costAmount: 40,
            consequences: [
              { type: 'gold', amount: -40, target: 'all' },
            ],
            description: 'The bandits take your gold and disappear into the forest, laughing.',
          },
          {
            id: 'fight_bandits',
            text: 'Stand and fight!',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'battle', enemyType: 'bandits' },
            ],
            description: 'You draw your weapons and prepare for battle!',
          },
          {
            id: 'intimidate',
            text: 'Attempt to intimidate them',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'gold', amount: 25, target: 'all', chance: 0.3 },
              { type: 'battle', enemyType: 'bandits', chance: 0.7 },
            ],
            description: 'You try to scare them off...',
          },
        ],
      },
      {
        id: 'treasure_chest',
        title: 'Suspicious Treasure Chest',
        description: 'An ornate treasure chest sits in the middle of the path. It looks valuable... but also suspiciously unguarded.',
        choices: [
          {
            id: 'open_carefully',
            text: 'Open it carefully',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'gold', amount: 60, target: 'all', chance: 0.7 },
              { type: 'damage', amount: 20, target: 'all', chance: 0.3 }, // Trapped!
            ],
            description: 'You cautiously reach for the latch...',
          },
          {
            id: 'force_open',
            text: 'Force it open',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'gold', amount: 70, target: 'all' },
              { type: 'damage', amount: 10, target: 'all' }, // Always take some damage
            ],
            description: 'You smash the chest open! Gold spills out, but you trigger a trap.',
          },
          {
            id: 'leave_chest',
            text: 'Leave it alone',
            costType: 'none',
            costAmount: 0,
            consequences: [],
            description: 'Better safe than sorry. You continue on your way.',
          },
        ],
      },
      {
        id: 'mysterious_gambler',
        title: 'Mysterious Gambler',
        description: 'A cloaked figure sits at a makeshift table, shuffling cards with supernatural speed. "Care for a game?" they ask with a smile. "Winner takes all..."',
        choices: [
          {
            id: 'bet_high',
            text: 'Bet big',
            costType: 'gold',
            costAmount: 50,
            consequences: [
              { type: 'gold', amount: -50, target: 'all' },  // Always pay bet
              { type: 'gold', amount: 200, target: 'all', chance: 0.4 },  // 40% win 4x (net +150)
              // 60% lose everything (just the -50)
            ],
            description: 'You place your bet and the cards are dealt...',
          },
          {
            id: 'bet_low',
            text: 'Bet cautiously',
            costType: 'gold',
            costAmount: 20,
            consequences: [
              { type: 'gold', amount: -20, target: 'all' },  // Always pay bet
              { type: 'gold', amount: 60, target: 'all', chance: 0.5 },  // 50% win 3x (net +40)
              // 50% lose everything (just the -20)
            ],
            description: 'You make a modest wager...',
          },
          {
            id: 'refuse_game',
            text: 'Decline the game',
            costType: 'none',
            costAmount: 0,
            consequences: [],
            description: 'The gambler shrugs and vanishes in a puff of smoke.',
          },
        ],
      },
      {
        id: 'abandoned_camp',
        title: 'Abandoned Camp',
        description: 'You discover a recently abandoned campsite. Supplies are scattered everywhere, and a cooking pot still bubbles over the fire. Something made them leave in a hurry...',
        choices: [
          {
            id: 'loot_camp',
            text: 'Search for supplies',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'gold', amount: 35, target: 'all' },  // Always get gold
            ],
            description: 'You find useful supplies and equipment left behind.',
          },
          {
            id: 'investigate_camp',
            text: 'Investigate what happened',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'battle', enemyType: 'camp_monsters', chance: 0.5 },
              { type: 'gold', amount: 50, target: 'all', chance: 0.5 },
            ],
            description: 'You follow the tracks leading away from camp...',
          },
          {
            id: 'rest_at_camp',
            text: 'Rest and recover',
            costType: 'none',
            costAmount: 0,
            consequences: [
              { type: 'heal', amount: 25, target: 'all' },
            ],
            description: 'You take advantage of the fire and rest. The warm meal restores your strength.',
          },
        ],
      },
    ];
    
    // Select random event based on seed
    const seed = this.eventSeed;
    const eventIndex = seed % events.length;
    this.currentEvent = events[eventIndex];
    
    console.log('Generated event:', this.currentEvent.title);
  }

  private async createChoices(): Promise<void> {
    if (!this.currentEvent) return;
    
    const width = this.scale.width;
    const height = this.scale.height;
    
    this.choiceContainer = this.add.container(width / 2, height / 2 + 50);
    this.choiceContainer.setDepth(100);
    
    // Create choice buttons with affordability check
    for (let i = 0; i < this.currentEvent.choices.length; i++) {
      const choice = this.currentEvent.choices[i];
      const isAffordable = await this.isChoiceAffordable(choice);
      this.createChoiceButton(choice, i, isAffordable);
    }
  }

  /**
   * Check if a choice is affordable by ALL players
   */
  private async isChoiceAffordable(choice: EventChoice): Promise<boolean> {
    if (choice.costType === 'none') {
      return true;
    }

    const { getGold, getConsumableCount } = await import('../game/inventory');
    
    if (choice.costType === 'gold') {
      // Split gold cost equally among all players (rounded up)
      const playerCount = this.players.length;
      const costPerPlayer = Math.ceil(choice.costAmount / playerCount);
      
      // Check if ALL players have enough gold
      for (const player of this.players) {
        const playerGold = getGold(player.userId);
        if (playerGold < costPerPlayer) {
          console.log(`[Event] Player ${player.name} cannot afford ${costPerPlayer} gold (has ${playerGold})`);
          return false;
        }
      }
      
      return true;
    }
    
    if (choice.costType === 'consumable' && choice.costItem) {
      // Check if ANY player has the required consumable
      for (const player of this.players) {
        const count = getConsumableCount(player.userId, choice.costItem);
        if (count >= choice.costAmount) {
          console.log(`[Event] Player ${player.name} has ${count} ${choice.costItem}`);
          return true;
        }
      }
      
      console.log(`[Event] No player has ${choice.costItem}`);
      return false;
    }
    
    return true;
  }

  private createChoiceButton(choice: EventChoice, index: number, isAffordable: boolean): void {
    if (!this.choiceContainer) return;
    
    const buttonWidth = 600;
    const buttonHeight = 60;
    const spacing = 20;
    const totalHeight = this.currentEvent!.choices.length * (buttonHeight + spacing) - spacing;
    const startY = -totalHeight / 2;
    
    const y = startY + index * (buttonHeight + spacing);
    
    // Button background - dimmed if not affordable
    const bgColor = isAffordable ? 0x1a0f2e : 0x0d0610;
    const buttonBg = this.add.rectangle(0, y, buttonWidth, buttonHeight, bgColor, 0.9);
    buttonBg.setStrokeStyle(2, isAffordable ? 0x8b7355 : 0x4a3a2a, 0.8);
    if (isAffordable) {
      buttonBg.setInteractive();
    }
    
    // Choice text - with cost info
    let displayText = choice.text;
    if (choice.costType === 'gold' && choice.costAmount > 0) {
      const costPerPlayer = Math.ceil(choice.costAmount / this.players.length);
      if (this.players.length > 1) {
        displayText += ` (${costPerPlayer}g each)`;
      } else {
        displayText += ` (${choice.costAmount}g)`;
      }
    } else if (choice.costType === 'consumable' && choice.costItem) {
      displayText += ` (Requires ${choice.costItem})`;
    }
    
    const choiceText = this.add.text(0, y, displayText, {
      fontSize: '16px',
      color: isAffordable ? '#d4af37' : '#6a5a4a',
      fontFamily: 'Georgia, serif',
      align: 'center',
      wordWrap: { width: buttonWidth - 40 },
    });
    choiceText.setOrigin(0.5);
    
    // Show "Cannot afford" indicator
    if (!isAffordable) {
      const lockIcon = this.add.text(buttonWidth / 2 - 30, y, '🔒', {
        fontSize: '14px',
      });
      lockIcon.setOrigin(0.5);
      this.choiceContainer.add(lockIcon);
    }
    
    // Hover effects (only if affordable)
    if (isAffordable) {
      buttonBg.on('pointerover', () => {
        buttonBg.setFillStyle(0x2a1f3d, 0.9);
        choiceText.setColor('#f4e4bc');
        this.soundManager?.playSfx('sfx_card_click');
      });
      
      buttonBg.on('pointerout', () => {
        buttonBg.setFillStyle(0x1a0f2e, 0.9);
        choiceText.setColor('#d4af37');
      });
      
      buttonBg.on('pointerdown', () => this.voteForChoice(choice));
    }
    
    this.choiceContainer.add([buttonBg, choiceText]);
  }

  private async voteForChoice(choice: EventChoice): Promise<void> {
    if (this.players.length > 1) {
      // Multiplayer: Vote for choice
      this.myVote = choice.id;
      this.updateVotingUI();
      
      if (this.lobbyId) {
        try {
          await sendMapVote(this.lobbyId, choice.id);
          console.log(`Voted for choice: ${choice.id}`);
        } catch (error) {
          console.error('Failed to send event vote:', error);
        }
      }
      
      if (this.isHost) {
        this.checkAllVotesIn();
      }
    } else {
      // Single player: Direct choice
      this.makeChoiceDirectly(choice);
    }
  }

  private async makeChoiceDirectly(choice: EventChoice): Promise<void> {
    // Prevent duplicate choice application
    if (this.hasAppliedChoice) {
      console.log('[EventScene] Choice already applied, skipping...');
      return;
    }
    this.hasAppliedChoice = true;
    
    console.log(`Made choice: ${choice.text}`);
    
    // Apply consequences
    await this.applyConsequences(choice);
    
    // Check if we transitioned to a battle (don't show result screen if so)
    if (this.hasTransitioned) {
      console.log('[EventScene] Transitioned to battle, skipping result screen');
      return;
    }
    
    // Hide choices and show result
    this.choiceContainer?.setVisible(false);
    this.showChoiceResult(choice);
  }

  /**
   * Apply all consequences of a choice
   */
  private async applyConsequences(choice: EventChoice): Promise<void> {
    const { removeConsumable, getConsumableCount } = await import('../game/inventory');
    
    // First, handle the COST of the choice (if any)
    if (choice.costType === 'consumable' && choice.costItem) {
      // Find a player who has the consumable and remove it
      for (const player of this.players) {
        const count = getConsumableCount(player.userId, choice.costItem);
        if (count >= choice.costAmount) {
          removeConsumable(player.userId, choice.costItem);
          console.log(`[Event] ${player.name} used ${choice.costItem}`);
          break;
        }
      }
    }
    // Gold costs are handled in the gold consequence
    
    // Check if there are multiple consequences with chances (mutually exclusive outcomes)
    const chanceConsequences = choice.consequences.filter(c => c.chance !== undefined);
    
    if (chanceConsequences.length > 1) {
      // Multiple chance-based outcomes - roll ONCE to determine which happens
      const totalChance = chanceConsequences.reduce((sum, c) => sum + (c.chance || 0), 0);
      
      if (totalChance <= 1.0) {
        // Use the FIRST consequence's chance for the roll (they should add to 100%)
        const firstChance = chanceConsequences[0].chance!;
        console.log(`[Event] Rolling once for mutually exclusive outcomes`);
        console.log(`[Event] Option 1 (${(firstChance * 100)}%): ${chanceConsequences[0].type}`);
        console.log(`[Event] Option 2 (${((1 - firstChance) * 100)}%): ${chanceConsequences[1].type}`);
        
        const success = await this.rollDice(firstChance);
        
        // Apply the consequence based on the SINGLE roll result
        const consequenceToApply = success ? chanceConsequences[0] : chanceConsequences[1];
        console.log(`[Event] Roll ${success ? 'SUCCEEDED' : 'FAILED'} - applying: ${consequenceToApply.type}`);
        
        await this.applySingleConsequence(consequenceToApply);
        
        // Also apply any non-chance consequences
        for (const consequence of choice.consequences) {
          if (consequence.chance === undefined) {
            console.log(`[Event] Also applying guaranteed consequence: ${consequence.type}`);
            await this.applySingleConsequence(consequence);
          }
        }
        
        return;
      }
    }
    
    // Normal flow: apply all consequences (with individual rolls if needed)
    for (const consequence of choice.consequences) {
      // Check chance-based consequences with dice roll animation
      if (consequence.chance !== undefined) {
        const success = await this.rollDice(consequence.chance);
        if (!success) {
          console.log(`[Event] Consequence skipped (${(consequence.chance * 100).toFixed(0)}% chance failed)`);
          continue;
        }
        console.log(`[Event] Consequence succeeded (${(consequence.chance * 100).toFixed(0)}% chance)`);
      }
      
      await this.applySingleConsequence(consequence);
    }
  }

  /**
   * Apply a single consequence
   */
  private async applySingleConsequence(consequence: EventConsequence): Promise<void> {
    switch (consequence.type) {
      case 'gold':
        await this.applyGoldConsequence(consequence);
        break;
        
      case 'heal':
        await this.applyHealConsequence(consequence);
        break;
        
      case 'damage':
        await this.applyDamageConsequence(consequence);
        break;
        
      case 'card':
        await this.applyCardConsequence(consequence);
        break;
        
      case 'battle':
        await this.applyBattleConsequence(consequence);
        break;
        
      default:
        console.log(`[Event] Unknown consequence type: ${consequence.type}`);
    }
  }

  /**
   * Show d10 dice roll animation and return success/failure
   */
  private async rollDice(successChance: number): Promise<boolean> {
    return new Promise((resolve) => {
      const width = this.scale.width;
      const height = this.scale.height;
      
      // Calculate d10 threshold (roll must be >= threshold to succeed)
      // 70% success = roll 4+ (4,5,6,7,8,9,10 = 7 numbers)
      // 20% success = roll 9+ (9,10 = 2 numbers)
      const successPercent = successChance * 100;
      const threshold = Math.ceil((100 - successPercent) / 10) + 1;
      
      // Create dice roll UI
      const diceContainer = this.add.container(width / 2, height / 2);
      diceContainer.setDepth(5000);
      
      // Dark overlay
      const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
      overlay.setOrigin(0.5);
      diceContainer.add(overlay);
      
      // Dice background
      const diceBg = this.add.rectangle(0, 0, 400, 300, 0x1a0f2e, 0.95);
      diceBg.setStrokeStyle(3, 0xd4af37, 1);
      diceContainer.add(diceBg);
      
      // Title
      const title = this.add.text(0, -110, 'ROLLING D10...', {
        fontSize: '28px',
        color: '#d4af37',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
      });
      title.setOrigin(0.5);
      diceContainer.add(title);
      
      // Challenge description
      const challengeText = this.add.text(0, -70, `Need ${threshold}+ to succeed`, {
        fontSize: '20px',
        color: '#b8a890',
        fontFamily: 'Georgia, serif',
      });
      challengeText.setOrigin(0.5);
      diceContainer.add(challengeText);
      
      // Dice number display (will cycle through numbers)
      const diceNumber = this.add.text(0, 0, '?', {
        fontSize: '96px',
        color: '#ffffff',
        fontFamily: 'Arial Black',
        stroke: '#000000',
        strokeThickness: 6,
      });
      diceNumber.setOrigin(0.5);
      diceContainer.add(diceNumber);
      
      // Play sound
      this.soundManager?.playSfx('sfx_card_click');
      
      // Animate numbers cycling (simulating dice roll)
      let cycleCount = 0;
      const cycleInterval = this.time.addEvent({
        delay: 100,
        callback: () => {
          const randomNum = Math.floor(Math.random() * 10) + 1;
          diceNumber.setText(randomNum.toString());
          cycleCount++;
          
          if (cycleCount >= 10) {
            cycleInterval.destroy();
            showDiceResult();
          }
        },
        loop: true,
      });
      
      // Show final result
      const showDiceResult = () => {
        // Actual roll (1-10)
        const roll = Math.floor(Math.random() * 10) + 1;
        const success = roll >= threshold;
        
        // Show final number
        diceNumber.setText(roll.toString());
        diceNumber.setColor(success ? '#44ff88' : '#ff6b6b');
        
        // Bounce effect
        this.tweens.add({
          targets: diceNumber,
          scale: { from: 1, to: 1.3 },
          duration: 300,
          yoyo: true,
          ease: 'Back.easeOut',
        });
        
        // Show result label
        const resultLabel = this.add.text(0, 80, success ? 'SUCCESS!' : 'FAILED!', {
          fontSize: '36px',
          color: success ? '#44ff88' : '#ff6b6b',
          fontFamily: 'Georgia, serif',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        });
        resultLabel.setOrigin(0.5);
        resultLabel.setAlpha(0);
        diceContainer.add(resultLabel);
        
        // Show explanation
        const explanation = this.add.text(0, 115, 
          success ? `${roll} ≥ ${threshold}` : `${roll} < ${threshold}`, 
          {
            fontSize: '18px',
            color: '#b8a890',
            fontFamily: 'Georgia, serif',
          }
        );
        explanation.setOrigin(0.5);
        explanation.setAlpha(0);
        diceContainer.add(explanation);
        
        this.tweens.add({
          targets: [resultLabel, explanation],
          alpha: 1,
          duration: 400,
          ease: 'Power2',
        });
        
        // Play result sound
        this.soundManager?.playSfx(success ? 'ui_click' : 'sfx_card_click');
        
        // Clean up after showing result
        this.time.delayedCall(2000, () => {
          this.tweens.add({
            targets: diceContainer,
            alpha: 0,
            duration: 300,
            onComplete: () => {
              diceContainer.destroy();
              resolve(success);
            },
          });
        });
      };
    });
  }

  /**
   * Apply gold consequence (gain or lose gold)
   */
  private async applyGoldConsequence(consequence: EventConsequence): Promise<void> {
    if (!consequence.amount) return;
    
    const { addGold, spendGold } = await import('../game/inventory');
    const playerCount = this.players.length;
    
    if (consequence.amount < 0) {
      // Spending gold - split equally among players (rounded up)
      const costPerPlayer = Math.ceil(Math.abs(consequence.amount) / playerCount);
      
      for (const player of this.players) {
        spendGold(player.userId, costPerPlayer);
      }
      
      console.log(`[Event] Each player spent ${costPerPlayer} gold`);
    } else {
      // Gaining gold - everyone gets full amount
      for (const player of this.players) {
        addGold(player.userId, consequence.amount);
      }
      
      console.log(`[Event] Each player gained ${consequence.amount} gold`);
    }
  }

  /**
   * Apply heal consequence
   */
  private async applyHealConsequence(consequence: EventConsequence): Promise<void> {
    if (!consequence.amount) return;
    
    // TODO: Implement party healing
    // For now, just log it - we'll need to store party HP state
    console.log(`[Event] Party healed for ${consequence.amount} HP`);
    
    // We could store this in a persistent party state or apply it in the next battle
  }

  /**
   * Apply damage consequence
   */
  private async applyDamageConsequence(consequence: EventConsequence): Promise<void> {
    if (!consequence.amount) return;
    
    // TODO: Implement party damage
    console.log(`[Event] Party took ${consequence.amount} damage`);
    
    // We could store this in a persistent party state or apply it in the next battle
  }

  /**
   * Apply card reward consequence
   */
  private async applyCardConsequence(consequence: EventConsequence): Promise<void> {
    if (!consequence.cardId) return;
    
    const { addCardToDeck } = await import('../game/inventory');
    const { CARD_POOL } = await import('../game/cards');
    
    // Determine which card(s) to give
    let cardsToGive: any[] = [];
    
    if (consequence.cardId === 'random_rare') {
      // Give a random advanced card (as we don't have rarity system yet)
      // Filter to more powerful cards (ap cost >= 4)
      const powerfulCards = CARD_POOL.filter((c: any) => c.ap >= 4 && c.class !== undefined);
      if (powerfulCards.length > 0) {
        const randomCard = powerfulCards[Math.floor(Math.random() * powerfulCards.length)];
        cardsToGive = [randomCard];
        console.log(`[Event] Giving random rare card: ${randomCard.name}`);
      } else {
        console.warn('[Event] No rare cards available, giving random card');
        const randomCard = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
        cardsToGive = [randomCard];
      }
    } else if (consequence.cardId === 'random_common') {
      // Give a random basic card (ap cost <= 3)
      const basicCards = CARD_POOL.filter((c: any) => c.ap <= 3);
      if (basicCards.length > 0) {
        const randomCard = basicCards[Math.floor(Math.random() * basicCards.length)];
        cardsToGive = [randomCard];
        console.log(`[Event] Giving random common card: ${randomCard.name}`);
      } else {
        console.warn('[Event] No common cards available, giving random card');
        const randomCard = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
        cardsToGive = [randomCard];
      }
    } else {
      // Give specific card by ID
      const card = CARD_POOL.find((c: any) => c.id === consequence.cardId);
      if (card) {
        cardsToGive = [card];
        console.log(`[Event] Giving specific card: ${card.name}`);
      } else {
        console.warn(`[Event] Card not found: ${consequence.cardId}, giving random card`);
        const randomCard = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
        cardsToGive = [randomCard];
      }
    }
    
    // Give cards to players based on target
    if (consequence.target === 'all') {
      for (const player of this.players) {
        for (const card of cardsToGive) {
          addCardToDeck(player.userId, card);
        }
      }
      console.log(`[Event] All players received cards: ${cardsToGive.map(c => c.name).join(', ')}`);
    } else if (consequence.target === 'random' && this.players.length > 0) {
      const randomPlayer = this.players[Math.floor(Math.random() * this.players.length)];
      for (const card of cardsToGive) {
        addCardToDeck(randomPlayer.userId, card);
      }
      console.log(`[Event] ${randomPlayer.name} received cards: ${cardsToGive.map(c => c.name).join(', ')}`);
    }
  }

  /**
   * Apply battle consequence - transition to a battle
   */
  private async applyBattleConsequence(consequence: EventConsequence): Promise<void> {
    if (!consequence.enemyType) return;
    
    console.log(`[Event] 🔥 BATTLE CONSEQUENCE TRIGGERED!`);
    console.log(`[Event] Enemy type: ${consequence.enemyType}`);
    console.log(`[Event] Starting battle transition...`);
    
    // Show "Battle Starting!" message
    await this.showBattleTransition(consequence.enemyType);
    
    console.log(`[Event] Battle transition complete, starting CardSelectScene...`);
    
    // Transition to card selection then battle
    // We'll use the same flow as regular battles
    this.hasTransitioned = true;
    
    this.scene.start('CardSelectScene', {
      lobbyId: this.lobbyId,
      players: this.players,
      mapSeed: this.mapSeed,
      visitedNodes: this.visitedNodes,
      currentNodeId: this.currentNodeId,
      stage: this.currentStage,
      eventBattle: consequence.enemyType, // Mark this as an event battle
    });
    
    console.log(`[Event] CardSelectScene started for event battle`);
  }

  /**
   * Show battle transition screen
   */
  private async showBattleTransition(enemyType: string): Promise<void> {
    return new Promise((resolve) => {
      const width = this.scale.width;
      const height = this.scale.height;
      
      // Create transition overlay
      const transitionContainer = this.add.container(width / 2, height / 2);
      transitionContainer.setDepth(6000);
      
      // Dark background
      const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.9);
      bg.setOrigin(0.5);
      transitionContainer.add(bg);
      
      // Battle warning
      const warningText = this.add.text(0, -50, '⚔️ BATTLE! ⚔️', {
        fontSize: '64px',
        color: '#ff6b6b',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      });
      warningText.setOrigin(0.5);
      warningText.setAlpha(0);
      transitionContainer.add(warningText);
      
      // Enemy type
      const enemyName = this.getEnemyDisplayName(enemyType);
      const enemyText = this.add.text(0, 50, enemyName, {
        fontSize: '32px',
        color: '#d4af37',
        fontFamily: 'Georgia, serif',
        align: 'center',
      });
      enemyText.setOrigin(0.5);
      enemyText.setAlpha(0);
      transitionContainer.add(enemyText);
      
      // Animate in
      this.tweens.add({
        targets: warningText,
        alpha: 1,
        scale: { from: 0.5, to: 1.2 },
        duration: 500,
        ease: 'Back.easeOut',
      });
      
      this.tweens.add({
        targets: enemyText,
        alpha: 1,
        y: 80,
        duration: 500,
        delay: 200,
        ease: 'Power2',
      });
      
      // Flash effect
      this.tweens.add({
        targets: warningText,
        scale: { from: 1.2, to: 1.1 },
        duration: 300,
        yoyo: true,
        repeat: 2,
        delay: 500,
      });
      
      // Play battle sound
      this.soundManager?.playSfx('ui_click');
      
      // Clean up and resolve
      this.time.delayedCall(2000, () => {
        this.tweens.add({
          targets: transitionContainer,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            transitionContainer.destroy();
            resolve();
          },
        });
      });
    });
  }

  /**
   * Get display name for enemy type
   */
  private getEnemyDisplayName(enemyType: string): string {
    const names: { [key: string]: string } = {
      'merchant_guards': 'Merchant Guards',
      'bandits': 'Bandit Gang',
      'fountain_guardian': 'Cursed Guardian',
      'camp_monsters': 'Wild Beasts',
    };
    
    return names[enemyType] || 'Unknown Enemy';
  }

  private showChoiceResult(choice: EventChoice): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Build result text with consequences
    let resultText = choice.description + '\n\n';
    
    // Add consequence summary
    const consequenceTexts: string[] = [];
    for (const consequence of choice.consequences) {
      if (consequence.chance && Math.random() > consequence.chance) continue; // Skip failed chances
      
      switch (consequence.type) {
        case 'gold':
          if (consequence.amount && consequence.amount > 0) {
            consequenceTexts.push(`💰 Gained ${consequence.amount} gold`);
          } else if (consequence.amount && consequence.amount < 0) {
            const costPerPlayer = Math.ceil(Math.abs(consequence.amount) / this.players.length);
            if (this.players.length > 1) {
              consequenceTexts.push(`💰 Lost ${costPerPlayer} gold each`);
            } else {
              consequenceTexts.push(`💰 Lost ${Math.abs(consequence.amount)} gold`);
            }
          }
          break;
        case 'heal':
          if (consequence.amount) {
            consequenceTexts.push(`❤️ Healed ${consequence.amount} HP`);
          }
          break;
        case 'damage':
          if (consequence.amount) {
            consequenceTexts.push(`💔 Took ${consequence.amount} damage`);
          }
          break;
        case 'card':
          consequenceTexts.push(`🃏 Received a card!`);
          break;
        case 'battle':
          consequenceTexts.push(`⚔️ Battle incoming!`);
          break;
      }
    }
    
    if (consequenceTexts.length > 0) {
      resultText += consequenceTexts.join('\n');
    }
    
    // Result background - larger to fit consequence text
    const resultHeight = Math.min(250, 150 + (consequenceTexts.length * 25));
    const resultBg = this.add.rectangle(width / 2, height / 2, width - 100, resultHeight, 0x1a0f2e, 0.9);
    resultBg.setStrokeStyle(2, 0x8b7355, 0.8);
    resultBg.setDepth(100);
    
    // Result text
    const resultTextObj = this.add.text(width / 2, height / 2, resultText, {
      fontSize: '18px',
      color: '#e8dcc0',
      fontFamily: 'Georgia, serif',
      align: 'center',
      wordWrap: { width: width - 150 },
    });
    resultTextObj.setOrigin(0.5);
    resultTextObj.setDepth(150);
    
    // Fade in effect
    resultBg.setAlpha(0);
    resultTextObj.setAlpha(0);
    
    this.tweens.add({
      targets: [resultBg, resultTextObj],
      alpha: 1,
      duration: 500,
      onComplete: () => {
        // Auto-proceed after delay
        const AUTO_PROCEED_DELAY = 3500; // 3.5 seconds to read the result
        
        this.autoTransitionTimer = this.time.delayedCall(AUTO_PROCEED_DELAY, () => {
          if (this.hasTransitioned) {
            console.log('[EventScene] Already transitioned, skipping auto-proceed');
            return;
          }
          
          console.log('[EventScene] Auto-proceeding after event result...');
          this.handleContinueButton();
        });
      },
    });
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
    this.continueButton.setDepth(200);
    this.continueButton.setVisible(false);
    
    this.continueButton.on('pointerdown', () => {
      this.soundManager?.playSfx('ui_click');
      this.handleContinueButton();
    });
    this.continueButton.on('pointerover', () => {
      this.continueButton?.setColor('#f4e4bc');
      this.soundManager?.playSfx('sfx_card_click');
    });
    this.continueButton.on('pointerout', () => {
      this.continueButton?.setColor('#d4af37');
    });
  }

  /**
   * Handle continue button - check if multiplayer and mark as ready
   */
  private handleContinueButton(): void {
    if (this.players.length > 1 && this.lobbyId) {
      console.log('[EventScene] Multiplayer - marking ready to continue');
      
      // Mark self as ready
      if (this.userId) {
        this.readyPlayers.add(this.userId);
        console.log('[EventScene] Marked self as ready');
      }
      
      this.updateReadyIndicators();
      
      // Send ready vote
      if (this.lobbyId) {
        sendMapVote(this.lobbyId, 'ready').catch(err => {
          console.error('[EventScene] Failed to send ready vote:', err);
        });
      }
      
      // If host, check if all are ready
      if (this.isHost) {
        this.checkAllPlayersReady();
      }
    } else {
      // Single player - continue immediately
      this.continueToMap();
    }
  }
  
  /**
   * Check if all players are ready to continue
   */
  private checkAllPlayersReady(): void {
    if (!this.isHost) return;
    
    const totalPlayers = this.players.length;
    const readyCount = this.readyPlayers.size;
    
    console.log(`[EventScene] Ready check: ${readyCount}/${totalPlayers} players ready`);
    
    if (readyCount >= totalPlayers) {
      console.log('[EventScene] All players ready, continuing to map');
      
      // Broadcast continue signal
      if (this.lobbyId) {
        sendMapVoteResult(this.lobbyId, 'continue', {}).catch(err => {
          console.error('[EventScene] Failed to send continue signal:', err);
        });
      }
      
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
    bg.setStrokeStyle(2, 0x8b7355, 0.8);
    this.readyIndicators.add(bg);
    
    // Title
    const title = this.add.text(0, -10 - (this.players.length * 15), 'Ready Status', {
      fontSize: '14px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    this.readyIndicators.add(title);
    
    // Player ready status
    this.players.forEach((player, index) => {
      const isReady = this.readyPlayers.has(player.userId);
      const yPos = index * 30 - 5;
      
      // Checkmark or circle
      const statusIcon = this.add.text(-70, yPos, isReady ? '✓' : '○', {
        fontSize: '16px',
        color: isReady ? '#44ff88' : '#888888',
        fontFamily: 'Arial Black',
      });
      statusIcon.setOrigin(0.5);
      if (this.readyIndicators) {
        this.readyIndicators.add(statusIcon);
      }
      
      // Player name
      const nameText = this.add.text(-50, yPos, player.name.substring(0, 10), {
        fontSize: '12px',
        color: isReady ? '#44ff88' : '#b8a890',
        fontFamily: 'Georgia, serif',
      });
      nameText.setOrigin(0, 0.5);
      if (this.readyIndicators) {
        this.readyIndicators.add(nameText);
      }
    });
  }

  private continueToMap(): void {
    // Prevent duplicate transitions
    if (this.hasTransitioned) {
      console.log('[EventScene] Already transitioning, skipping...');
      return;
    }
    this.hasTransitioned = true;
    console.log('[EventScene] Starting transition to map...');
    
    // Clear ready indicators
    if (this.readyIndicators) {
      this.readyIndicators.destroy();
      this.readyIndicators = null;
    }
    
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
    
    // Clean up auto-transition timer
    if (this.autoTransitionTimer) {
      this.autoTransitionTimer.destroy();
      this.autoTransitionTimer = null;
    }
    
    // Clear ready players
    this.readyPlayers.clear();
  }

  destroy(): void {
    this.shutdown();
    if (this.soundManager) {
      this.soundManager.destroy();
      this.soundManager = null;
    }
  }
}

// Event data structures
interface EventData {
  id: string;
  title: string;
  description: string;
  choices: EventChoice[];
}

interface EventChoice {
  id: string;
  text: string;
  costType: 'gold' | 'consumable' | 'none'; // Type of cost
  costAmount: number; // Amount (gold value or consumable count)
  costItem?: string; // For consumables: card ID (e.g., 'healing_potion')
  consequences: EventConsequence[]; // Multiple consequences per choice
  description: string;
}

interface EventConsequence {
  type: 'gold' | 'heal' | 'damage' | 'card' | 'battle' | 'buff' | 'curse';
  amount?: number; // For gold/heal/damage amounts
  target?: 'all' | 'random' | 'self'; // Who gets affected
  cardId?: string; // For card rewards
  enemyType?: string; // For battle consequences
  chance?: number; // For random outcomes (0-1, e.g., 0.5 = 50%)
}
