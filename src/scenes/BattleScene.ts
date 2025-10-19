import Phaser from 'phaser';
import { getCurrentUserId } from '../net/supa';
import {
  subscribeMatch,
  sendPlan,
  sendCommit,
  sendResolve,
  sendCursor,
} from '../net/match';
import { 
  Actor, 
  ActorId, 
  ActionPlan, 
  ActionType, 
  ResolvePayload,
  CursorPosition,
  Loadout 
} from '../net/proto';
import { 
  CombatState, 
  resolveTurn, 
  createCombatState, 
  reconcileState, 
  isCombatOver 
} from '../game/combat';
import { 
  AnimationTimeline, 
  buildTimeline, 
  AnimationCallbacks 
} from '../game/timeline';
import { COLORS } from '../game/config';
import { HandUI } from '../ui/handUi';
import { getCardById, requiresTarget } from '../game/cards';
import { startBattleAP, refreshAP, canAfford, spendAP } from '../game/economy';
import { SoundManager } from '../game/sound';
import { createCharacterAnimations, createCharacterSprite, hasSprite, CharacterClass } from '../game/characterSprites';
import { preloadEnemySprites, createEnemyAnimations, createEnemySprite, hasEnemySprite, EnemyType } from '../game/enemySprites';

/**
 * Side-view battle scene with deterministic combat pipeline
 */

// Extended Actor type for BattleScene that includes userId
interface BattleActor extends Actor {
  userId?: string;
  isHost?: boolean;
  selectedClass?: string; // 'Warrior', 'Huntress', or 'Mage'
}

export class BattleScene extends Phaser.Scene {
  private lobbyId: string | null = null;
  private userId: string | null = null;
  private isHost = false;
  private unsubscribe: (() => void) | null = null;
  private mapSeed: number | undefined = undefined; // Persist map across battles
  private visitedNodes: string[] = []; // Track visited nodes for map progression
  private currentNodeId: string | null = null; // Track current position on map

  // Combat state
  private combatState: CombatState;
  private currentTurn = 1;
  private currentStage = 1; // Track which battle this is (Stage 1, 2, 3, etc.)
  private phase: 'planning' | 'resolving' | 'idle' = 'planning';
  private playerPlans = new Map<ActorId, ActionPlan[]>(); // Multiple actions per player
  private isLocked = false;

  // UI elements
  private partySlots: Phaser.GameObjects.Container[] = [];
  private enemySlots: Phaser.GameObjects.Container[] = [];
  private actionButtons: Phaser.GameObjects.Container[] = [];
  private hudContainer!: Phaser.GameObjects.Container;
  private targetSelector: Phaser.GameObjects.Container | null = null;
  private selectedAction: ActionType | null = null;
  private selectedTarget: ActorId | null = null;
  private lockButton: Phaser.GameObjects.Container | null = null;
  private pendingActionDisplay: Phaser.GameObjects.Text | null = null;

  // Animation timeline
  private timeline: AnimationTimeline | null = null;

  // Player data
  private players: BattleActor[] = [];
  private enemies: Actor[] = [];
  private pendingPostState: Actor[] | null = null;
  
  // Card system
  private loadouts = new Map<ActorId, string[]>(); // userId -> cardIds
  private playerAP = new Map<ActorId, number>(); // userId -> current AP
  private handUI: HandUI | null = null;
  private selectedCardId: string | null = null;
  private apDisplayTexts = new Map<ActorId, Phaser.GameObjects.Text>(); // AP displays per player
  private queuedActions: ActionPlan[] = []; // Multiple actions queued for this turn
  private queueDisplay: Phaser.GameObjects.Container | null = null; // UI showing queued cards

  // Status effect indicators
  private statusEffectContainers = new Map<ActorId, Phaser.GameObjects.Container>(); // Status icons per actor

  // Cursor tracking
  private remoteCursors = new Map<string, Phaser.GameObjects.Container>();
  private cursorThrottle = 0;
  private readonly CURSOR_THROTTLE_MS = 50; // Send cursor updates every 50ms max

  // Combat log
  private combatLogContainer: Phaser.GameObjects.Container | null = null;
  private combatLogEntries: Phaser.GameObjects.Text[] = [];
  private readonly MAX_LOG_ENTRIES = 4;
  private readonly MAX_LOG_ENTRIES_EXPANDED = 12;
  private isLogExpanded = false;
  private logExpandButton: Phaser.GameObjects.Container | null = null;

  // Sound manager
  private soundManager: SoundManager | null = null;

  // Player stat displays (bottom left HUD)
  private playerHpText: Phaser.GameObjects.Text | null = null;
  private playerLevelText: Phaser.GameObjects.Text | null = null;
  private playerApText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('BattleScene');
  }

  init(data: { lobbyId: string; players: any[]; loadouts?: Loadout[]; mapSeed?: number; visitedNodes?: string[]; currentNodeId?: string; stage?: number }): void {
    this.lobbyId = data.lobbyId;
    this.players = data.players || [];
    this.mapSeed = data.mapSeed; // Store map seed for continuity
    this.visitedNodes = data.visitedNodes || []; // Store visited nodes
    this.currentNodeId = data.currentNodeId || null; // Store current position
    this.currentStage = data.stage || 1; // Track battle stage number
    
    // 🔄 RESET ALL BATTLE STATE FOR FRESH BATTLE
    console.log('🔄 Resetting battle state for new battle...');
    console.log(`📊 Stage ${this.currentStage} - Turn 1`);
    this.currentTurn = 1;
    this.phase = 'planning';
    this.isLocked = false;
    this.selectedAction = null;
    this.selectedTarget = null;
    this.selectedCardId = null;
    this.pendingPostState = null;
    this.timeline = null;
    
    // Clear UI elements
    if (this.handUI) {
      this.handUI.destroy();
      this.handUI = null;
    }
    if (this.queueDisplay) {
      this.queueDisplay.destroy();
      this.queueDisplay = null;
    }
    if (this.lockButton) {
      this.lockButton.destroy();
      this.lockButton = null;
    }
    if (this.targetSelector) {
      this.targetSelector.destroy();
      this.targetSelector = null;
    }
    
    // Clear collections
    this.combatLogEntries = [];
    this.playerPlans.clear();
    this.queuedActions = [];
    this.loadouts.clear();
    this.playerAP.clear();
    this.statusEffectContainers.clear();
    this.remoteCursors.clear();
    this.partySlots = [];
    this.enemySlots = [];
    this.actionButtons = [];
    
    console.log('✅ Battle state reset complete');
    
    console.log('=== BATTLE SCENE INIT DEBUG ===');
    console.log('🔄 Battle state RESET for fresh battle');
    console.log('Received data:', data);
    console.log('Players data:', data.players);
    console.log('Player classes:', data.players?.map(p => ({ name: p.name, class: p.selectedClass })));
    console.log('Loadouts in data:', data.loadouts);
    console.log('Visited nodes:', this.visitedNodes);
    console.log('Current node:', this.currentNodeId);
    
    // Initialize loadouts and AP
    if (data.loadouts) {
      console.log('Processing loadouts...');
      data.loadouts.forEach((loadout, index) => {
        console.log(`Loadout ${index}:`, loadout);
        console.log(`  userId: ${loadout.userId}`);
        console.log(`  cards: ${loadout.cards}`);
        this.loadouts.set(loadout.userId, loadout.cards);
      });
    } else {
      console.log('⚠️ No loadouts provided in init data!');
    }
    
    // Initialize AP for all players
    this.players.forEach(player => {
      this.playerAP.set(player.id, startBattleAP());
      console.log(`Set AP for player ${player.id}:`, startBattleAP());
    });
    
    console.log(`Battle scene initialized for lobby: ${this.lobbyId}`);
    console.log(`Final loadouts Map:`, Array.from(this.loadouts.entries()));
    console.log(`Initial AP Map:`, Array.from(this.playerAP.entries()));
    console.log(`Players:`, this.players);
    console.log('=== END INIT DEBUG ===');
  }

  /**
   * Generate enemies for the current stage
   */
  private generateEnemiesForStage(stage: number): Actor[] {
    console.log(`🎯 Generating enemies for Stage ${stage}`);
    
    switch (stage) {
      case 1:
        // Stage 1: Single Flying Demon
        return [
          {
            id: 'enemy_1',
            side: 'enemy',
            name: 'Flying Demon',
            hp: 50,
            maxHp: 50,
            ap: 5,
          },
        ];
      
      case 2:
        // Stage 2: Two Goblins
        return [
          {
            id: 'enemy_1',
            side: 'enemy',
            name: 'Goblin Warrior',
            hp: 40,
            maxHp: 40,
            ap: 5,
          },
          {
            id: 'enemy_2',
            side: 'enemy',
            name: 'Goblin Archer',
            hp: 35,
            maxHp: 35,
            ap: 5,
          },
        ];
      
      default:
        // Stage 3+: Scale difficulty
        const enemyCount = Math.min(1 + Math.floor(stage / 2), 3);
        const baseHP = 40 + (stage * 5);
        
        return Array.from({ length: enemyCount }, (_, i) => ({
          id: `enemy_${i + 1}`,
          side: 'enemy' as const,
          name: `Goblin ${i + 1}`,
          hp: baseHP,
          maxHp: baseHP,
          ap: 5,
        }));
    }
  }

  async create(): Promise<void> {
    console.log('Battle scene started');

    // Get current user
    this.userId = await getCurrentUserId();
    if (!this.userId || !this.lobbyId) {
      console.error('Missing userId or lobbyId');
      this.scene.start('MainMenu');
      return;
    }

    // Determine if host (first player)
    this.isHost = this.players.length > 0 && this.players[0].userId === this.userId;

    // Create character animations
    createCharacterAnimations(this);
    
    // Create enemy animations
    createEnemyAnimations(this);

    // Create enemies based on stage
    this.enemies = this.generateEnemiesForStage(this.currentStage);

    // Initialize combat state
    this.combatState = createCombatState(this.players, this.enemies, this.currentTurn);
    
    console.log(`=== COMBAT STATE INITIALIZATION ===`);
    console.log(`Is Host: ${this.isHost}`);
    console.log(`User ID: ${this.userId}`);
    console.log(`Current Turn: ${this.currentTurn}`);
    console.log(`Players:`, this.players);
    console.log(`Enemies:`, this.enemies);
    console.log(`Combat State:`, this.combatState);
    console.log(`=== END COMBAT STATE INIT ===`);

    // Set background color (fallback if image fails to load)
    this.cameras.main.setBackgroundColor('#0d0d0d');

    // Battle area dimensions
    const battleWidth = 1280;
    const battleHeight = 600;
    const bottomMargin = 120; // Space for action buttons
    
    // Add background image based on stage
    const bgKey = this.currentStage === 2 ? 'battleground2' : 'battleground1';
    console.log(`Loading background for stage ${this.currentStage}: ${bgKey}`);
    const bg = this.add.image(0, 0, bgKey);
    bg.setOrigin(0, 0);
    bg.setDepth(-1); // Behind everything
    
    // Scale background to fit the battle area (1280x600)
    const scaleX = battleWidth / bg.width;
    const scaleY = battleHeight / bg.height;
    const scale = Math.min(scaleX, scaleY); // Use min to fit within battle area
    bg.setScale(scale);
    
    // Center the background in the battle area
    const bgWidth = bg.width * scale;
    const bgHeight = bg.height * scale;
    const bgX = (this.scale.width - bgWidth) / 2;
    const bgY = (this.scale.height - bottomMargin - bgHeight) / 2;
    
    bg.setPosition(bgX, bgY);
    
    console.log(`Background loaded: ${bg.width}x${bg.height}`);
    console.log(`Battle area: ${battleWidth}x${battleHeight}`);
    console.log(`Background scaled to: ${bgWidth.toFixed(0)}x${bgHeight.toFixed(0)} at scale ${scale.toFixed(2)}x`);
    console.log(`Background position: (${bgX.toFixed(0)}, ${bgY.toFixed(0)})`);

    // Wireframe border disabled - uncomment to show battle area boundaries
    // this.createBattleAreaBorder();

    // Initialize sound manager
    this.soundManager = new SoundManager(this);
    console.log('Sound manager initialized');

    // Stop any card selection music that might still be playing
    console.log('Checking for card selection music...');
    const allSounds = this.sound.getAllPlaying();
    console.log('Currently playing sounds:', allSounds.map(s => s.key));
    
    allSounds.forEach(sound => {
      if (sound.key === 'music_cardselect') {
        console.log('Found card selection music, fading it out...');
        // Fade it out for smooth crossfade
        this.tweens.add({
          targets: sound,
          volume: 0,
          duration: 1500,
          ease: 'Linear',
          onComplete: () => {
            console.log('Card selection music fade complete, stopping...');
            sound.stop();
            sound.destroy();
          }
        });
      }
    });

    // Play battle music starting at 2 seconds with fade in
    this.soundManager.playMusicWithFadeIn('music_battle', { 
      volume: 0.3, 
      loop: true,
      seek: 2.0  // Start 2 seconds into the track
    }, 2000); // 2 second fade in for crossfade
    console.log('Battle music started with 2s fade in from 2 seconds');

    // Create battle layout
    this.createBattleLayout();
    this.createHUD();
    this.createActionButtons();
    this.createHandUI();

    // Add resize handler for responsive UI
    this.scale.on('resize', this.handleResize, this);

    // Subscribe to match updates
    subscribeMatch(this.lobbyId, {
      onActionVote: this.handleActionVote.bind(this),
      onCommitTurn: this.handleCommitTurn.bind(this),
      onResolveTurn: this.handleResolveTurn.bind(this),
      onCursorMove: this.handleCursorMove.bind(this),
    }).then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
    }).catch((error) => {
      console.error('Failed to subscribe to match:', error);
    });

    // Set up mouse tracking
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.handleLocalCursorMove(pointer.x, pointer.y);
    });

    // Start planning phase
    this.startPlanningPhase();
  }

  private createBattleLayout(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    // Create party slots (left side) - dynamic positioning based on player count
    const playerCount = this.players.length;
    
    for (let i = 0; i < playerCount; i++) {
      const player = this.players[i];
      let positionIndex: number;
      
      // Determine position index based on player count
      if (playerCount === 1) {
        positionIndex = 1; // Center position
      } else if (playerCount === 2) {
        positionIndex = i; // Front two positions (0 and 1)
      } else {
        positionIndex = i; // All three positions (0, 1, 2)
      }
      
      const slot = this.createPartySlot(
        centerX - 450 + positionIndex * 180,
        centerY,
        player
      );
      this.partySlots.push(slot);
    }

    // Create enemy slots (right side)
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const slot = this.createEnemySlot(
        centerX + 200 + i * 120,
        centerY,
        enemy
      );
      this.enemySlots.push(slot);
    }
  }

  private createPartySlot(
    x: number,
    y: number,
    player: Actor
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Slot background (will be hidden if sprite is used)
    const bg = this.add.rectangle(0, 0, 80, 120, 0x1a1a1a, 0.8);
    bg.setStrokeStyle(2, 0xffffff, 0.8);
    container.add(bg);

    // Player avatar - use sprite if class has one, otherwise use stick figure
    const battlePlayer = player as BattleActor;
    const characterClass = battlePlayer.selectedClass as CharacterClass;
    
    let spriteCreated = false;
    if (characterClass && hasSprite(characterClass)) {
      // Try to use character sprite
      try {
        const sprite = createCharacterSprite(this, 0, -10, characterClass, 2.5);
        if (sprite) {
          container.add(sprite);
          spriteCreated = true;
          bg.setVisible(false); // Hide background box when using sprite
          console.log(`✓ Using sprite for ${player.name} (${characterClass})`);
        }
      } catch (error) {
        console.error(`Failed to create sprite for ${characterClass}:`, error);
      }
    }
    
    // Fallback to stick figure if sprite wasn't created
    if (!spriteCreated) {
      console.log(`Using fallback stick figure for ${player.name}`);
      const avatar = this.add.graphics();
      avatar.lineStyle(2, 0xffffff, 0.8);
      
      // Simple stick figure
      avatar.beginPath();
      avatar.moveTo(0, -40); // Head
      avatar.lineTo(0, -20); // Body
      avatar.moveTo(-15, -10); // Left arm
      avatar.lineTo(15, -10); // Right arm
      avatar.moveTo(-10, 20); // Left leg
      avatar.lineTo(10, 20); // Right leg
      avatar.strokePath();

      // Robe
      avatar.lineStyle(2, 0x4a90e2, 0.8);
      avatar.beginPath();
      avatar.moveTo(-20, -15);
      avatar.lineTo(20, -15);
      avatar.lineTo(15, 30);
      avatar.lineTo(-15, 30);
      avatar.closePath();
      avatar.strokePath();

      container.add(avatar);
    }

    // Player name and class
    console.log(`Creating party slot for ${player.name}, selectedClass:`, battlePlayer.selectedClass);
    const displayName = battlePlayer.selectedClass 
      ? `${player.name}\n(${battlePlayer.selectedClass})`
      : player.name;
    const nameText = this.add.text(0, 50, displayName, {
      fontSize: '11px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      align: 'center',
    });
    nameText.setOrigin(0.5);
    container.add(nameText);

    // HP bar
    const hpBar = this.add.rectangle(0, 65, 60, 8, 0x2a2a2a, 1);
    hpBar.setStrokeStyle(1, 0xffffff, 0.5);
    container.add(hpBar);

    const hpFill = this.add.rectangle(-30, 65, 60 * (player.hp / player.maxHp), 8, 0x27ae60, 1);
    hpFill.setOrigin(0, 0.5);
    container.add(hpFill);

    // Action indicator (will be updated)
    const actionIndicator = this.add.text(0, 80, '', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
    });
    actionIndicator.setOrigin(0.5);
    container.add(actionIndicator);
    container.setData('actionIndicator', actionIndicator);

    // Lock indicator
    const lockIndicator = this.add.text(0, 95, '', {
      fontSize: '12px',
      color: '#f39c12',
      fontFamily: 'Arial, sans-serif',
    });
    lockIndicator.setOrigin(0.5);
    container.add(lockIndicator);
    container.setData('lockIndicator', lockIndicator);

    // Status effect container (above character)
    const statusContainer = this.add.container(0, -70);
    container.add(statusContainer);
    container.setData('statusContainer', statusContainer);
    
    // Store reference for easy access
    if (player.id) {
      this.statusEffectContainers.set(player.id, statusContainer);
    }

    return container;
  }

  /**
   * Map enemy name to enemy type for sprite lookup
   */
  private getEnemyType(enemyName: string): EnemyType | null {
    if (enemyName.includes('Flying Demon')) {
      return 'FlyingDemon';
    }
    if (enemyName.includes('Goblin')) {
      return 'Goblin';
    }
    // Future enemy types:
    // if (enemyName.includes('Skeleton')) return 'Skeleton';
    // if (enemyName.includes('Slime')) return 'Slime';
    
    return null;
  }

  private createEnemySlot(x: number, y: number, enemy: Actor): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Enemy background
    const bg = this.add.rectangle(0, 0, 100, 140, 0x2a1a1a, 0.8);
    bg.setStrokeStyle(2, 0xff4444, 0.8);
    container.add(bg);

    // Try to use enemy sprite based on name
    let spriteCreated = false;
    const enemyType = this.getEnemyType(enemy.name);
    
    if (enemyType && hasEnemySprite(enemyType)) {
      try {
        const sprite = createEnemySprite(this, 0, -10, enemyType, 1.5);
        if (sprite) {
          container.add(sprite);
          spriteCreated = true;
          bg.setVisible(false); // Hide background when using sprite
          console.log(`✓ Using sprite for enemy: ${enemy.name} (${enemyType})`);
        }
      } catch (error) {
        console.error(`Failed to create sprite for enemy ${enemyType}:`, error);
      }
    }
    
    // Fallback to generic monster shape if no sprite
    if (!spriteCreated) {
      console.log(`Using fallback graphics for enemy: ${enemy.name}`);
      const enemySprite = this.add.graphics();
      enemySprite.lineStyle(3, 0xff4444, 0.8);
      
      // Simple monster shape
      enemySprite.beginPath();
      enemySprite.moveTo(0, -50); // Top
      enemySprite.lineTo(-20, -30); // Left ear
      enemySprite.lineTo(-15, -10); // Left side
      enemySprite.lineTo(-25, 10); // Left arm
      enemySprite.lineTo(-10, 20); // Body
      enemySprite.lineTo(10, 20); // Right side
      enemySprite.lineTo(25, 10); // Right arm
      enemySprite.lineTo(15, -10); // Right side
      enemySprite.lineTo(20, -30); // Right ear
      enemySprite.closePath();
      enemySprite.strokePath();

      container.add(enemySprite);
    }

    // Enemy name
    const nameText = this.add.text(0, 60, enemy.name, {
      fontSize: '12px',
      color: '#ff4444',
      fontFamily: 'Arial, sans-serif',
    });
    nameText.setOrigin(0.5);
    container.add(nameText);

    // Enemy HP bar
    const hpBar = this.add.rectangle(0, 75, 80, 10, 0x2a2a2a, 1);
    hpBar.setStrokeStyle(1, 0xff4444, 0.5);
    container.add(hpBar);

    const hpFill = this.add.rectangle(-40, 75, 80 * (enemy.hp / enemy.maxHp), 10, 0xe74c3c, 1);
    hpFill.setOrigin(0, 0.5);
    container.add(hpFill);

    // Status effect container (above enemy)
    const statusContainer = this.add.container(0, -80);
    container.add(statusContainer);
    container.setData('statusContainer', statusContainer);
    
    // Store reference for easy access
    if (enemy.id) {
      this.statusEffectContainers.set(enemy.id, statusContainer);
    }

    return container;
  }

  private createHUD(): void {
    this.hudContainer = this.add.container(0, 0);

    // Combat log panel (bottom right corner - matches player stats size)
    const logWidth = 220;
    const logHeight = 80;
    const logX = this.scale.width - logWidth - 10; // Small margin from right edge
    const logY = this.scale.height - logHeight - 10; // Small margin from bottom edge
    
    this.combatLogContainer = this.add.container(logX, logY);
    this.combatLogContainer.setDepth(1000);

    // Combat log background with proper sizing
    const logBg = this.add.rectangle(logWidth / 2, logHeight / 2, logWidth, logHeight, 0x1a1a1a, 0.9);
    logBg.setStrokeStyle(1, 0x4a90e2, 0.6);
    logBg.setName('logBg');
    this.combatLogContainer.add(logBg);

    // Combat log title positioned within bounds
    const logTitle = this.add.text(10, 10, 'Combat Log', {
      fontSize: '14px',
      color: '#4a90e2',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    logTitle.setOrigin(0, 0);
    logTitle.setName('logTitle');
    this.combatLogContainer.add(logTitle);

    // Expand/collapse button
    this.createLogExpandButton();

    // Add initial message
    this.addCombatLogEntry('Battle begins!', '#4a90e2');

    // Stage and Turn indicator (top right) - with text shadow for visibility
    const stageText = this.add.text(this.scale.width - 20, 20, `Stage ${this.currentStage}`, {
      fontSize: '18px',
      color: '#d4af37',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    });
    stageText.setOrigin(1, 0);
    stageText.setDepth(1000);
    this.hudContainer.add(stageText);

    const turnText = this.add.text(this.scale.width - 20, 45, `Turn ${this.currentTurn}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    });
    turnText.setOrigin(1, 0);
    turnText.setDepth(1000);
    this.hudContainer.add(turnText);

    // Phase indicator (top left) - with text shadow for visibility
    const phaseText = this.add.text(
      20,
      20,
      'Planning',
      {
        fontSize: '22px',
        color: '#4a90e2',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      }
    );
    phaseText.setOrigin(0, 0);
    phaseText.setDepth(1000);
    this.hudContainer.add(phaseText);

    // Bottom left HUD with proper positioning and sizing
    const statsWidth = 220;
    const statsHeight = 80;
    const statsX = 10; // Small margin from left edge
    const statsY = this.scale.height - statsHeight - 10; // Small margin from bottom edge
    
    const bottomLeftBg = this.add.rectangle(statsX + statsWidth / 2, statsY + statsHeight / 2, statsWidth, statsHeight, 0x1a1a1a, 0.9);
    bottomLeftBg.setStrokeStyle(1, 0x4a90e2, 0.6);
    this.hudContainer.add(bottomLeftBg);

    // Store references to stat text objects so we can update them
    this.playerHpText = this.add.text(statsX + 10, statsY + 15, 'HP: 100%', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.hudContainer.add(this.playerHpText);

    this.playerLevelText = this.add.text(statsX + 10, statsY + 35, 'Level: 1', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.hudContainer.add(this.playerLevelText);

    this.playerApText = this.add.text(statsX + 10, statsY + 55, 'AP: 5', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.hudContainer.add(this.playerApText);
    
    // Update with actual player stats
    this.updatePlayerStatsDisplay();
  }

  private createBattleAreaBorder(): void {
    const graphics = this.add.graphics();
    graphics.setDepth(100); // On top of background but behind UI
    
    // Draw wireframe border around the play area
    const borderColor = 0x4a90e2;
    const borderAlpha = 0.5; // More visible to show battle boundaries
    const borderThickness = 4;
    
    // Battle area dimensions (1280x600)
    const battleWidth = 1280;
    const battleHeight = 600;
    const bottomMargin = 120; // Space for action buttons at bottom
    
    // Center the battle area on screen
    const battleX = (this.scale.width - battleWidth) / 2;
    const battleY = (this.scale.height - bottomMargin - battleHeight) / 2;
    
    graphics.lineStyle(borderThickness, borderColor, borderAlpha);
    graphics.strokeRect(
      battleX, 
      battleY, 
      battleWidth, 
      battleHeight
    );
    
    // Add corner markers for visual reference
    const markerSize = 20;
    const corners = [
      { x: battleX, y: battleY }, // Top-left
      { x: battleX + battleWidth, y: battleY }, // Top-right
      { x: battleX, y: battleY + battleHeight }, // Bottom-left
      { x: battleX + battleWidth, y: battleY + battleHeight }, // Bottom-right
    ];
    
    graphics.lineStyle(4, borderColor, borderAlpha * 0.9);
    corners.forEach((corner, index) => {
      // Draw L-shaped corner markers
      const isLeft = index === 0 || index === 2;
      const isTop = index === 0 || index === 1;
      
      // Horizontal line
      graphics.beginPath();
      if (isLeft) {
        graphics.moveTo(corner.x, corner.y);
        graphics.lineTo(corner.x + markerSize, corner.y);
      } else {
        graphics.moveTo(corner.x - markerSize, corner.y);
        graphics.lineTo(corner.x, corner.y);
      }
      graphics.strokePath();
      
      // Vertical line
      graphics.beginPath();
      if (isTop) {
        graphics.moveTo(corner.x, corner.y);
        graphics.lineTo(corner.x, corner.y + markerSize);
      } else {
        graphics.moveTo(corner.x, corner.y - markerSize);
        graphics.lineTo(corner.x, corner.y);
      }
      graphics.strokePath();
    });
    
    // Add center cross for reference
    const centerX = battleX + battleWidth / 2;
    const centerY = battleY + battleHeight / 2;
    const crossSize = 25;
    
    graphics.lineStyle(2, borderColor, borderAlpha * 0.5);
    // Horizontal line
    graphics.beginPath();
    graphics.moveTo(centerX - crossSize, centerY);
    graphics.lineTo(centerX + crossSize, centerY);
    graphics.strokePath();
    
    // Vertical line
    graphics.beginPath();
    graphics.moveTo(centerX, centerY - crossSize);
    graphics.lineTo(centerX, centerY + crossSize);
    graphics.strokePath();
    
    // Add subtle grid lines for spatial reference (more subtle with background)
    graphics.lineStyle(1, borderColor, borderAlpha * 0.2);
    
    // Vertical grid lines (every 200px within battle area)
    for (let i = 1; i * 200 < battleWidth; i++) {
      const x = battleX + i * 200;
      graphics.beginPath();
      graphics.moveTo(x, battleY);
      graphics.lineTo(x, battleY + battleHeight);
      graphics.strokePath();
    }
    
    // Horizontal grid lines (every 200px within battle area)
    for (let i = 1; i * 200 < battleHeight; i++) {
      const y = battleY + i * 200;
      graphics.beginPath();
      graphics.moveTo(battleX, y);
      graphics.lineTo(battleX + battleWidth, y);
      graphics.strokePath();
    }
    
    // Add dimension labels
    const labelStyle = {
      fontSize: '14px',
      color: '#4a90e2',
      fontFamily: 'monospace',
      backgroundColor: '#000000dd',
      padding: { x: 8, y: 4 },
    };
    
    const dimensionText = this.add.text(
      centerX,
      battleY + battleHeight - 30,
      `Battle Area: ${battleWidth}x${battleHeight}px`,
      labelStyle
    );
    dimensionText.setOrigin(0.5, 0);
    dimensionText.setDepth(1001);
  }

  private createActionButtons(): void {
    const centerX = this.scale.width / 2;
    const buttonY = this.scale.height - 100; // Moved up to avoid clipping with stats panel

    const actions = [
      { icon: '⚔️', type: 'Attack', color: 0xe74c3c },
      { icon: '🛡️', type: 'Guard', color: 0x3498db },
      { icon: '✨', type: 'Skill', color: 0x9b59b6 },
      { icon: '⏱️', type: 'Skip', color: 0x95a5a6 },
    ];

    // Calculate button spacing to ensure they fit within viewport
    const buttonWidth = 60;
    const totalWidth = actions.length * buttonWidth + (actions.length - 1) * 20; // 20px spacing
    const startX = Math.max(20, centerX - totalWidth / 2); // Ensure minimum margin from edges

    actions.forEach((action, index) => {
      const button = this.createActionButton(
        startX + index * (buttonWidth + 20),
        buttonY,
        action.icon,
        action.type as ActionType,
        action.color
      );
      this.actionButtons.push(button);
    });
  }

  private createActionButton(
    x: number,
    y: number,
    icon: string,
    actionType: ActionType,
    color: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Button background
    const bg = this.add.rectangle(0, 0, 60, 60, color, 1);
    bg.setStrokeStyle(2, 0xffffff, 0.8);
    bg.setInteractive({ useHandCursor: true });
    container.add(bg);

    // Icon
    const iconText = this.add.text(0, 0, icon, {
      fontSize: '24px',
      fontFamily: 'Arial, sans-serif',
    });
    iconText.setOrigin(0.5);
    container.add(iconText);

    // Hover effects
    bg.on('pointerover', () => {
      this.tweens.add({
        targets: container,
        scale: 1.1,
        duration: 100,
        ease: 'Power2',
      });
    });

    bg.on('pointerout', () => {
      this.tweens.add({
        targets: container,
        scale: 1,
        duration: 100,
        ease: 'Power2',
      });
    });

    // Click handler
    bg.on('pointerdown', () => {
      this.selectAction(actionType);
    });

    return container;
  }

  private createHandUI(): void {
    // Only create hand UI for the current player if they have a loadout
    console.log('=== CREATE HAND UI DEBUG ===');
    console.log('Current userId:', this.userId);
    console.log('All loadouts:', Array.from(this.loadouts.entries()));
    
    if (!this.userId) {
      console.log('No userId, skipping hand UI');
      return;
    }
    
    const myLoadout = this.loadouts.get(this.userId);
    console.log('My loadout lookup result:', myLoadout);
    
    if (!myLoadout || myLoadout.length === 0) {
      console.log('No loadout for current player, using default actions');
      console.log('Loadout was:', myLoadout);
      console.log('Available loadout keys:', Array.from(this.loadouts.keys()));
      return;
    }

    console.log(`Creating hand UI with cards:`, myLoadout);
    
    // Create hand UI
    this.handUI = new HandUI(
      this,
      myLoadout,
      (cardId) => this.selectCard(cardId)
    );

    // Update AP display
    const currentAP = this.playerAP.get(this.userId) || 0;
    this.handUI.setAP(currentAP);

    // Hide action buttons since we're using cards
    this.actionButtons.forEach(button => button.setVisible(false));
  }

  private selectCard(cardId: string): void {
    if (this.phase !== 'planning' || this.isLocked) {
      return;
    }

    console.log(`Selected card: ${cardId}`);
    const card = getCardById(cardId);
    if (!card) return;

    // Check if player can afford the card
    const currentAP = this.playerAP.get(this.userId!) || 0;
    if (!canAfford(currentAP, card.ap)) {
      console.log(`Cannot afford card ${cardId}: need ${card.ap} AP, have ${currentAP}`);
      this.showPendingActionText(`❌ Not enough AP! Need ${card.ap}, have ${currentAP}`, '#e74c3c');
      return;
    }

    this.selectedCardId = cardId;
    this.selectedAction = 'Card'; // Set action type to Card
    this.selectedTarget = null;

    // Show target selector if card requires target
    if (requiresTarget(card)) {
      this.showTargetSelector(card.target);
    } else {
      // No target needed, can play immediately
      this.playSelectedCard(null);
    }
  }

  private playSelectedCard(targetId: ActorId | null): void {
    if (!this.userId || !this.selectedCardId) return;

    const card = getCardById(this.selectedCardId);
    if (!card) return;

    // Find current player actor
    const playerActor = this.players.find(p => p.userId === this.userId);
    if (!playerActor) {
      console.error('Player actor not found');
      return;
    }

    // Deduct AP
    const currentAP = this.playerAP.get(this.userId) || 0;
    const newAP = spendAP(currentAP, card.ap);
    this.playerAP.set(this.userId, newAP);

    // Queue the action
    const action: ActionPlan = {
      by: playerActor.id,
      type: 'Card',
      target: targetId || undefined,
      cardId: this.selectedCardId,
    };
    this.queuedActions.push(action);

    console.log(`Card ${card.name} played! AP: ${currentAP} -> ${newAP}`);
    console.log(`Queued actions: ${this.queuedActions.length}`);

    // Update hand UI
    if (this.handUI) {
      this.handUI.setAP(newAP);
      this.handUI.clearSelection();
    }

    // Update player stats display
    this.updatePlayerStatsDisplay();

    // Update queued actions display
    this.updateQueueDisplay();

    // Show feedback
    this.showPendingActionText(
      `✓ ${card.name} queued! AP: ${newAP}/${currentAP + card.ap} | ${this.queuedActions.length} card(s) ready`,
      '#27ae60'
    );

    // Clear selection
    this.selectedCardId = null;
    this.selectedAction = null;
    this.selectedTarget = null;

    // Show lock button to end turn
    this.showLockButton();
  }

  private selectAction(actionType: ActionType): void {
    if (this.phase !== 'planning' || this.isLocked || !this.lobbyId) {
      return;
    }

    console.log(`Selected action: ${actionType}`);
    this.selectedAction = actionType;
    this.selectedTarget = null;

    // Visual feedback - highlight selected button
    this.highlightSelectedButton(actionType);

    // Show target selector for actions that need targets
    if (actionType === 'Attack' || actionType === 'Skill') {
      this.showPendingActionText(`Select target for ${actionType}...`);
      this.showTargetSelector(actionType);
    } else {
      // Direct action (Guard, Skip) - show confirmation
      this.showPendingActionText(`${actionType} selected - Ready to lock!`);
      this.showLockButton();
    }
  }

  private showTargetSelector(targetType: string): void {
    this.hideTargetSelector();
    this.hideLockButton();

    this.targetSelector = this.add.container(0, 0);

    // Highlight valid targets based on target type
    let targets: Actor[];
    if (targetType === 'enemy' || targetType === 'Attack') {
      targets = this.enemies;
    } else if (targetType === 'ally' || targetType === 'Guard' || targetType === 'Skill') {
      targets = this.players;
    } else {
      targets = [];
    }
    
    targets.forEach((target, index) => {
      const isEnemy = target.side === 'enemy';
      const slot = isEnemy ? this.enemySlots[index] : this.partySlots[index];
      if (slot) {
        const highlight = this.add.rectangle(slot.x, slot.y, 100, 150, 0xffff00, 0.3);
        highlight.setStrokeStyle(3, 0xffff00, 0.8);
        highlight.setInteractive({ useHandCursor: true });
        this.targetSelector!.add(highlight);

        // Hover effect
        highlight.on('pointerover', () => {
          highlight.setAlpha(0.5);
        });

        highlight.on('pointerout', () => {
          highlight.setAlpha(0.3);
        });

        highlight.on('pointerdown', () => {
          console.log(`Selected target: ${target.name} (${target.id})`);
          this.selectedTarget = target.id;
          this.hideTargetSelector();
          
          // If playing a card, execute it immediately
          if (this.selectedAction === 'Card' && this.selectedCardId) {
            this.playSelectedCard(target.id);
          } else {
            // Old action system (Attack, Guard, Skill, Skip)
            const actionText = this.selectedAction;
            this.showPendingActionText(`${actionText} → ${target.name} - Ready to lock!`, '#27ae60');
            this.showLockButton();
          }
        });
      }
    });

    // Cancel button
    const cancelBg = this.add.rectangle(this.scale.width / 2, this.scale.height - 120, 100, 40, 0x666666, 1);
    cancelBg.setStrokeStyle(2, 0xffffff, 0.8);
    cancelBg.setInteractive({ useHandCursor: true });
    this.targetSelector.add(cancelBg);

    const cancelText = this.add.text(this.scale.width / 2, this.scale.height - 120, 'Cancel', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    cancelText.setOrigin(0.5);
    this.targetSelector.add(cancelText);

    cancelBg.on('pointerdown', () => {
      this.hideTargetSelector();
      this.selectedAction = null;
      this.selectedTarget = null;
      this.selectedCardId = null;
      this.hidePendingActionText();
      this.clearButtonHighlights();
      
      // Clear card selection in hand UI
      if (this.handUI) {
        this.handUI.clearSelection();
      }
    });
  }

  private hideTargetSelector(): void {
    if (this.targetSelector) {
      this.targetSelector.destroy();
      this.targetSelector = null;
    }
  }

  private async lockAction(): Promise<void> {
    if (!this.lobbyId || !this.userId) return;

    this.hideTargetSelector();
    this.hideLockButton();

    // Find current player actor
    const playerActor = this.players.find(p => p.userId === this.userId);
    if (!playerActor) {
      console.error('Player actor not found for userId:', this.userId);
      this.showPendingActionText(`❌ Player not found! Refresh and try again.`, '#e74c3c');
      return;
    }

    // Use queued actions if any cards were played, otherwise use old action system
    const plansToSend: ActionPlan[] = [];

    if (this.queuedActions.length > 0) {
      // Send all queued actions
      plansToSend.push(...this.queuedActions);
      console.log(`Locking ${this.queuedActions.length} queued action(s):`, this.queuedActions);
    } else if (this.selectedAction) {
      // Old action system (Attack, Guard, Skill, Skip)
      plansToSend.push({
        by: playerActor.id,
        type: this.selectedAction,
        target: this.selectedTarget || undefined,
        cardId: this.selectedCardId || undefined,
      });
    } else {
      // No action selected - skip turn (preserve AP)
      plansToSend.push({
        by: playerActor.id,
        type: 'Skip',
      });
      console.log('No action selected, skipping turn to preserve AP');
    }

    console.log('Created action plans:', plansToSend);
    console.log('Player actor used:', playerActor);

    // Show loading state
    const actionCount = this.queuedActions.length > 0 ? `${this.queuedActions.length} action(s)` : (this.selectedAction || 'turn');
    this.showPendingActionText(`🔄 Locking ${actionCount}...`, '#f39c12');

    try {
      console.log(`Locking actions:`, plansToSend);
      console.log(`Sending to lobby: ${this.lobbyId}, turn: ${this.currentTurn}`);
      console.log(`Player actor:`, playerActor);
      
      // Send all plans
      for (const plan of plansToSend) {
        await sendPlan(this.lobbyId, plan, this.currentTurn);
      }
      
      console.log('All action plans sent successfully!');
      
      // Update local state - store all plans for this player
      this.playerPlans.set(playerActor.id, plansToSend);
      this.isLocked = true;
      
      // Clear pending action
      this.hidePendingActionText();
      this.clearButtonHighlights();
      
      // Show locked confirmation
      const lockMessage = this.queuedActions.length > 0 
        ? `✓ ${this.queuedActions.length} card(s) locked! Waiting for others...`
        : `✓ ${this.selectedAction} locked! Waiting for others...`;
      this.showPendingActionText(lockMessage, '#27ae60');
      
      // Update action indicators
      this.updateActionIndicators();

      // Check if all players have committed (host only)
      if (this.isHost && this.phase === 'planning') {
        console.log('Host checking if all players committed...');
        console.log('Current plans:', Array.from(this.playerPlans.entries()));
        console.log('All players:', this.players.map(p => ({ id: p.id, name: p.name })));
        
        const allCommitted = this.players.every(player => this.playerPlans.has(player.id));
        console.log('All committed:', allCommitted);
        
        if (allCommitted) {
          console.log('All players committed! Host will resolve turn...');
          this.commitTurn();
        }
      }
    } catch (error) {
      console.error('Failed to send action plan:', error);
      console.error('Error details:', {
        lobbyId: this.lobbyId,
        userId: this.userId,
        currentTurn: this.currentTurn,
        plansToSend,
        playerActor,
        error: (error as any).message || error
      });
      
      // Show more specific error message
      let errorMsg = '❌ Failed to lock action! Try again.';
      const errorMessage = (error as any).message || '';
      if (errorMessage.includes('Not authenticated')) {
        errorMsg = '❌ Authentication error! Refresh and try again.';
      } else if (errorMessage.includes('network')) {
        errorMsg = '❌ Network error! Check connection.';
      } else if (errorMessage.includes('Player not found')) {
        errorMsg = '❌ Player not found! Refresh and try again.';
      }
      
      this.showPendingActionText(errorMsg, '#e74c3c');
      
      // Reset state to allow retry
      this.isLocked = false;
      this.selectedAction = null;
      this.selectedTarget = null;
      
      // Show retry button after 2 seconds
      this.time.delayedCall(2000, () => {
        if (!this.isLocked) {
          this.showRetryButton();
        }
      });
    }
  }

  private handleActionVote(plan: ActionPlan, userId: string, turn: number): void {
    console.log(`Received action vote: ${plan.type} from ${userId} for turn ${turn}`);
    console.log(`Current turn: ${this.currentTurn}, Phase: ${this.phase}`);
    
    if (turn !== this.currentTurn) {
      console.log(`Ignoring action vote for wrong turn: ${turn} (current: ${this.currentTurn})`);
      return;
    }

    // Update local state - accumulate multiple plans per player
    const existingPlans = this.playerPlans.get(plan.by) || [];
    existingPlans.push(plan);
    this.playerPlans.set(plan.by, existingPlans);
    this.updateActionIndicators();

    console.log('Updated player plans:', Array.from(this.playerPlans.entries()));

    // Show notification that other player locked in (only once per player)
    const player = this.players.find(p => p.id === plan.by);
    const playerPlans = this.playerPlans.get(plan.by) || [];
    
    // Only show notification for the first action from this player
    if (player && playerPlans.length === 1) {
      const actionCount = playerPlans.length;
      this.showPlayerLockedNotification(player.name, plan.type, actionCount);
    }

    // Check if all players have committed (host only)
    if (this.isHost && this.phase === 'planning') {
      console.log('Host checking if all players committed after receiving vote...');
      console.log('All players:', this.players.map(p => ({ id: p.id, name: p.name })));
      
      const allCommitted = this.players.every(player => this.playerPlans.has(player.id));
      console.log('All committed:', allCommitted);
      
      if (allCommitted) {
        console.log('All players committed! Host will resolve turn...');
        this.commitTurn();
      } else {
        const missingPlayers = this.players.filter(player => !this.playerPlans.has(player.id));
        console.log('Still waiting for:', missingPlayers.map(p => p.name));
      }
    }
  }

  private async commitTurn(): Promise<void> {
    if (!this.isHost || !this.lobbyId) return;

    console.log('Committing turn...');
    console.log('Current plans:', Array.from(this.playerPlans.entries()));
    console.log('Current turn:', this.currentTurn);
    
    this.phase = 'resolving';
    this.updateUI();
    
    // Add resolving log entry
    this.addCombatLogEntry('All players ready - Resolving!', '#e67e22');

    try {
      console.log('Sending commit turn message...');
      await sendCommit(this.lobbyId, this.currentTurn);
      console.log('Commit message sent successfully');
      
      // Resolve turn - flatten all plans into a single array
      const partyPlans: ActionPlan[] = [];
      this.playerPlans.forEach(plans => {
        partyPlans.push(...plans);
      });
      console.log('Resolving turn with plans:', partyPlans);
      
      const payload = resolveTurn(this.combatState, partyPlans, this.lobbyId);
      console.log('Generated resolution payload:', payload);
      
      console.log('Sending resolve turn message...');
      await sendResolve(this.lobbyId, payload);
      console.log('Resolve message sent successfully');
    } catch (error) {
      console.error('Failed to commit/resolve turn:', error);
    }
  }

  private handleCommitTurn(turn: number): void {
    if (turn !== this.currentTurn) return;
    
    console.log('Turn committed, resolving...');
    this.phase = 'resolving';
    this.updateUI();
  }

  private handleResolveTurn(payload: ResolvePayload): void {
    console.log(`=== RESOLVE TURN DEBUG ===`);
    console.log(`Resolved turn ${payload.turn}:`, payload);
    console.log(`Current turn: ${this.currentTurn}, Phase: ${this.phase}`);
    console.log(`Is Host: ${this.isHost}`);
    console.log(`User ID: ${this.userId}`);
    console.log(`=== END RESOLVE TURN DEBUG ===`);
    
    // Build animation timeline
    this.buildAnimationTimeline(payload);
    
    // Don't reconcile state immediately - let animations apply damage
    // reconcileState(this.combatState, payload.post);
    console.log('Post-turn state (not yet applied):', payload.post);
    
    // Store the post-turn state to apply after animations
    this.pendingPostState = payload.post;
    
    // Deserialize and persist DOT effects for next turn
    console.log('📦 Received payload.dots:', payload.dots);
    if (payload.dots && payload.dots.length > 0) {
      const dotsMap = new Map();
      for (const entry of payload.dots) {
        console.log(`🔮 Deserializing DOTs for actor ${entry.actorId}:`, entry.effects);
        dotsMap.set(entry.actorId, entry.effects);
      }
      this.combatState.dots = dotsMap;
      console.log('✅ DOT effects persisted for next turn:', Array.from(dotsMap.entries()));
    } else {
      // Clear DOT effects if none exist
      console.log('🧹 No DOT effects in payload, clearing combatState.dots');
      this.combatState.dots = new Map();
    }
    
    // Update status indicators after DOT persistence
    this.updateAllStatusIndicators();
    
    // DON'T check for combat end here - wait until animations complete
    // This allows death animations to play out fully
    
    // Start next turn (will be used if combat doesn't end)
    this.currentTurn = payload.turn + 1;
    this.combatState.turn = this.currentTurn;
    console.log(`Starting turn ${this.currentTurn}`);
    
    // Reset for next turn
    this.playerPlans.clear();
    this.isLocked = false;
    this.selectedAction = null;
    this.selectedTarget = null;
    
    // Start timeline
    if (this.timeline) {
      console.log('Starting animation timeline...');
      console.log('Timeline before start:', {
        events: this.timeline.events?.length || 0,
        isPlaying: this.timeline.isPlaying,
        isActive: this.timeline.isActive()
      });
      
      this.timeline.start();
      
      console.log('Timeline after start:', {
        events: this.timeline.events?.length || 0,
        isPlaying: this.timeline.isPlaying,
        isActive: this.timeline.isActive()
      });
    } else {
      console.warn('No timeline to start!');
    }
  }

  private buildAnimationTimeline(payload: ResolvePayload): void {
    console.log('Building animation timeline with effects:', payload.effects);
    
    const callbacks: AnimationCallbacks = {
      onTelegraph: (srcId, dstId) => {
        console.log(`Animation: Telegraph from ${srcId} to ${dstId}`);
        const srcName = this.getActorName(srcId);
        const dstName = dstId ? this.getActorName(dstId) : '';
        if (dstId) {
          this.addCombatLogEntry(`${srcName} targets ${dstName}`, '#f39c12');
        }
        this.playTelegraph(srcId, dstId);
      },
      onStrike: (srcId, dstId, note) => {
        console.log(`Animation: Strike from ${srcId} to ${dstId} (${note})`);
        // Play sound based on the action note
        // Only play card sounds for actual card names (not animation types like "slash")
        if (note && this.soundManager) {
          const validCardNames = ['Strike', 'Nova', 'Bash'];
          if (validCardNames.includes(note)) {
            console.log(`Playing card sound for: ${note}`);
            this.soundManager.playCardSound(note);
          } else {
            console.log(`Skipping sound for non-card note: ${note}`);
          }
        }
        this.playStrike(srcId, dstId, note);
      },
      onHit: (srcId, dstId, damage) => {
        console.log(`=== HIT ANIMATION CALLBACK ===`);
        console.log(`Animation: Hit from ${srcId} to ${dstId} for ${damage} damage`);
        const srcName = this.getActorName(srcId);
        const dstName = this.getActorName(dstId);
        this.addCombatLogEntry(`${srcName} hits ${dstName} for ${damage} damage!`, '#e74c3c');
        
        // Don't play sound here - it's already played in onStrike callback
        // This prevents double-playing the Strike sound
        
        this.playHit(srcId, dstId, damage);
        
        // Apply damage immediately so health drops are visible during animations
        // Both clients receive the same damage values from the resolve payload, so this stays in sync
        console.log(`Applying damage to ${dstId} during animation`);
        this.applyDamageToActor(dstId, damage);
        console.log(`=== END HIT ANIMATION CALLBACK ===`);
      },
      onGuard: (srcId, value) => {
        console.log(`Animation: Guard from ${srcId} with value ${value}`);
        const srcName = this.getActorName(srcId);
        this.addCombatLogEntry(`${srcName} guards (-${value} damage)`, '#3498db');
        
        // Play guard sound
        if (this.soundManager) {
          this.soundManager.playCardSound('Guard');
        }
        
        this.playGuard(srcId, value);
      },
      onHeal: (srcId, dstId, value) => {
        console.log(`Animation: Heal from ${srcId} to ${dstId} for ${value} HP`);
        const srcName = this.getActorName(srcId);
        const dstName = this.getActorName(dstId);
        if (srcId === dstId) {
          this.addCombatLogEntry(`${srcName} heals for ${value} HP!`, '#27ae60');
        } else {
          this.addCombatLogEntry(`${srcName} heals ${dstName} for ${value} HP!`, '#27ae60');
        }
        
        // Play heal sound
        if (this.soundManager) {
          this.soundManager.playCardSound('Mend');
        }
        
        this.playHeal(srcId, dstId, value);
        
        // Apply healing immediately so health increases are visible during animations
        // Both clients receive the same healing values from the resolve payload, so this stays in sync
        this.applyHealingToActor(dstId, value);
      },
      onVfx: (srcId, dstId, note) => {
        console.log(`=== VFX CALLBACK ===`);
        console.log(`Animation: VFX from ${srcId} to ${dstId} (${note})`);
        console.log(`Sound manager exists: ${!!this.soundManager}`);
        
        // Add combat log entries for status effects
        if (note === 'vulnerable' && dstId) {
          const srcName = this.getActorName(srcId);
          const dstName = this.getActorName(dstId);
          this.addCombatLogEntry(`${srcName} weakens ${dstName}! (+2 dmg taken)`, '#9b59b6');
        }
        
        // Play sound effects for special VFX
        if (note && this.soundManager) {
          console.log(`VFX note detected: "${note}"`);
          if (note === 'vulnerable') {
            console.log('✓ Matched "vulnerable" - Playing Weaken sound...');
            this.soundManager.playCardSound('Weaken');
          } else if (note === 'stun') {
            console.log('✓ Matched "stun" - Playing Bash sound...');
            this.soundManager.playCardSound('Bash');
          } else {
            console.log(`No sound mapping for VFX note: "${note}"`);
          }
        }
        
        this.playVfx(srcId, dstId, note);
        console.log(`=== END VFX CALLBACK ===`);
      },
    };

    this.timeline = buildTimeline(payload.effects, callbacks);
    console.log('Timeline built with', payload.effects.length, 'effects');
  }

  private playTelegraph(srcId: ActorId, dstId?: ActorId): void {
    const srcSlot = this.getActorSlot(srcId);
    if (srcSlot) {
      // Telegraph animation - brief scale up (slowed for visibility)
      this.tweens.add({
        targets: srcSlot,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 400, // Was 150ms
        yoyo: true,
        ease: 'Power2',
      });
    }
  }

  /**
   * Fire an arrow projectile from Huntress to target
   */
  private fireArrowProjectile(srcSlot: Phaser.GameObjects.Container, dstSlot: Phaser.GameObjects.Container): void {
    // Create arrow sprite
    const arrow = this.add.image(srcSlot.x, srcSlot.y, 'huntress_arrow');
    arrow.setScale(2); // Scale up the small arrow
    arrow.setDepth(50); // Above characters but below UI
    
    // Calculate angle to target
    const angle = Phaser.Math.Angle.Between(srcSlot.x, srcSlot.y, dstSlot.x, dstSlot.y);
    arrow.setRotation(angle);
    
    console.log(`🏹 Firing arrow from (${srcSlot.x}, ${srcSlot.y}) to (${dstSlot.x}, ${dstSlot.y})`);
    
    // Tween arrow to target
    this.tweens.add({
      targets: arrow,
      x: dstSlot.x,
      y: dstSlot.y,
      duration: 200, // Fast arrow flight
      ease: 'Linear',
      onComplete: () => {
        // Fade out and destroy arrow on impact
        this.tweens.add({
          targets: arrow,
          alpha: 0,
          duration: 100,
          onComplete: () => arrow.destroy(),
        });
      },
    });
  }

  private playStrike(srcId: ActorId, dstId: ActorId, note?: string): void {
    const srcSlot = this.getActorSlot(srcId);
    const dstSlot = this.getActorSlot(dstId);
    
    if (srcSlot) {
      // Try to play attack animation on character sprite
      const actor = [...this.players, ...this.enemies].find(a => a.id === srcId);
      if (actor && actor.side === 'party') {
        const battleActor = actor as BattleActor;
        const characterClass = battleActor.selectedClass;
        
        // Find sprite in the container
        const sprite = srcSlot.list.find(obj => obj.type === 'Sprite') as Phaser.GameObjects.Sprite | undefined;
        
        if (sprite && characterClass) {
          // Play attack animation if available
          let attackAnimKey: string | null = null;
          
          if (characterClass === 'Mage') {
            attackAnimKey = 'mage_attack_anim';
          } else if (characterClass === 'Warrior') {
            attackAnimKey = 'warrior_attack_anim';
          } else if (characterClass === 'Huntress') {
            attackAnimKey = 'huntress_attack_anim';
            
            // Fire arrow projectile for Huntress
            if (dstSlot) {
              this.fireArrowProjectile(srcSlot, dstSlot);
            }
          }
          
          if (attackAnimKey && this.anims.exists(attackAnimKey)) {
            console.log(`Playing attack animation: ${attackAnimKey}`);
            sprite.play(attackAnimKey);
            
            // Return to idle after attack animation completes
            sprite.once('animationcomplete', () => {
              const idleKey = `${characterClass.toLowerCase()}_idle_anim`;
              if (this.anims.exists(idleKey)) {
                sprite.play(idleKey);
              }
            });
          }
        }
      }
      
      // Strike animation - forward movement (slowed for visibility)
      this.tweens.add({
        targets: srcSlot,
        x: srcSlot.x + 20,
        duration: 250, // Was 100ms
        yoyo: true,
        ease: 'Power2',
      });
    }
    
    if (dstSlot) {
      // Hit animation - shake effect (slowed for visibility)
      this.tweens.add({
        targets: dstSlot,
        scaleX: 0.85,
        scaleY: 0.85,
        duration: 250, // Was 100ms
        yoyo: true,
        ease: 'Power2',
      });
    }
  }

  private playHit(srcId: ActorId, dstId: ActorId, damage: number): void {
    const dstSlot = this.getActorSlot(dstId);
    if (dstSlot) {
      // Try to play hurt animation on character sprite
      const actor = [...this.players, ...this.enemies].find(a => a.id === dstId);
      if (actor && actor.side === 'party') {
        const battleActor = actor as BattleActor;
        const characterClass = battleActor.selectedClass;
        
        // Find sprite in the container
        const sprite = dstSlot.list.find(obj => obj.type === 'Sprite') as Phaser.GameObjects.Sprite | undefined;
        
        if (sprite && characterClass) {
          // Play hurt animation if available
          let hurtAnimKey: string | null = null;
          
          if (characterClass === 'Mage') {
            hurtAnimKey = 'mage_hurt_anim';
          } else if (characterClass === 'Warrior') {
            hurtAnimKey = 'warrior_hurt_anim';
          } else if (characterClass === 'Huntress') {
            hurtAnimKey = 'huntress_hurt_anim';
          }
          
          if (hurtAnimKey && this.anims.exists(hurtAnimKey)) {
            console.log(`💔 Playing hurt animation: ${hurtAnimKey}`);
            sprite.play(hurtAnimKey);
            
            // Return to idle after hurt animation completes
            sprite.once('animationcomplete', () => {
              const idleKey = `${characterClass.toLowerCase()}_idle_anim`;
              if (this.anims.exists(idleKey)) {
                sprite.play(idleKey);
              }
            });
          }
        }
      }
      
      // Damage number (larger and slower for visibility)
      const damageText = this.add.text(
        dstSlot.x + 50,
        dstSlot.y - 30,
        `-${damage}`,
        {
          fontSize: '28px', // Was 20px
          color: '#ff4444',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        }
      );
      damageText.setOrigin(0.5);
      damageText.setDepth(100);

      this.tweens.add({
        targets: damageText,
        y: damageText.y - 60, // Float up more
        alpha: 0,
        duration: 1500, // Was 1000ms
        ease: 'Power2',
        onComplete: () => damageText.destroy(),
      });
    }
  }

  /**
   * Play death animation for an enemy
   */
  private playEnemyDeath(enemyId: ActorId): void {
    const enemySlot = this.getActorSlot(enemyId);
    if (!enemySlot) return;

    const enemy = this.enemies.find(e => e.id === enemyId);
    if (!enemy) return;

    // Find sprite in the enemy slot
    const sprite = enemySlot.list.find(obj => obj.type === 'Sprite') as Phaser.GameObjects.Sprite | undefined;
    
    if (sprite) {
      const enemyType = this.getEnemyType(enemy.name);
      
      if (enemyType) {
        let deathAnimKey: string | null = null;
        
        if (enemyType === 'Goblin') {
          deathAnimKey = 'goblin_death_anim';
        } else if (enemyType === 'FlyingDemon') {
          deathAnimKey = 'flying_demon_death_anim';
        }
        
        if (deathAnimKey && this.anims.exists(deathAnimKey)) {
          console.log(`💀 Playing death animation: ${deathAnimKey}`);
          
          // Stop any existing animations and tweens
          sprite.stop();
          this.tweens.killTweensOf(sprite);
          
          // Play death animation
          sprite.play(deathAnimKey);
          
          // Fade out after death animation completes
          sprite.once('animationcomplete', () => {
            this.tweens.add({
              targets: enemySlot,
              alpha: 0,
              duration: 500,
              ease: 'Power2',
              onComplete: () => {
                // Keep invisible but don't destroy (causes issues with targeting)
                enemySlot.setVisible(false);
              },
            });
          });
        } else {
          // Fallback: fade out without death animation
          this.tweens.add({
            targets: enemySlot,
            alpha: 0,
            duration: 500,
            ease: 'Power2',
          });
        }
      }
    } else {
      // No sprite found, just fade out the entire slot
      this.tweens.add({
        targets: enemySlot,
        alpha: 0,
        duration: 500,
        ease: 'Power2',
      });
    }
  }

  private playGuard(srcId: ActorId, value: number): void {
    const srcSlot = this.getActorSlot(srcId);
    if (srcSlot) {
      // Shield icon - more prominent and lasts longer
      const shield = this.add.graphics();
      shield.lineStyle(4, 0x3498db, 1.0);
      shield.fillStyle(0x3498db, 0.3);
      
      // Draw a shield shape
      shield.beginPath();
      shield.arc(srcSlot.x, srcSlot.y, 40, 0, Math.PI * 2);
      shield.strokePath();
      shield.fillPath();
      
      // Shield value text (shows how much damage is blocked)
      const shieldText = this.add.text(
        srcSlot.x,
        srcSlot.y,
        `🛡️ ${value}`,
        {
          fontSize: '24px',
          color: '#3498db',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        }
      );
      shieldText.setOrigin(0.5);
      shieldText.setDepth(100);

      // Pulse effect for shield
      this.tweens.add({
        targets: shield,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 300,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });

      // Fade out after showing for a while
      this.tweens.add({
        targets: [shield, shieldText],
        alpha: 0,
        duration: 800,
        delay: 1200, // Stay visible longer
        ease: 'Power2',
        onComplete: () => {
          shield.destroy();
          shieldText.destroy();
        },
      });
    }
  }

  private playHeal(srcId: ActorId, dstId: ActorId, value: number): void {
    const dstSlot = this.getActorSlot(dstId);
    if (dstSlot) {
      // Heal pulse (slowed for visibility)
      this.tweens.add({
        targets: dstSlot,
        scale: 1.15,
        duration: 300, // Was 200ms
        yoyo: true,
        ease: 'Power2',
      });

      // Heal number (larger and slower)
      const healText = this.add.text(
        dstSlot.x + 50,
        dstSlot.y - 30,
        `+${value}`,
        {
          fontSize: '28px', // Was 20px
          color: '#27ae60',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        }
      );
      healText.setOrigin(0.5);
      healText.setDepth(100);

      this.tweens.add({
        targets: healText,
        y: healText.y - 60, // Float up more
        alpha: 0,
        duration: 1500, // Was 1000ms
        ease: 'Power2',
        onComplete: () => healText.destroy(),
      });
    }
  }

  private playVfx(srcId: ActorId, dstId?: ActorId, note?: string): void {
    console.log(`VFX: ${note} from ${srcId} to ${dstId}`);
    
    // Add visual effects for specific VFX types
    if (note === 'vulnerable' && dstId) {
      const dstSlot = this.getActorSlot(dstId);
      if (dstSlot) {
        // Vulnerable debuff visual - purple swirl
        const debuff = this.add.graphics();
        debuff.lineStyle(3, 0x9b59b6, 0.9);
        
        // Draw a downward arrow or broken shield
        debuff.beginPath();
        debuff.arc(dstSlot.x, dstSlot.y, 35, 0, Math.PI * 2);
        debuff.strokePath();
        
        // Vulnerable icon
        const vulnText = this.add.text(
          dstSlot.x,
          dstSlot.y - 50,
          '⚠️ VULNERABLE',
          {
            fontSize: '16px',
            color: '#9b59b6',
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            backgroundColor: '#000000',
            padding: { x: 5, y: 3 },
          }
        );
        vulnText.setOrigin(0.5);
        vulnText.setDepth(100);
        
        // Pulse effect
        this.tweens.add({
          targets: debuff,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 400,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
        });
        
        // Fade out
        this.tweens.add({
          targets: [debuff, vulnText],
          alpha: 0,
          duration: 1000,
          delay: 1500,
          ease: 'Power2',
          onComplete: () => {
            debuff.destroy();
            vulnText.destroy();
          },
        });
      }
    }
  }

  private getActorSlot(actorId: ActorId): Phaser.GameObjects.Container | null {
    console.log(`getActorSlot called for: ${actorId}`);
    console.log('Available actors:', [...this.players, ...this.enemies].map(a => ({ id: a.id, side: a.side, name: a.name })));
    
    const actor = [...this.players, ...this.enemies].find(a => a.id === actorId);
    if (!actor) {
      console.warn(`Actor not found: ${actorId}`);
      return null;
    }

    console.log(`Found actor: ${actor.name} (${actor.side})`);

    if (actor.side === 'party') {
      const index = this.players.findIndex(p => p.id === actorId);
      const slot = this.partySlots[index] || null;
      console.log(`Party slot at index ${index}:`, slot ? 'found' : 'not found');
      return slot;
    } else {
      const index = this.enemies.findIndex(e => e.id === actorId);
      const slot = this.enemySlots[index] || null;
      console.log(`Enemy slot at index ${index}:`, slot ? 'found' : 'not found');
      return slot;
    }
  }

  private updateActionIndicators(): void {
    this.players.forEach((player, index) => {
      const slot = this.partySlots[index];
      if (!slot) return;

      const actionIndicator = slot.getData('actionIndicator') as Phaser.GameObjects.Text;
      const lockIndicator = slot.getData('lockIndicator') as Phaser.GameObjects.Text;

      // Check if indicators exist before using them
      if (!actionIndicator || !lockIndicator) {
        console.warn(`Missing indicators for player ${player.name} at index ${index}`);
        return;
      }

      const plans = this.playerPlans.get(player.id);
      const wasLocked = lockIndicator.text === '✓';
      
      if (plans && plans.length > 0) {
        const icons = { Attack: '⚔️', Guard: '🛡️', Skill: '✨', Skip: '⏱️', Card: '🃏' };
        // Show first action icon + count if multiple
        const firstPlan = plans[0];
        const iconText = plans.length > 1 
          ? `${icons[firstPlan.type] || '🃏'}×${plans.length}`
          : (icons[firstPlan.type] || '🃏');
        actionIndicator.setText(iconText);
        lockIndicator.setText('✓');
        
        // Add glow effect when newly locked
        if (!wasLocked) {
          // Pulse the lock indicator
          this.tweens.add({
            targets: lockIndicator,
            scale: 1.5,
            duration: 200,
            yoyo: true,
            ease: 'Back.easeOut',
          });
          
          // Glow the slot background
          const bg = slot.getAt(0) as Phaser.GameObjects.Rectangle;
          if (bg) {
            const originalColor = bg.fillColor;
            bg.setFillStyle(0x27ae60, 0.3);
            this.time.delayedCall(500, () => {
              bg.setFillStyle(originalColor, 1);
            });
          }
        }
      } else {
        actionIndicator.setText('');
        lockIndicator.setText('');
      }
    });
  }

  private updateUI(): void {
    // Update stage text (index 0 in hudContainer)
    const stageText = this.hudContainer.getAt(0) as Phaser.GameObjects.Text;
    stageText.setText(`Stage ${this.currentStage}`);
    
    // Update turn text (index 1 in hudContainer)
    const turnText = this.hudContainer.getAt(1) as Phaser.GameObjects.Text;
    turnText.setText(`Turn ${this.currentTurn}`);
    
    // Update phase text (index 2 in hudContainer)
    const phaseText = this.hudContainer.getAt(2) as Phaser.GameObjects.Text;
    phaseText.setText(this.phase);

    // Update phase color
    let phaseColor = '#4a90e2'; // planning
    if (this.phase === 'resolving') phaseColor = '#f39c12';
    if (this.phase === 'idle') phaseColor = '#95a5a6';
    phaseText.setColor(phaseColor);

    // Update HP bars
    this.updateHPBars();
    
    // Update player stats display
    this.updatePlayerStatsDisplay();
  }

  /**
   * Updates the player stats display in the bottom left corner
   */
  private updatePlayerStatsDisplay(): void {
    if (!this.userId) return;

    // Find the current player's actor
    const playerActor = this.players.find(p => p.userId === this.userId);
    if (!playerActor) return;

    // Update HP
    if (this.playerHpText) {
      const hpPercent = Math.floor((playerActor.hp / playerActor.maxHp) * 100);
      this.playerHpText.setText(`HP: ${playerActor.hp}/${playerActor.maxHp} (${hpPercent}%)`);
      
      // Color code based on HP
      if (hpPercent > 60) {
        this.playerHpText.setColor('#27ae60'); // Green
      } else if (hpPercent > 30) {
        this.playerHpText.setColor('#f39c12'); // Orange
      } else {
        this.playerHpText.setColor('#e74c3c'); // Red
      }
    }

    // Update Level (for now we'll assume level 1, but this could be dynamic later)
    if (this.playerLevelText) {
      this.playerLevelText.setText('Level: 1');
    }

    // Update AP
    if (this.playerApText) {
      const currentAP = this.playerAP.get(playerActor.id) || 0;
      this.playerApText.setText(`AP: ${currentAP}`);
      
      // Color code based on AP
      if (currentAP >= 10) {
        this.playerApText.setColor('#27ae60'); // Green - lots of AP
      } else if (currentAP >= 5) {
        this.playerApText.setColor('#f39c12'); // Orange - moderate AP
      } else {
        this.playerApText.setColor('#e74c3c'); // Red - low AP
      }
    }
  }

  private updateHPBars(): void {
    console.log('Updating HP bars (initial setup)...');
    
    // Update party HP bars
    this.players.forEach((player, index) => {
      const slot = this.partySlots[index];
      if (!slot) return;

      const hpFill = slot.getAt(4) as Phaser.GameObjects.Rectangle;
      if (hpFill) {
        const newWidth = 60 * (player.hp / player.maxHp);
        console.log(`Player ${player.name}: HP ${player.hp}/${player.maxHp} (${(player.hp/player.maxHp*100).toFixed(1)}%) -> width ${newWidth}`);
        hpFill.width = newWidth;
      }
    });

    // Update enemy HP bars
    this.enemies.forEach((enemy, index) => {
      const slot = this.enemySlots[index];
      if (!slot) return;

      const hpFill = slot.getAt(4) as Phaser.GameObjects.Rectangle;
      if (hpFill) {
        const newWidth = 80 * (enemy.hp / enemy.maxHp);
        console.log(`Enemy ${enemy.name}: HP ${enemy.hp}/${enemy.maxHp} (${(enemy.hp/enemy.maxHp*100).toFixed(1)}%) -> width ${newWidth}`);
        hpFill.width = newWidth;
      }
    });
  }

  /**
   * Syncs local players and enemies arrays with the combat state
   */
  private syncLocalArraysWithCombatState(): void {
    console.log('Syncing local arrays with combat state...');
    console.log('Combat state before sync:', this.combatState);
    
    // Update local players array with combat state data
    this.players.forEach((player, index) => {
      const combatPlayer = this.combatState.party.find(p => p.id === player.id);
      if (combatPlayer) {
        console.log(`Syncing player ${player.name}: ${player.hp}/${player.maxHp} -> ${combatPlayer.hp}/${combatPlayer.maxHp}`);
        this.players[index] = { ...combatPlayer };
      }
    });

    // Update local enemies array with combat state data
    this.enemies.forEach((enemy, index) => {
      const combatEnemy = this.combatState.enemies.find(e => e.id === enemy.id);
      if (combatEnemy) {
        console.log(`Syncing enemy ${enemy.name}: ${enemy.hp}/${enemy.maxHp} -> ${combatEnemy.hp}/${combatEnemy.maxHp}`);
        this.enemies[index] = { ...combatEnemy };
      }
    });

    console.log('Synced local arrays:', { players: this.players, enemies: this.enemies });
  }

  /**
   * Updates the health bar visually during animations without modifying combat state
   * Uses a temporary tracking map to accumulate damage/healing for visual feedback
   */
  private visualHpChanges = new Map<ActorId, number>();
  
  private updateHealthBarVisual(targetId: ActorId, amount: number, type: 'damage' | 'heal'): void {
    console.log(`updateHealthBarVisual: targetId=${targetId}, amount=${amount}, type=${type}`);
    
    // Track cumulative visual HP changes for this target
    const currentChange = this.visualHpChanges.get(targetId) || 0;
    const newChange = type === 'damage' ? currentChange - amount : currentChange + amount;
    this.visualHpChanges.set(targetId, newChange);
    
    // Find the current HP from combat state
    const combatPlayer = this.combatState.party.find(p => p.id === targetId);
    const combatEnemy = this.combatState.enemies.find(e => e.id === targetId);
    
    if (combatPlayer) {
      const baseHp = combatPlayer.hp;
      const visualHp = Math.max(0, Math.min(combatPlayer.maxHp, baseHp + newChange));
      
      console.log(`Visual update for player ${combatPlayer.name}: base=${baseHp}, change=${newChange}, visual=${visualHp}`);
      
      // Find and update the health bar visual
      const slot = this.partySlots.find(s => {
        const actorId = s.getData('actorId');
        return actorId === targetId;
      });
      
      if (slot) {
        const hpFill = slot.getAt(4) as Phaser.GameObjects.Rectangle;
        if (hpFill) {
          const maxWidth = 60;
          const newWidth = (visualHp / combatPlayer.maxHp) * maxWidth;
          const oldWidth = hpFill.width;
          console.log(`  → Animating player HP bar: ${oldWidth.toFixed(1)} -> ${newWidth.toFixed(1)}`);
          this.tweens.add({
            targets: hpFill,
            width: newWidth,
            duration: 300,
            ease: 'Power2'
          });
        } else {
          console.warn(`  → Could not find hpFill for player slot`);
        }
      } else {
        console.warn(`  → Could not find slot for player ${targetId}`);
      }
    } else if (combatEnemy) {
      const baseHp = combatEnemy.hp;
      const visualHp = Math.max(0, Math.min(combatEnemy.maxHp, baseHp + newChange));
      
      console.log(`Visual update for enemy ${combatEnemy.name}: base=${baseHp}, change=${newChange}, visual=${visualHp}`);
      
      // Find and update the health bar visual
      const slot = this.enemySlots.find(s => {
        const actorId = s.getData('actorId');
        return actorId === targetId;
      });
      
      if (slot) {
        const hpFill = slot.getAt(4) as Phaser.GameObjects.Rectangle;
        if (hpFill) {
          const maxWidth = 80;
          const newWidth = (visualHp / combatEnemy.maxHp) * maxWidth;
          const oldWidth = hpFill.width;
          console.log(`  → Animating enemy HP bar: ${oldWidth.toFixed(1)} -> ${newWidth.toFixed(1)}`);
          this.tweens.add({
            targets: hpFill,
            width: newWidth,
            duration: 300,
            ease: 'Power2'
          });
        } else {
          console.warn(`  → Could not find hpFill for enemy slot`);
        }
      } else {
        console.warn(`  → Could not find slot for enemy ${targetId}`);
      }
    }
  }

  /**
   * Applies damage to an actor in the combat state when hit animation occurs
   * NOTE: This is now deprecated in favor of visual-only updates + final reconciliation
   */
  private applyDamageToActor(targetId: ActorId, damage: number): void {
    console.log(`applyDamageToActor called: targetId=${targetId}, damage=${damage}`);
    console.log('Current combat state:', this.combatState);
    
    // Find and update the actor in combat state
    const combatPlayer = this.combatState.party.find(p => p.id === targetId);
    if (combatPlayer) {
      const oldHp = combatPlayer.hp;
      combatPlayer.hp = Math.max(0, combatPlayer.hp - damage);
      console.log(`Applied ${damage} damage to player ${combatPlayer.name}: ${oldHp} -> ${combatPlayer.hp}`);
      
      // Update local array
      const playerIndex = this.players.findIndex(p => p.id === targetId);
      if (playerIndex !== -1) {
        this.players[playerIndex].hp = combatPlayer.hp;
        console.log(`Updated local player array: ${this.players[playerIndex].name} HP = ${this.players[playerIndex].hp}`);
      }
      
      // Update health bar immediately
      this.updateTargetHealthBar(targetId);
      
      // Update player stats display if this is the current player
      this.updatePlayerStatsDisplay();
      return;
    }

    const combatEnemy = this.combatState.enemies.find(e => e.id === targetId);
    if (combatEnemy) {
      const oldHp = combatEnemy.hp;
      combatEnemy.hp = Math.max(0, combatEnemy.hp - damage);
      console.log(`Applied ${damage} damage to enemy ${combatEnemy.name}: ${oldHp} -> ${combatEnemy.hp}`);
      
      // Update local array
      const enemyIndex = this.enemies.findIndex(e => e.id === targetId);
      if (enemyIndex !== -1) {
        this.enemies[enemyIndex].hp = combatEnemy.hp;
        console.log(`Updated local enemy array: ${this.enemies[enemyIndex].name} HP = ${this.enemies[enemyIndex].hp}`);
      }
      
      // Check if enemy died
      if (combatEnemy.hp === 0 && oldHp > 0) {
        console.log(`💀 ${combatEnemy.name} has died!`);
        this.playEnemyDeath(targetId);
      }
      
      // Update health bar immediately
      this.updateTargetHealthBar(targetId);
      
      // Update player stats display in case this affected the current player
      this.updatePlayerStatsDisplay();
    } else {
      console.warn(`No actor found with ID: ${targetId}`);
    }
  }

  /**
   * Applies healing to an actor in the combat state when heal animation occurs
   */
  private applyHealingToActor(targetId: ActorId, healing: number): void {
    // Find and update the actor in combat state
    const combatPlayer = this.combatState.party.find(p => p.id === targetId);
    if (combatPlayer) {
      const oldHp = combatPlayer.hp;
      combatPlayer.hp = Math.min(combatPlayer.maxHp, combatPlayer.hp + healing);
      console.log(`Applied ${healing} healing to player ${combatPlayer.name}: ${oldHp} -> ${combatPlayer.hp}`);
      
      // Update local array
      const playerIndex = this.players.findIndex(p => p.id === targetId);
      if (playerIndex !== -1) {
        this.players[playerIndex].hp = combatPlayer.hp;
      }
      
      // Update health bar immediately
      this.updateTargetHealthBar(targetId);
      
      // Update player stats display if this is the current player
      this.updatePlayerStatsDisplay();
      return;
    }

    const combatEnemy = this.combatState.enemies.find(e => e.id === targetId);
    if (combatEnemy) {
      const oldHp = combatEnemy.hp;
      combatEnemy.hp = Math.min(combatEnemy.maxHp, combatEnemy.hp + healing);
      console.log(`Applied ${healing} healing to enemy ${combatEnemy.name}: ${oldHp} -> ${combatEnemy.hp}`);
      
      // Update local array
      const enemyIndex = this.enemies.findIndex(e => e.id === targetId);
      if (enemyIndex !== -1) {
        this.enemies[enemyIndex].hp = combatEnemy.hp;
      }
      
      // Update health bar immediately
      this.updateTargetHealthBar(targetId);
      
      // Update player stats display in case this affected the current player
      this.updatePlayerStatsDisplay();
    }
  }

  /**
   * Updates the health bar for a specific target during animations
   */
  private updateTargetHealthBar(targetId: ActorId): void {
    console.log(`updateTargetHealthBar called for: ${targetId}`);
    
    // Find the target in combat state (more reliable than local arrays during animations)
    const combatPlayer = this.combatState.party.find(p => p.id === targetId);
    if (combatPlayer) {
      console.log(`Found player: ${combatPlayer.name}, HP: ${combatPlayer.hp}/${combatPlayer.maxHp}`);
      const playerIndex = this.players.findIndex(p => p.id === targetId);
      if (playerIndex !== -1) {
        const slot = this.partySlots[playerIndex];
        if (slot) {
          const hpFill = slot.getAt(4) as Phaser.GameObjects.Rectangle;
          if (hpFill) {
            const newWidth = 60 * (combatPlayer.hp / combatPlayer.maxHp);
            console.log(`Updating player health bar: ${hpFill.width} -> ${newWidth} (${(combatPlayer.hp/combatPlayer.maxHp*100).toFixed(1)}%)`);
            
            // Animate the health bar change
            this.tweens.add({
              targets: hpFill,
              width: newWidth,
              duration: 300,
              ease: 'Power2',
            });
          } else {
            console.warn(`No health fill found for player slot ${playerIndex}`);
          }
        } else {
          console.warn(`No party slot found for player index ${playerIndex}`);
        }
      } else {
        console.warn(`Player index not found for ${targetId}`);
      }
      return;
    }

    const combatEnemy = this.combatState.enemies.find(e => e.id === targetId);
    if (combatEnemy) {
      console.log(`Found enemy: ${combatEnemy.name}, HP: ${combatEnemy.hp}/${combatEnemy.maxHp}`);
      const enemyIndex = this.enemies.findIndex(e => e.id === targetId);
      if (enemyIndex !== -1) {
        const slot = this.enemySlots[enemyIndex];
        if (slot) {
          const hpFill = slot.getAt(4) as Phaser.GameObjects.Rectangle;
          if (hpFill) {
            const newWidth = 80 * (combatEnemy.hp / combatEnemy.maxHp);
            console.log(`Updating enemy health bar: ${hpFill.width} -> ${newWidth} (${(combatEnemy.hp/combatEnemy.maxHp*100).toFixed(1)}%)`);
            
            // Animate the health bar change
            this.tweens.add({
              targets: hpFill,
              width: newWidth,
              duration: 300,
              ease: 'Power2',
            });
          } else {
            console.warn(`No health fill found for enemy slot ${enemyIndex}`);
          }
        } else {
          console.warn(`No enemy slot found for enemy index ${enemyIndex}`);
        }
      } else {
        console.warn(`Enemy index not found for ${targetId}`);
      }
    } else {
      console.warn(`No actor found with ID: ${targetId}`);
    }
  }

  private startPlanningPhase(): void {
    this.phase = 'planning';
    this.playerPlans.clear();
    this.queuedActions = []; // Clear queued actions for new turn
    this.isLocked = false;
    this.selectedAction = null;
    this.selectedTarget = null;
    this.selectedCardId = null;
    
    // Clear queue display
    if (this.queueDisplay) {
      this.queueDisplay.destroy();
      this.queueDisplay = null;
    }
    
    // Update status effect indicators
    this.updateAllStatusIndicators();
    
    // Refresh AP for all players at start of round (but not on turn 1)
    // Turn 1: Players start with their initial 5 AP
    // Turn 2+: Players gain +5 AP per round
    if (this.currentTurn > 1) {
      this.players.forEach(player => {
        const currentAP = this.playerAP.get(player.id) || 0;
        const newAP = refreshAP(currentAP);
        const apGained = newAP - currentAP;
        this.playerAP.set(player.id, newAP);
        console.log(`Refreshed AP for ${player.name}: ${currentAP} -> ${newAP} (+${apGained})`);
        
        // Show AP gain notification for current player
        if (player.userId === this.userId && apGained > 0) {
          this.showAPGainNotification(apGained, newAP);
        }
      });
    } else {
      console.log('Turn 1: Players start with initial AP (no refresh)');
    }
    
    // Update hand UI with new AP
    if (this.handUI && this.userId) {
      const playerActor = this.players.find(p => p.userId === this.userId);
      if (playerActor) {
        const myAP = this.playerAP.get(playerActor.id) || 0;
        this.handUI.setAP(myAP);
      }
    }
    
    // Update player stats display
    this.updatePlayerStatsDisplay();
    
    // Clear UI
    this.hideLockButton();
    this.hidePendingActionText();
    this.hideTargetSelector();
    this.clearButtonHighlights();
    
    if (this.handUI) {
      this.handUI.clearSelection();
    }
    
    this.updateUI();
    
    // Add planning phase log entry
    this.addCombatLogEntry(`--- Turn ${this.currentTurn} ---`, '#4a90e2');
    
    // Show skip turn button so players can save AP
    this.showSkipTurnButton();
    
    // No auto-timer - fully turn-based
    // Players must explicitly lock their actions
  }

  private showSkipTurnButton(): void {
    // Skip button (bottom right corner)
    const skipButton = this.add.container(this.scale.width - 120, this.scale.height - 150);
    skipButton.setDepth(100);

    const bg = this.add.rectangle(0, 0, 200, 45, 0x95a5a6, 0.9);
    bg.setStrokeStyle(2, 0xffffff, 0.7);
    bg.setInteractive({ useHandCursor: true });
    skipButton.add(bg);

    const currentAP = this.userId ? (this.playerAP.get(this.players.find(p => p.userId === this.userId)?.id || '') || 0) : 0;
    const text = this.add.text(0, 0, `⏩ Skip (Save ${currentAP} AP)`, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    skipButton.add(text);

    bg.on('pointerover', () => {
      bg.setFillStyle(0xa0b0b6, 0.9);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x95a5a6, 0.9);
    });

    bg.on('pointerdown', () => {
      // Don't deduct any AP - just skip turn
      this.showPendingActionText(`⏩ Skipping turn - Saving AP for next round!`, '#95a5a6');
      this.time.delayedCall(500, () => {
        this.lockAction();
      });
      skipButton.destroy();
    });

    // Store reference for cleanup
    skipButton.setData('skipButton', true);
  }

  private endCombat(result: 'victory' | 'defeat'): void {
    console.log(`Combat ended: ${result}`);
    
    // Show result banner
    const banner = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      400,
      100,
      result === 'victory' ? 0x27ae60 : 0xe74c3c,
      0.9
    );
    banner.setStrokeStyle(3, 0xffffff, 0.8);

    const bannerText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2,
      result === 'victory' ? 'VICTORY!' : 'DEFEAT!',
      {
        fontSize: '36px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }
    );
    bannerText.setOrigin(0.5);

    // Return to map or lobby after delay
    this.time.delayedCall(3000, () => {
      if (result === 'victory') {
        // Stop battle music before transitioning
        if (this.soundManager) {
          console.log('Victory - stopping battle music before returning to map');
          this.soundManager.stopAll();
        }
        
        // Continue to map on victory
        // Use existing mapSeed if available, otherwise create new map
        this.scene.start('MapScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.mapSeed || (Date.now() % 2147483647), // Keep within PostgreSQL integer range
          visitedNodes: this.visitedNodes, // Pass visited nodes to restore progress
          currentNodeId: this.currentNodeId, // Pass current position
          stage: this.currentStage, // Pass current stage for next battle
        });
      } else {
        // Return to lobby on defeat
        this.scene.start('Lobby');
      }
    });
  }

  // UI Helper Methods
  private updateQueueDisplay(): void {
    // Remove old queue display
    if (this.queueDisplay) {
      this.queueDisplay.destroy();
      this.queueDisplay = null;
    }

    if (this.queuedActions.length === 0) return;

    // Create queue display above lock button
    const centerX = this.scale.width / 2;
    const y = this.scale.height - 230;

    this.queueDisplay = this.add.container(centerX, y);
    this.queueDisplay.setDepth(900);

    // Background
    const width = Math.min(600, this.queuedActions.length * 80 + 40);
    const bg = this.add.rectangle(0, 0, width, 60, 0x2c3e50, 0.95);
    bg.setStrokeStyle(2, 0x4a90e2, 0.8);
    this.queueDisplay.add(bg);

    // Title
    const title = this.add.text(-width / 2 + 10, -20, 'Queued Cards (click to remove):', {
      fontSize: '12px',
      color: '#aaaaaa',
      fontFamily: 'Arial, sans-serif',
    });
    title.setOrigin(0, 0.5);
    this.queueDisplay.add(title);

    // Show queued cards
    const cardSpacing = 70;
    const startX = -((this.queuedActions.length - 1) * cardSpacing) / 2;

    this.queuedActions.forEach((action, index) => {
      const card = getCardById(action.cardId || '');
      if (!card) return;

      const x = startX + index * cardSpacing;
      const cardContainer = this.add.container(x, 10);

      // Card mini icon
      const cardBg = this.add.rectangle(0, 0, 60, 35, 0x3a4a5a, 1);
      cardBg.setStrokeStyle(2, 0x5a90e2, 0.9);
      cardBg.setInteractive({ useHandCursor: true });
      cardContainer.add(cardBg);

      const cardName = this.add.text(0, -8, card.name, {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      });
      cardName.setOrigin(0.5);
      cardContainer.add(cardName);

      const cardAP = this.add.text(0, 5, `${card.ap} AP`, {
        fontSize: '9px',
        color: '#ffaa00',
        fontFamily: 'Arial, sans-serif',
      });
      cardAP.setOrigin(0.5);
      cardContainer.add(cardAP);

      // Hover effects
      cardBg.on('pointerover', () => {
        cardBg.setFillStyle(0xe74c3c, 1);
        cardName.setText('✖ Remove');
      });
      cardBg.on('pointerout', () => {
        cardBg.setFillStyle(0x3a4a5a, 1);
        cardName.setText(card.name);
      });

      // Click to remove from queue
      cardBg.on('pointerdown', () => {
        this.removeFromQueue(index);
      });

      this.queueDisplay!.add(cardContainer);
    });
  }

  private removeFromQueue(index: number): void {
    if (index < 0 || index >= this.queuedActions.length || !this.userId) return;

    const action = this.queuedActions[index];
    const card = getCardById(action.cardId || '');
    if (!card) return;

    // Refund the AP
    const playerActor = this.players.find(p => p.userId === this.userId);
    if (!playerActor) return;

    const currentAP = this.playerAP.get(playerActor.id) || 0;
    const refundedAP = Math.min(30, currentAP + card.ap); // Respect AP cap
    this.playerAP.set(playerActor.id, refundedAP);

    // Remove from queue
    this.queuedActions.splice(index, 1);

    console.log(`Removed ${card.name} from queue. AP refunded: ${card.ap}. New AP: ${refundedAP}`);

    // Update UI
    if (this.handUI) {
      this.handUI.setAP(refundedAP);
    }
    this.updatePlayerStatsDisplay();
    this.updateQueueDisplay();

    // Show feedback
    this.showPendingActionText(
      `🔄 ${card.name} removed! AP refunded: ${refundedAP}`,
      '#f39c12'
    );

    // Hide lock button if no cards queued
    if (this.queuedActions.length === 0) {
      this.hideLockButton();
      this.hidePendingActionText();
    }
  }

  private showLockButton(): void {
    this.hideLockButton();

    // Position button much higher to avoid covering cards (300px from bottom instead of 150px)
    this.lockButton = this.add.container(this.scale.width / 2, this.scale.height - 300);

    // Show different text based on whether cards were played
    let buttonText: string;
    let buttonColor: number;
    
    if (this.queuedActions.length > 0) {
      // Cards queued - make it clear this locks in the turn
      buttonText = `✅ LOCK IN TURN (${this.queuedActions.length} card${this.queuedActions.length > 1 ? 's' : ''})`;
      buttonColor = 0x27ae60; // Green - ready to go
    } else {
      // No cards queued - make it clear this skips the turn
      buttonText = '⏭️ SKIP TURN (No Cards)';
      buttonColor = 0xe67e22; // Orange - warning color
    }
    
    // Calculate button width based on text
    const buttonWidth = Math.max(220, buttonText.length * 10);
    
    const bg = this.add.rectangle(0, 0, buttonWidth, 50, buttonColor, 1);
    bg.setStrokeStyle(3, 0xffffff, 0.9);
    bg.setInteractive({ useHandCursor: true });
    this.lockButton.add(bg);
    
    const text = this.add.text(0, 0, buttonText, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    this.lockButton.add(text);

    // Only pulse if cards are queued (less distracting when no cards)
    if (this.queuedActions.length > 0) {
      this.tweens.add({
        targets: this.lockButton,
        scale: 1.05,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    bg.on('pointerover', () => {
      bg.setFillStyle(this.queuedActions.length > 0 ? 0x2ecc71 : 0xf39c12);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(buttonColor);
    });

    bg.on('pointerdown', () => {
      this.lockAction();
    });
  }

  private hideLockButton(): void {
    if (this.lockButton) {
      this.tweens.killTweensOf(this.lockButton);
      this.lockButton.destroy();
      this.lockButton = null;
    }
  }

  private showPendingActionText(text: string, color = '#f39c12'): void {
    this.hidePendingActionText();

    // Move pending action text higher to not overlap with repositioned button
    this.pendingActionDisplay = this.add.text(
      this.scale.width / 2,
      this.scale.height - 350,
      text,
      {
        fontSize: '18px',
        color,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 },
      }
    );
    this.pendingActionDisplay.setOrigin(0.5);
  }

  private hidePendingActionText(): void {
    if (this.pendingActionDisplay) {
      this.pendingActionDisplay.destroy();
      this.pendingActionDisplay = null;
    }
  }

  private highlightSelectedButton(actionType: ActionType): void {
    this.clearButtonHighlights();

    const buttonIndex = ['Attack', 'Guard', 'Skill', 'Skip'].indexOf(actionType);
    if (buttonIndex >= 0 && this.actionButtons[buttonIndex]) {
      const button = this.actionButtons[buttonIndex];
      const bg = button.getAt(0) as Phaser.GameObjects.Rectangle;
      if (bg) {
        bg.setStrokeStyle(4, 0xffff00, 1);
      }
    }
  }

  private clearButtonHighlights(): void {
    const colors = [0xe74c3c, 0x3498db, 0x9b59b6, 0x95a5a6];
    this.actionButtons.forEach((button, index) => {
      const bg = button.getAt(0) as Phaser.GameObjects.Rectangle;
      if (bg) {
        bg.setStrokeStyle(2, 0xffffff, 0.8);
        bg.setFillStyle(colors[index]);
      }
    });
  }

  // Timer functionality removed - now fully turn-based
  // Players must lock their actions to proceed

  private showRetryButton(): void {
    const retryButton = this.add.container(this.scale.width / 2, this.scale.height - 180);

    const bg = this.add.rectangle(0, 0, 120, 40, 0xe74c3c, 1);
    bg.setStrokeStyle(2, 0xffffff, 0.8);
    bg.setInteractive({ useHandCursor: true });
    retryButton.add(bg);

    const text = this.add.text(0, 0, '🔄 RETRY', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    retryButton.add(text);

    bg.on('pointerdown', () => {
      retryButton.destroy();
      this.hidePendingActionText();
      // Allow player to select action again
    });

    // Auto-hide after 5 seconds
    this.time.delayedCall(5000, () => {
      if (retryButton.scene) {
        retryButton.destroy();
      }
    });
  }

  update(): void {
    // Update animation timeline
    if (this.timeline) {
      if (this.timeline.isActive()) {
        this.timeline.update();
        
        if (!this.timeline.isActive()) {
          console.log('Timeline complete - checking for combat end');
          
          // Verify synchronization with pendingPostState (damage was already applied during animations)
          if (this.pendingPostState) {
            console.log('Verifying combat state synchronization...');
            console.log('Current combat state:', this.combatState);
            console.log('Expected post state:', this.pendingPostState);
            
            // Check if there are any discrepancies (this should not happen if damage was applied correctly)
            let hasDiscrepancy = false;
            this.pendingPostState.forEach(expectedActor => {
              const currentActor = this.combatState.party.find(a => a.id === expectedActor.id) ||
                                   this.combatState.enemies.find(a => a.id === expectedActor.id);
              if (currentActor && currentActor.hp !== expectedActor.hp) {
                console.warn(`⚠️ HP mismatch for ${currentActor.name}: current=${currentActor.hp}, expected=${expectedActor.hp}`);
                hasDiscrepancy = true;
              }
            });
            
            // Only reconcile if there's a discrepancy (safety net)
            if (hasDiscrepancy) {
              console.warn('Discrepancy detected! Applying corrective reconciliation...');
              reconcileState(this.combatState, this.pendingPostState);
              this.syncLocalArraysWithCombatState();
              this.updateHPBars();
            } else {
              console.log('✓ Combat state is synchronized correctly!');
            }
            
            // NOW check for combat end AFTER all animations have played
            const result = isCombatOver({ 
              ...this.combatState, 
              party: this.pendingPostState.filter(a => a.side === 'party'),
              enemies: this.pendingPostState.filter(a => a.side === 'enemy')
            });
            
            if (result) {
              console.log(`Combat ended after animations: ${result}`);
              this.pendingPostState = null;
              this.timeline = null;
              
              // Add a brief delay before showing victory/defeat to let final animations settle
              this.time.delayedCall(500, () => {
                this.endCombat(result);
              });
              return;
            }
            
            this.pendingPostState = null;
          }
          
          // Timeline complete, start next planning phase
          this.timeline = null; // Clear the timeline to stop checking it
          this.startPlanningPhase();
        }
      }
      // Timeline exists but not active - this is normal after completion
    }
  }

  // Cursor synchronization methods
  private handleLocalCursorMove(x: number, y: number): void {
    if (!this.lobbyId) return;

    // Throttle cursor updates
    const now = Date.now();
    if (now - this.cursorThrottle < this.CURSOR_THROTTLE_MS) {
      return;
    }
    this.cursorThrottle = now;

    // Get player name and color
    const player = this.players.find(p => p.userId === this.userId);
    const userName = player?.name || 'Player';
    const color = this.getPlayerColor(this.userId || '');

    // Send cursor position
    sendCursor(this.lobbyId, x, y, userName, color);
  }

  private handleCursorMove(cursor: CursorPosition): void {
    // Get or create cursor sprite for this user
    let cursorContainer = this.remoteCursors.get(cursor.userId);
    
    if (!cursorContainer) {
      cursorContainer = this.createRemoteCursor(cursor.userId, cursor.userName, cursor.color);
      this.remoteCursors.set(cursor.userId, cursorContainer);
    }

    // Update position with smooth interpolation
    this.tweens.add({
      targets: cursorContainer,
      x: cursor.x,
      y: cursor.y,
      duration: this.CURSOR_THROTTLE_MS,
      ease: 'Linear',
    });
  }

  private createRemoteCursor(userId: string, userName?: string, color?: string): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    container.setDepth(1000); // Always on top

    // Cursor arrow (SVG-style)
    const cursorColor = color ? parseInt(color.replace('#', ''), 16) : this.getPlayerColorHex(userId);
    
    const cursor = this.add.graphics();
    cursor.fillStyle(cursorColor, 1);
    cursor.beginPath();
    cursor.moveTo(0, 0);
    cursor.lineTo(0, 20);
    cursor.lineTo(6, 15);
    cursor.lineTo(10, 24);
    cursor.lineTo(13, 22);
    cursor.lineTo(9, 13);
    cursor.lineTo(16, 13);
    cursor.closePath();
    cursor.fillPath();
    
    // Add subtle outline
    cursor.lineStyle(1, 0xffffff, 0.8);
    cursor.strokePath();
    
    container.add(cursor);

    // Username label
    if (userName) {
      const nameText = this.add.text(20, 0, userName, {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        backgroundColor: '#000000aa',
        padding: { x: 4, y: 2 },
      });
      nameText.setOrigin(0, 0);
      container.add(nameText);
    }

    return container;
  }

  private getPlayerColor(userId: string): string {
    // Generate consistent color from userId
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
      '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
    ];
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  }

  private getPlayerColorHex(userId: string): number {
    const color = this.getPlayerColor(userId);
    return parseInt(color.replace('#', ''), 16);
  }

  /**
   * Ensures UI elements stay within viewport bounds
   */
  private ensureViewportBounds(element: Phaser.GameObjects.GameObject, margin: number = 10): void {
    if (!element || !element.scene) return;

    const bounds = element.getBounds();
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;

    let newX = element.x;
    let newY = element.y;

    // Check horizontal bounds
    if (bounds.left < margin) {
      newX = margin - bounds.left + element.x;
    } else if (bounds.right > viewportWidth - margin) {
      newX = viewportWidth - margin - bounds.right + element.x;
    }

    // Check vertical bounds
    if (bounds.top < margin) {
      newY = margin - bounds.top + element.y;
    } else if (bounds.bottom > viewportHeight - margin) {
      newY = viewportHeight - margin - bounds.bottom + element.y;
    }

    // Apply corrections if needed
    if (newX !== element.x || newY !== element.y) {
      element.setPosition(newX, newY);
    }
  }

  /**
   * Handles window resize events to maintain proper UI positioning
   */
  private handleResize(): void {
    // Reposition combat log in bottom right corner
    if (this.combatLogContainer) {
      const logWidth = 220;
      const logHeight = this.isLogExpanded ? 300 : 80;
      const logX = this.scale.width - logWidth - 10;
      const logY = this.scale.height - logHeight - 10;
      this.combatLogContainer.setPosition(logX, logY);
    }

    // Reposition action buttons
    this.actionButtons.forEach((button, index) => {
      const buttonWidth = 60;
      const totalWidth = this.actionButtons.length * buttonWidth + (this.actionButtons.length - 1) * 20;
      const centerX = this.scale.width / 2;
      const startX = Math.max(20, centerX - totalWidth / 2);
      const buttonY = this.scale.height - 100;
      
      button.setPosition(startX + index * (buttonWidth + 20), buttonY);
    });

    // Reposition stats panel
    if (this.hudContainer) {
      const statsWidth = 220;
      const statsHeight = 80;
      const statsX = 10;
      const statsY = this.scale.height - statsHeight - 10;
      
      // Find and update stats background
      const statsBg = this.hudContainer.list.find(obj => 
        obj instanceof Phaser.GameObjects.Rectangle && 
        obj.width === statsWidth && 
        obj.height === statsHeight
      ) as Phaser.GameObjects.Rectangle;
      
      if (statsBg) {
        statsBg.setPosition(statsX + statsWidth / 2, statsY + statsHeight / 2);
      }

      // Update stats text positions
      if (this.playerHpText) {
        this.playerHpText.setPosition(statsX + 10, statsY + 15);
      }
      if (this.playerLevelText) {
        this.playerLevelText.setPosition(statsX + 10, statsY + 35);
      }
      if (this.playerApText) {
        this.playerApText.setPosition(statsX + 10, statsY + 55);
      }
    }
  }

  private createLogExpandButton(): void {
    if (!this.combatLogContainer) return;

    const buttonSize = 20;
    const buttonX = 200; // Right side of log
    const buttonY = 10; // Top of log

    this.logExpandButton = this.add.container(buttonX, buttonY);
    this.logExpandButton.setDepth(10);

    // Button background
    const bg = this.add.rectangle(0, 0, buttonSize, buttonSize, 0x4a90e2, 0.8);
    bg.setStrokeStyle(1, 0xffffff, 0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.setName('bg');
    this.logExpandButton.add(bg);

    // Arrow icon (down/up)
    const arrow = this.add.text(0, 0, '▼', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    arrow.setOrigin(0.5);
    arrow.setName('arrow');
    this.logExpandButton.add(arrow);

    // Hover effect
    bg.on('pointerover', () => {
      bg.setFillStyle(0x5aa0f2, 1);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x4a90e2, 0.8);
    });

    // Click to toggle
    bg.on('pointerdown', () => {
      this.toggleLogExpand();
    });

    this.combatLogContainer.add(this.logExpandButton);
  }

  private toggleLogExpand(): void {
    this.isLogExpanded = !this.isLogExpanded;

    const logWidth = 220;
    const logHeight = this.isLogExpanded ? 300 : 80; // Expanded height
    const logX = this.scale.width - logWidth - 10;
    const logY = this.scale.height - logHeight - 10;

    if (!this.combatLogContainer) return;

    // Update background size
    const logBg = this.combatLogContainer.getByName('logBg') as Phaser.GameObjects.Rectangle;
    if (logBg) {
      logBg.setSize(logWidth, logHeight);
      logBg.setPosition(logWidth / 2, logHeight / 2);
    }

    // Update container position
    this.combatLogContainer.setPosition(logX, logY);

    // Update arrow icon
    if (this.logExpandButton) {
      const arrow = this.logExpandButton.getByName('arrow') as Phaser.GameObjects.Text;
      if (arrow) {
        arrow.setText(this.isLogExpanded ? '▲' : '▼');
      }
    }

    // Refresh log entries to fit new size
    this.refreshLogEntries();
  }

  private refreshLogEntries(): void {
    if (!this.combatLogContainer) return;
    
    // Safety check: ensure scene is active
    if (!this.scene.isActive()) {
      console.warn('Cannot refresh log entries: scene not active');
      return;
    }

    const startY = 28;
    const lineHeight = this.isLogExpanded ? 20 : 14; // More spacing when expanded
    const maxEntries = this.isLogExpanded ? this.MAX_LOG_ENTRIES_EXPANDED : this.MAX_LOG_ENTRIES;

    // Show only the last N entries based on expanded state
    const entriesToShow = this.combatLogEntries.slice(-maxEntries);

    // Remove all entries from container
    this.combatLogEntries.forEach(entry => {
      // Safety check: ensure entry is valid and from this scene
      if (entry && entry.scene === this && this.combatLogContainer!.list.includes(entry)) {
        this.combatLogContainer!.remove(entry, false);
      }
    });

    // Re-add and position visible entries
    entriesToShow.forEach((entry, index) => {
      // Safety check: ensure entry is valid and from this scene
      if (!entry || entry.scene !== this) {
        console.warn('Skipping invalid log entry from old scene');
        return;
      }
      
      const targetY = startY + (index * lineHeight);
      entry.setY(targetY);
      
      if (!this.combatLogContainer!.list.includes(entry)) {
        this.combatLogContainer!.add(entry);
      }

      // Fade out older entries
      const alpha = 1 - (entriesToShow.length - 1 - index) * 0.15;
      entry.setAlpha(Math.max(0.4, alpha));
    });
  }

  private addCombatLogEntry(message: string, color: string = '#ffffff'): void {
    if (!this.combatLogContainer) return;
    
    // Safety check: ensure scene is active and ready
    if (!this.scene.isActive() || !this.add) {
      console.warn('Cannot add combat log entry: scene not ready');
      return;
    }

    // Create new log entry with proper positioning and word wrap
    const entry = this.add.text(10, 0, `• ${message}`, {
      fontSize: '10px',
      color,
      fontFamily: 'Arial, sans-serif',
      wordWrap: { width: 195 }, // Fit within 220px box with margins
      align: 'left',
    });
    entry.setOrigin(0, 0);

    // Add to entries array
    this.combatLogEntries.push(entry);

    // Remove oldest entry if we exceed max for expanded view
    if (this.combatLogEntries.length > this.MAX_LOG_ENTRIES_EXPANDED) {
      const oldest = this.combatLogEntries.shift();
      if (oldest) {
        oldest.destroy();
      }
    }

    // Refresh display with new entry
    this.refreshLogEntries();

    // Highlight newest entry (smaller pulse)
    entry.setAlpha(1);
    this.tweens.add({
      targets: entry,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  private getActorName(actorId: ActorId): string {
    const actor = [...this.players, ...this.enemies].find(a => a.id === actorId);
    if (!actor) return 'Unknown';
    
    // Include class for players
    const battleActor = actor as BattleActor;
    if (battleActor.selectedClass && actor.side === 'party') {
      return `${actor.name} (${battleActor.selectedClass})`;
    }
    
    return actor.name;
  }

  private showPlayerLockedNotification(playerName: string, actionType: ActionType, actionCount: number = 1): void {
    // Get action icon
    const icons = { Attack: '⚔️', Guard: '🛡️', Skill: '✨', Skip: '⏱️', Card: '🃏' };
    const icon = icons[actionType] || '';

    // Create notification container
    const notification = this.add.container(this.scale.width / 2, 150);
    notification.setDepth(999);

    // Background
    const bg = this.add.rectangle(0, 0, 300, 60, 0x2c3e50, 0.95);
    bg.setStrokeStyle(3, 0x27ae60, 1);
    notification.add(bg);

    // Player name and action
    const text = this.add.text(0, -10, `${playerName} locked in!`, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    notification.add(text);

    // Action type
    const actionTypeText = actionCount > 1 ? `${actionCount} cards` : actionType;
    const actionText = this.add.text(0, 12, `${icon} ${actionTypeText}`, {
      fontSize: '16px',
      color: '#27ae60',
      fontFamily: 'Arial, sans-serif',
    });
    actionText.setOrigin(0.5);
    notification.add(actionText);

    // Slide in from top
    notification.setY(-100);
    this.tweens.add({
      targets: notification,
      y: 150,
      duration: 300,
      ease: 'Back.easeOut',
    });

    // Pulse effect
    this.tweens.add({
      targets: bg,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 200,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });

    // Fade out and destroy after 3 seconds
    this.time.delayedCall(3000, () => {
      this.tweens.add({
        targets: notification,
        alpha: 0,
        y: notification.y - 50,
        duration: 400,
        ease: 'Power2',
        onComplete: () => notification.destroy(),
      });
    });
  }

  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.timeline) {
      this.timeline.stop();
    }
    
    // Clean up sound manager
    if (this.soundManager) {
      this.soundManager.stopAll();
    }
    
    this.hideLockButton();
    this.hidePendingActionText();
    this.hideTargetSelector();
    
    // Clean up queue display
    if (this.queueDisplay) {
      this.queueDisplay.destroy();
      this.queueDisplay = null;
    }
    
    // Clean up skip button if exists
    const skipButtons = this.children.list.filter((obj: any) => obj.getData && obj.getData('skipButton'));
    skipButtons.forEach(btn => btn.destroy());
    
    // Clean up remote cursors
    this.remoteCursors.forEach(cursor => cursor.destroy());
    this.remoteCursors.clear();
  }

  private showAPGainNotification(apGained: number, newTotal: number): void {
    const notification = this.add.container(this.scale.width / 2, this.scale.height / 2 - 100);
    notification.setDepth(999);

    // Background
    const bg = this.add.rectangle(0, 0, 250, 70, 0x2c3e50, 0.95);
    bg.setStrokeStyle(3, 0xf39c12, 1);
    notification.add(bg);

    // AP gain text
    const gainText = this.add.text(0, -10, `+${apGained} AP`, {
      fontSize: '28px',
      color: '#f39c12',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    gainText.setOrigin(0.5);
    notification.add(gainText);

    // Total AP
    const totalText = this.add.text(0, 18, `Total: ${newTotal} AP`, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    totalText.setOrigin(0.5);
    notification.add(totalText);

    // Slide in from top
    notification.setY(-100);
    notification.setAlpha(0);
    this.tweens.add({
      targets: notification,
      y: this.scale.height / 2 - 100,
      alpha: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    // Pulse effect
    this.tweens.add({
      targets: gainText,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 200,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });

    // Fade out and destroy after 2 seconds
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: notification,
        alpha: 0,
        y: notification.y - 50,
        duration: 400,
        ease: 'Power2',
        onComplete: () => notification.destroy(),
      });
    });
  }

  /**
   * Update status effect indicators for all actors
   */
  private updateAllStatusIndicators(): void {
    // Update party members
    for (const player of this.players) {
      this.updateStatusIndicators(player.id);
    }
    
    // Update enemies
    for (const enemy of this.enemies) {
      this.updateStatusIndicators(enemy.id);
    }
  }

  /**
   * Update status effect indicators for a specific actor
   */
  private updateStatusIndicators(actorId: ActorId): void {
    const container = this.statusEffectContainers.get(actorId);
    if (!container) return;

    // Clear existing indicators
    container.removeAll(true);

    const statusIcons: { icon: string; color: number; text: string; bgColor: number }[] = [];

    // Check for DOT effects
    if (this.combatState.dots) {
      const dots = this.combatState.dots.get(actorId);
      if (dots && dots.length > 0) {
        for (const dot of dots) {
          if (dot.duration > 0) {
            if (dot.type === 'poison') {
              statusIcons.push({
                icon: '☠️',
                color: 0x00ff00,
                text: `${dot.damage}x${dot.duration}`,
                bgColor: 0x003300,
              });
            } else if (dot.type === 'burn') {
              statusIcons.push({
                icon: '🔥',
                color: 0xff4400,
                text: `${dot.damage}x${dot.duration}`,
                bgColor: 0x330000,
              });
            }
          }
        }
      }
    }

    // Check for guard/shield (simplified - you may want to track this in combat state)
    // For now, we'll add this when guard effects are applied

    // TODO: Add vulnerable, stun, and other status effects as they're implemented

    // Create status icon badges
    const iconSize = 24;
    const spacing = 28;
    const startX = -(statusIcons.length - 1) * spacing / 2;

    statusIcons.forEach((status, index) => {
      const x = startX + index * spacing;
      
      // Background circle
      const bg = this.add.circle(x, 0, iconSize / 2, status.bgColor, 0.9);
      bg.setStrokeStyle(2, status.color, 1);
      container.add(bg);

      // Icon emoji
      const iconText = this.add.text(x, -2, status.icon, {
        fontSize: '16px',
        fontFamily: 'Arial, sans-serif',
      });
      iconText.setOrigin(0.5);
      container.add(iconText);

      // Duration/stack text
      const durationText = this.add.text(x, 14, status.text, {
        fontSize: '8px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      });
      durationText.setOrigin(0.5);
      container.add(durationText);
    });
  }

  /**
   * Add a guard status indicator
   */
  private addGuardIndicator(actorId: ActorId, shieldAmount: number): void {
    const container = this.statusEffectContainers.get(actorId);
    if (!container) return;

    // For now, we'll trigger a full update
    // In a more sophisticated system, you might track guard separately
    this.updateStatusIndicators(actorId);
  }

  destroy(): void {
    // Clean up resize handler
    this.scale.off('resize', this.handleResize, this);
    
    // Clean up other resources
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    // Clean up sound manager
    if (this.soundManager) {
      this.soundManager.destroy();
      this.soundManager = null;
    }
    
    // Clean up UI elements
    this.remoteCursors.forEach(cursor => cursor.destroy());
    this.actionButtons.forEach(button => button.destroy());
    if (this.hudContainer) this.hudContainer.destroy();
    if (this.combatLogContainer) this.combatLogContainer.destroy();
    
    super.destroy();
  }
}