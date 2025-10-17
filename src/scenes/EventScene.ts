import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { SoundManager } from '../game/sound';
import { subscribeMap, sendMapVote, sendMapVoteResult } from '../net/match';

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
  
  // Event data
  private currentEvent: EventData | null = null;
  private eventSeed: number = 0;
  
  // UI elements
  private titleText: Phaser.GameObjects.Text | null = null;
  private descriptionText: Phaser.GameObjects.Text | null = null;
  private choiceContainer: Phaser.GameObjects.Container | null = null;
  private continueButton: Phaser.GameObjects.Text | null = null;

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
  }): void {
    this.lobbyId = data.lobbyId || null;
    this.players = data.players || [];
    this.mapSeed = data.mapSeed || null;
    this.visitedNodes = data.visitedNodes || [];
    this.currentNodeId = data.currentNodeId || null;
    this.eventSeed = this.mapSeed || Date.now();
    
    console.log('EventScene initialized with node:', data.nodeId);
  }

  async create(): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;

    // Fantasy dark background
    this.cameras.main.setBackgroundColor('#0d0820');
    this.createFantasyBackground();

    // Initialize sound
    this.soundManager = new SoundManager(this);

    // Generate random event
    this.generateEvent();

    // Get current user and determine if host
    this.userId = await this.getCurrentUserId();
    this.isHost = this.players.length > 0 && this.players[0].userId === this.userId;

    // Create UI
    this.createTitle();
    this.createDescription();
    this.createChoices();
    this.createContinueButton();

    // Setup voting if multiple players
    if (this.players.length > 1 && this.lobbyId) {
      this.setupVoting();
    }

    // Play ambient sounds
    this.soundManager?.playMusic('ambient', { loop: true, volume: 0.2 });
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
            text: 'Purchase the artifact (50 gold)',
            cost: 50,
            reward: 'mysterious_artifact',
            description: 'You hand over the gold and receive a glowing crystal.',
          },
          {
            id: 'decline',
            text: 'Decline politely',
            cost: 0,
            reward: 'nothing',
            description: 'The merchant nods and disappears into the shadows.',
          },
          {
            id: 'threaten',
            text: 'Demand they hand it over',
            cost: 0,
            reward: 'potential_fight',
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
            text: 'Make an offering of gold (30 gold)',
            cost: 30,
            reward: 'divine_blessing',
            description: 'The shrine glows warmly as your offering is accepted.',
          },
          {
            id: 'take_offerings',
            text: 'Take the scattered offerings',
            cost: 0,
            reward: 'stolen_gold',
            description: 'You gather the offerings, but feel a chill down your spine.',
          },
          {
            id: 'investigate',
            text: 'Investigate the shrine carefully',
            cost: 0,
            reward: 'knowledge',
            description: 'You discover ancient knowledge inscribed on the walls.',
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
            cost: 1, // healing potion
            reward: 'grateful_companion',
            description: 'The traveler recovers and offers to join your journey.',
          },
          {
            id: 'give_gold',
            text: 'Give them some gold for medicine (25 gold)',
            cost: 25,
            reward: 'traveler_gratitude',
            description: 'The traveler thanks you profusely and shares valuable information.',
          },
          {
            id: 'ignore',
            text: 'Continue on your way',
            cost: 0,
            reward: 'nothing',
            description: 'You leave the traveler behind, but the guilt weighs on you.',
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

  private createChoices(): void {
    if (!this.currentEvent) return;
    
    const width = this.scale.width;
    const height = this.scale.height;
    
    this.choiceContainer = this.add.container(width / 2, height / 2 + 50);
    this.choiceContainer.setDepth(100);
    
    // Create choice buttons
    this.currentEvent.choices.forEach((choice, index) => {
      this.createChoiceButton(choice, index);
    });
  }

  private createChoiceButton(choice: EventChoice, index: number): void {
    if (!this.choiceContainer) return;
    
    const buttonWidth = 600;
    const buttonHeight = 60;
    const spacing = 20;
    const totalHeight = this.currentEvent!.choices.length * (buttonHeight + spacing) - spacing;
    const startY = -totalHeight / 2;
    
    const y = startY + index * (buttonHeight + spacing);
    
    // Button background
    const buttonBg = this.add.rectangle(0, y, buttonWidth, buttonHeight, 0x1a0f2e, 0.9);
    buttonBg.setStrokeStyle(2, 0x8b7355, 0.8);
    buttonBg.setInteractive();
    
    // Choice text
    const choiceText = this.add.text(0, y, choice.text, {
      fontSize: '16px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      align: 'center',
      wordWrap: { width: buttonWidth - 40 },
    });
    choiceText.setOrigin(0.5);
    
    // Cost indicator
    if (choice.cost > 0) {
      const costText = this.add.text(buttonWidth / 2 - 20, y, `💰${choice.cost}`, {
        fontSize: '14px',
        color: '#ff6b6b',
        fontFamily: 'Georgia, serif',
      });
      costText.setOrigin(0.5);
      this.choiceContainer.add(costText);
    }
    
    // Hover effects
    buttonBg.on('pointerover', () => {
      buttonBg.setFillStyle(0x2a1f3d, 0.9);
      choiceText.setColor('#f4e4bc');
      this.soundManager?.playSound('ui_hover');
    });
    
    buttonBg.on('pointerout', () => {
      buttonBg.setFillStyle(0x1a0f2e, 0.9);
      choiceText.setColor('#d4af37');
    });
    
    buttonBg.on('pointerdown', () => this.voteForChoice(choice));
    
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

  private makeChoiceDirectly(choice: EventChoice): void {
    console.log(`Made choice: ${choice.text}`);
    
    // TODO: Apply choice effects (costs, rewards, etc.)
    console.log(`Result: ${choice.description}`);
    
    // Hide choices and show result
    this.choiceContainer?.setVisible(false);
    this.showChoiceResult(choice);
  }

  private showChoiceResult(choice: EventChoice): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Result background
    const resultBg = this.add.rectangle(width / 2, height / 2, width - 100, 150, 0x1a0f2e, 0.9);
    resultBg.setStrokeStyle(2, 0x8b7355, 0.8);
    resultBg.setDepth(100);
    
    // Result text
    const resultText = this.add.text(width / 2, height / 2, choice.description, {
      fontSize: '18px',
      color: '#e8dcc0',
      fontFamily: 'Georgia, serif',
      align: 'center',
      wordWrap: { width: width - 150 },
    });
    resultText.setOrigin(0.5);
    resultText.setDepth(150);
    
    // Fade in effect
    resultBg.setAlpha(0);
    resultText.setAlpha(0);
    
    this.tweens.add({
      targets: [resultBg, resultText],
      alpha: 1,
      duration: 500,
      onComplete: () => {
        // Show continue button after delay
        this.time.delayedCall(2000, () => {
          this.continueButton?.setVisible(true);
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
    
    this.continueButton.on('pointerdown', () => this.continueToMap());
    this.continueButton.on('pointerover', () => {
      this.continueButton?.setColor('#f4e4bc');
      this.soundManager?.playSound('ui_hover');
    });
    this.continueButton.on('pointerout', () => {
      this.continueButton?.setColor('#d4af37');
    });
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
  cost: number; // gold or items
  reward: string;
  description: string;
}
