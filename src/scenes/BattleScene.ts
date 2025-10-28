import Phaser from 'phaser';
import { getCurrentUserId } from '../net/supa';
import {
  subscribeMatch,
  sendPlan,
  sendCommit,
  sendResolve,
  sendCursor,
  sendDebugSkip,
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
import { DeckState, createDeck, drawCardsAtTurnStart, playCard as deckPlayCard, canPlayCard as deckCanPlayCard, resetReusableCharges, discardAllCardsFromHand } from '../game/deck';
import { getConsumables } from '../game/inventory';
import { createCharacterAnimations, createCharacterSprite, hasSprite, CharacterClass } from '../game/characterSprites';
import { preloadEnemySprites, createEnemyAnimations, createEnemySprite, hasEnemySprite, EnemyType } from '../game/enemySprites';
import { createUltimatePowerManager, destroyUltimatePowerManager, UltimatePowerManager, hasPersistedPower } from '../game/ultimate';
import { UltimatePowerBar, getClassColor } from '../ui/ultimateUi';
import { getRandomWarriorAttackAnim } from '../game/characters/warrior';
import { setupCustomCursor } from '../utils/cursor';

/**
 * Side-view battle scene with deterministic combat pipeline
 */

// Extended Actor type for BattleScene that includes userId
interface BattleActor extends Actor {
  userId?: string;
  isHost?: boolean;
  selectedClass?: string; // 'Warrior', 'Huntress', or 'Mage'
}

interface ShieldAura {
  container: Phaser.GameObjects.Container;
  hexagon?: Phaser.GameObjects.Graphics;
  glow?: Phaser.GameObjects.Graphics;
  particles?: Phaser.GameObjects.Graphics[];
  shieldSprite?: Phaser.GameObjects.Sprite;
  shieldText: Phaser.GameObjects.Text;
  pulseAnim?: Phaser.Tweens.Tween;
  rotateAnim?: Phaser.Tweens.Tween;
  fireAura?: Phaser.GameObjects.Graphics; // Fire-colored aura for Fire Shield
}

export class BattleScene extends Phaser.Scene {
  private lobbyId: string | null = null;
  private userId: string | null = null;
  private isHost = false;
  private unsubscribe: (() => void) | null = null;
  private mapSeed: number | undefined = undefined; // Persist map across battles
  private visitedNodes: string[] = []; // Track visited nodes for map progression
  private currentNodeId: string | null = null; // Track current position on map
  private worldKey: 'world1' | 'world2' = 'world1'; // Track current world

  // Combat state
  private combatState: CombatState = {
    turn: 1,
    party: [],
    enemies: [],
    shields: new Map(),
    vulnerable: new Map(),
    stunned: new Set(),
    dots: new Map(),
    buffs: new Map(),
    blinded: new Set(),
    fireShield: new Set(),
  };
  private currentTurn = 1;
  private currentStage = 1; // Track which battle this is (Stage 1, 2, 3, etc.)
  private battleBackgroundKey: string = 'battleground1'; // Track which background is used
  private worldKey: 'world1' | 'world2' = 'world1'; // Track which world we're in
  private phase: 'planning' | 'resolving' | 'idle' = 'planning';
  private playerPlans = new Map<ActorId, ActionPlan[]>(); // Multiple actions per player
  private isLocked = false;
  
  // Track attack animation alternation for Minotaur
  private minotaurAttackCounter = 0;

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
  private combatEndedEarly = false; // Flag to prevent normal timeline completion when ultimate ends combat
  private combatEnded = false; // Flag to prevent endCombat from being called multiple times

  // Player data
  private players: BattleActor[] = [];
  private enemies: Actor[] = [];
  private pendingPostState: Actor[] | null = null;
  
  // Card system & Deck
  private loadouts = new Map<ActorId, string[]>(); // userId -> cardIds (full deck of 10)
  private playerDecks = new Map<ActorId, DeckState>(); // userId -> deck state (draw/discard)
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
  private readonly MAX_LOG_ENTRIES = 2; // Show only 2 entries in collapsed mode
  private readonly MAX_LOG_ENTRIES_EXPANDED = 11; // Show 11 entries in expanded mode
  private isLogExpanded = false;
  private logExpandButton: Phaser.GameObjects.Container | null = null;
  private logScrollOffset = 0; // Scroll offset for combat log
  private maxLogScrollOffset = 0; // Maximum scroll offset
  private logScrollIndicator: Phaser.GameObjects.Text | null = null; // Visual indicator for more entries

  // Sound manager
  private soundManager: SoundManager | null = null;

  // Ultimate power system
  private ultimatePowerManager: UltimatePowerManager | null = null;
  private powerBars: Map<ActorId, UltimatePowerBar> = new Map();
  private debugUltimateButton: Phaser.GameObjects.Container | null = null;
  private shieldAuras: Map<ActorId, ShieldAura> = new Map();
  
  // Debug buttons
  private debugSkipLevelButton: Phaser.GameObjects.Container | null = null;
  private debugSkipToBossButton: Phaser.GameObjects.Container | null = null;

  // Player stat displays (bottom left HUD)
  private playerHpText: Phaser.GameObjects.Text | null = null;
  private playerLevelText: Phaser.GameObjects.Text | null = null;
  private playerApText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('BattleScene');
  }

  init(data: { lobbyId: string; players: any[]; loadouts?: Loadout[]; mapSeed?: number; visitedNodes?: string[]; currentNodeId?: string; stage?: number; world?: 'world1' | 'world2' }): void {
    this.lobbyId = data.lobbyId;
    this.players = data.players || [];
    this.mapSeed = data.mapSeed; // Store map seed for continuity
    this.visitedNodes = data.visitedNodes || []; // Store visited nodes
    this.currentNodeId = data.currentNodeId || null; // Store current position
    this.currentStage = data.stage || 1; // Track battle stage number
    this.worldKey = data.world || 'world1'; // Track which world we're in
    
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
    this.combatEndedEarly = false;
    this.combatEnded = false;
    
    // Clear combat log for new stage
    this.logScrollOffset = 0;
    this.maxLogScrollOffset = 0;
    
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
    
    // CRITICAL: Destroy all party and enemy slot containers to prevent stacking
    console.log(`🗑️ Destroying ${this.partySlots.length} party slots and ${this.enemySlots.length} enemy slots...`);
    for (const slot of this.partySlots) {
      if (slot) slot.destroy();
    }
    for (const slot of this.enemySlots) {
      if (slot) slot.destroy();
    }
    for (const button of this.actionButtons) {
      if (button) button.destroy();
    }
    
    // Destroy status effect containers
    for (const container of this.statusEffectContainers.values()) {
      if (container) container.destroy();
    }
    
    // Destroy remote cursors
    for (const cursor of this.remoteCursors.values()) {
      if (cursor) cursor.destroy();
    }
    
    // Clear combat log entries for new stage
    for (const entry of this.combatLogEntries) {
      if (entry && entry.scene === this) {
        entry.destroy();
      }
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
    
    // Initialize loadouts, decks, and AP
    if (data.loadouts) {
      console.log('Processing loadouts & creating decks...');
      data.loadouts.forEach((loadout, index) => {
        console.log(`Loadout ${index}:`, loadout);
        console.log(`  userId: ${loadout.userId}`);
        console.log(`  cards (${loadout.cards.length}):`, loadout.cards);
        
        // Store full deck (10 cards)
        this.loadouts.set(loadout.userId, loadout.cards);
        
        // Create deck state with draw/discard mechanics
        const consumableInventory = getConsumables(loadout.userId);
        const deckState = createDeck(loadout.cards, consumableInventory);
        this.playerDecks.set(loadout.userId, deckState);
        console.log(`  Created deck - Hand: ${deckState.hand.length}, DrawPile: ${deckState.drawPile.length}`);
        console.log(`  Consumable inventory:`, Array.from(consumableInventory.entries()));
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
        // Stage 1: Different enemy for each world
        if (this.worldKey === 'world2') {
          // World 2: Stone Golem
          return [
            {
              id: 'enemy_1',
              side: 'enemy',
              name: 'Stone Golem',
              hp: 60,
              maxHp: 60,
              ap: 5,
            },
          ];
        } else {
          // World 1: Skeleton Warrior
          return [
            {
              id: 'enemy_1',
              side: 'enemy',
              name: 'Skeleton Warrior',
              hp: 50,
              maxHp: 50,
              ap: 5,
            },
          ];
        }
      
      case 2:
        // Stage 2: Different enemy for each world
        if (this.worldKey === 'world2') {
          // World 2: Stone Golem
          return [
            {
              id: 'enemy_1',
              side: 'enemy',
              name: 'Stone Golem',
              hp: 60,
              maxHp: 60,
              ap: 5,
            },
          ];
        } else {
          // World 1: Two Skeleton Warriors
          return [
            {
              id: 'enemy_1',
              side: 'enemy',
              name: 'Skeleton Warrior',
              hp: 40,
              maxHp: 40,
              ap: 5,
            },
            {
              id: 'enemy_2',
              side: 'enemy',
              name: 'Skeleton Warrior',
              hp: 35,
              maxHp: 35,
              ap: 5,
            },
          ];
        }
      
      case 3:
        // Stage 3: Different enemies for each world
        if (this.worldKey === 'world2') {
          // World 2: Multiple Stone Golems
          return [
            {
              id: 'enemy_1',
              side: 'enemy',
              name: 'Stone Golem',
              hp: 70,
              maxHp: 70,
              ap: 5,
            },
            {
              id: 'enemy_2',
              side: 'enemy',
              name: 'Stone Golem',
              hp: 70,
              maxHp: 70,
              ap: 5,
            },
          ];
        } else {
          // World 1: Introduce Skele Mage
          return [
            {
              id: 'enemy_1',
              side: 'enemy',
              name: 'Skele Mage',
              hp: 45,
              maxHp: 45,
              ap: 5,
            },
            {
              id: 'enemy_2',
              side: 'enemy',
              name: 'Skeleton Warrior',
              hp: 40,
              maxHp: 40,
              ap: 5,
            },
          ];
        }
      
      case 4:
      case 5:
        // Stage 4-5: Different enemies for each world
        if (this.worldKey === 'world2') {
          // World 2: Multiple Stone Golems
          return [
            {
              id: 'enemy_1',
              side: 'enemy',
              name: 'Stone Golem',
              hp: 80,
              maxHp: 80,
              ap: 5,
            },
            {
              id: 'enemy_2',
              side: 'enemy',
              name: 'Stone Golem',
              hp: 80,
              maxHp: 80,
              ap: 5,
            },
            {
              id: 'enemy_3',
              side: 'enemy',
              name: 'Stone Golem',
              hp: 80,
              maxHp: 80,
              ap: 5,
            },
          ];
        } else {
          // World 1: Mixed enemy groups
          return [
            {
              id: 'enemy_1',
              side: 'enemy',
              name: stage === 4 ? 'Skeleton Warrior' : 'Skele Mage',
              hp: 50,
              maxHp: 50,
              ap: 5,
            },
            {
              id: 'enemy_2',
              side: 'enemy',
              name: 'Skeleton Warrior',
              hp: 45,
              maxHp: 45,
              ap: 5,
            },
            {
              id: 'enemy_3',
              side: 'enemy',
              name: 'Skeleton Warrior',
              hp: 40,
              maxHp: 40,
              ap: 5,
            },
          ];
        }
      
      case 6:
        // Stage 6: Boss fight - check world to determine which boss
        if (this.worldKey === 'world2') {
          // World 2: DEMON BOSS FIGHT
          console.log('🔥 BOSS BATTLE: DEMON BOSS 🔥');
          return [
            {
              id: 'boss_1',
              side: 'enemy',
              name: 'Demon Boss',
              hp: 200,
              maxHp: 200,
              ap: 5,
            },
          ];
        } else {
          // World 1: MINOTAUR BOSS FIGHT
          console.log('🔥 BOSS BATTLE: MINOTAUR 🔥');
          return [
            {
              id: 'boss_1',
              side: 'enemy',
              name: 'Minotaur',
              hp: 150,
              maxHp: 150,
              ap: 5,
            },
          ];
        }
      
      default:
        // Stage 7+: Post-boss scaling difficulty (if continuing)
        const enemyCount = Math.min(2 + Math.floor((stage - 6) / 2), 3);
        const baseHP = 60 + ((stage - 6) * 8);
        
        // Mix of enemy types
        const enemyTypes = ['Skele Mage', 'Skeleton Warrior'];
        
        return Array.from({ length: enemyCount }, (_, i) => ({
          id: `enemy_${i + 1}`,
          side: 'enemy' as const,
          name: enemyTypes[i % enemyTypes.length] + (enemyCount > 1 ? ` ${i + 1}` : ''),
          hp: baseHP,
          maxHp: baseHP,
          ap: 5,
        }));
    }
  }

  async create(): Promise<void> {
    console.log('🎮 ========================================');
    console.log('🎮 BATTLE SCENE CREATE() CALLED');
    console.log('🎮 ========================================');
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
    const battleWidth = this.scale.width;
    const battleHeight = this.scale.height;
    const bottomMargin = 120; // Space for action buttons (but bg covers it)
    
    // Add background image based on stage and world
    let bgKey = 'battleground1';
    if (this.currentStage === 6) {
      // Boss backgrounds based on world
      bgKey = this.worldKey === 'world2' ? 'bossbg2' : 'bossbg';
    } else if (this.currentStage === 2) {
      bgKey = 'battleground2';
    }
    // Note: Could add more world2-specific backgrounds here for other stages
    this.battleBackgroundKey = bgKey; // Store for passing to LootScene
    console.log(`Loading background for stage ${this.currentStage} in ${this.worldKey}: ${bgKey}`);
    const bg = this.add.image(0, 0, bgKey);
    bg.setOrigin(0, 0);
    bg.setDepth(-1); // Behind everything
    
    // Scale background to cover the ENTIRE screen (no black bars anywhere)
    const scaleX = battleWidth / bg.width;
    const scaleY = battleHeight / bg.height;
    // All backgrounds: use max to cover entire screen (no black bars)
    const scale = Math.max(scaleX, scaleY);
    bg.setScale(scale);
    
    // Center the background to cover full screen
    const bgWidth = bg.width * scale;
    const bgHeight = bg.height * scale;
    const bgX = (this.scale.width - bgWidth) / 2;
    const bgY = (this.scale.height - bgHeight) / 2; // Remove bottomMargin consideration
    
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

    // Initialize ultimate power manager (restore power from previous battle if available)
    const shouldRestorePower = hasPersistedPower();
    this.ultimatePowerManager = createUltimatePowerManager(shouldRestorePower);
    if (shouldRestorePower) {
      console.log('Ultimate power manager initialized - RESTORING POWER FROM PREVIOUS BATTLE');
    } else {
      console.log('Ultimate power manager initialized - STARTING FRESH');
    }

    // Stop any card selection music that might still be playing
    console.log('Checking for card selection music...');
    const allSounds = this.sound.getAllPlaying();
    console.log('Currently playing sounds:', allSounds.map(s => s.key));
    
    allSounds.forEach(sound => {
      if (sound.key === 'music_cardselect') {
        console.log('Found card selection music, fading it out...');
        // Fade it out for smooth crossfade
        const fadeTween = this.tweens.add({
          targets: sound,
          volume: 0,
          duration: 1500,
          ease: 'Linear',
          onComplete: () => {
            console.log('Card selection music fade complete, stopping...');
            if (sound && !(sound as any).destroyed) {
              sound.stop();
              sound.destroy();
            }
          },
          onUpdate: () => {
            // Check if sound is still valid during tween
            if (!sound || (sound as any).destroyed) {
              console.log('Card selection music was destroyed during fade, stopping tween');
              fadeTween.stop();
            }
          }
        });
      }
    });

    // Play appropriate music based on stage
    const isBossBattle = this.currentStage === 6;
    const musicKey = isBossBattle ? 'music_boss' : 'music_battle';
    const musicType = isBossBattle ? 'BOSS' : 'BATTLE';
    
    this.soundManager.playMusicWithFadeIn(musicKey, { 
      volume: 0.3, 
      loop: true,
      seek: 2.0  // Start 2 seconds into the track
    }, 2000); // 2 second fade in for crossfade
    console.log(`${musicType} music started with 2s fade in from 2 seconds`);

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
      onDebugSkip: this.handleDebugSkip.bind(this),
    }).then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
    }).catch((error) => {
      console.error('Failed to subscribe to match:', error);
    });

    // Set up custom cursor with multiplayer cursor sync
    setupCustomCursor(this, (pointer: Phaser.Input.Pointer) => {
      // Handle local cursor move for multiplayer
      this.handleLocalCursorMove(pointer.x, pointer.y);
    });

    // Create debug buttons
    this.createDebugUltimateButton();
    this.createDebugSkipLevelButton();
    this.createDebugSkipToBossButton();

    // Start planning phase
    this.startPlanningPhase();
  }

  private createBattleLayout(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    let verticalOffset = 60; // Move everything down to better center in viewport
    
    // Adjust positioning for boss stages based on world
    if (this.currentStage === 6) {
      if (this.worldKey === 'world2') {
        verticalOffset = 85; // Move down 50px for Demon Boss (60 + 50 - 25)
      } else {
        verticalOffset = 35; // Move up 25px for Minotaur boss
      }
    }

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
        centerY + verticalOffset,
        player
      );
      this.partySlots.push(slot);
    }

    // Create enemy slots (right side)
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const slot = this.createEnemySlot(
        centerX + 200 + i * 120,
        centerY + verticalOffset,
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

    // Create ultimate power bar (positioned in bottom left, next to Draw pile)
    if (this.ultimatePowerManager && player.id) {
      const characterClass = battlePlayer.selectedClass;
      const classColor = getClassColor(characterClass);
      
      // Initialize actor in ultimate power manager (or get existing state if restored)
      const existingState = this.ultimatePowerManager.getPowerState(player.id);
      if (!existingState) {
        this.ultimatePowerManager.initializeActor(player.id, characterClass);
      }
      
      // Position next to "Draw:" text in bottom left
      // Draw text is at x: 55, y: scene.scale.height - 110
      // Position ultimate bar to the right of it
      const barX = 125; // Right of "Draw: 0" text (moved 15px left)
      const barY = this.scale.height - 110; // Same height as Draw text
      
      // Create power bar UI
      const powerBar = new UltimatePowerBar(this, {
        x: barX,
        y: barY,
        width: 120,
        height: 14,
        actorId: player.id,
        actorName: player.name,
        classColor: classColor,
      });
      
      // Don't add to container, add directly to scene at world position
      this.powerBars.set(player.id, powerBar);
      
      // Restore visual state if power was persisted
      const powerState = this.ultimatePowerManager.getPowerState(player.id);
      if (powerState && powerState.power > 0) {
        powerBar.updatePower(powerState.power, powerState);
        console.log(`Created ultimate power bar for ${player.name} (${characterClass}) - RESTORED TO ${powerState.power.toFixed(1)}%`);
      } else {
        console.log(`Created ultimate power bar for ${player.name} (${characterClass}) - STARTING AT 0%`);
      }
    }

    return container;
  }

  /**
   * Map enemy name to enemy type for sprite lookup
   */
  private getEnemyType(enemyName: string): EnemyType | null {
    if (enemyName.includes('Demon Boss')) {
      return 'DemonBoss';
    }
    if (enemyName.includes('Minotaur')) {
      return 'Minotaur';
    }
    if (enemyName.includes('Flying Demon')) {
      return 'FlyingDemon';
    }
    if (enemyName.includes('Skeleton Warrior')) {
      return 'SkeletonWarrior';
    }
    if (enemyName.includes('Goblin')) {
      return 'Goblin'; // Keep for backward compatibility
    }
    if (enemyName.includes('Skele Mage')) {
      return 'SkeleMage';
    }
    if (enemyName.includes('Stone Golem')) {
      return 'StoneGolem';
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
        // Use larger scale and higher position for bosses and Stone Golem
        const spriteScale = (enemyType === 'Minotaur' || enemyType === 'DemonBoss') ? 3.5 : (enemyType === 'StoneGolem') ? 3.0 : 1.5;
        const spriteY = (enemyType === 'Minotaur' || enemyType === 'DemonBoss') ? -150 : (enemyType === 'StoneGolem') ? -60 : (enemyType === 'SkeletonWarrior') ? 40 : (enemyType === 'SkeleMage') ? -30 : -10; // Bosses positioned higher, Golems slightly elevated, Skeleton Warriors moved down, Skeleton Mages moved up
        const sprite = createEnemySprite(this, 0, spriteY, enemyType, spriteScale);
        if (sprite) {
          container.add(sprite);
          spriteCreated = true;
          bg.setVisible(false); // Hide background when using sprite
          console.log(`✓ Using sprite for enemy: ${enemy.name} (${enemyType}) at scale ${spriteScale}, y: ${spriteY}`);
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

  /**
   * Clean up any orphaned text elements in the upper left corner
   */
  private cleanupOrphanedTextElements(): void {
    console.log(`[BattleScene] NUCLEAR cleanup of ALL text elements in upper left`);
    
    // Find and destroy ANY text elements in the upper left corner
    const allObjects = this.children.list;
    for (let i = allObjects.length - 1; i >= 0; i--) {
      const obj = allObjects[i];
      if (obj && obj instanceof Phaser.GameObjects.Text) {
        // Check if text is in upper left corner (roughly x < 500, y < 300)
        if (obj.x < 500 && obj.y < 300) {
          // Destroy EVERYTHING in upper left corner
          console.log(`[BattleScene] DESTROYING ALL text at (${obj.x}, ${obj.y}): "${obj.text}"`);
          obj.destroy();
        }
      }
    }
  }

  private createHUD(): void {
    // Clean up any orphaned text elements in upper left corner
    this.cleanupOrphanedTextElements();
    
    this.hudContainer = this.add.container(0, 0);

    // Combat log panel (bottom right corner)
    const logWidth = 220;
    const logHeight = 80;
    const logX = this.scale.width - logWidth - 10; // Small margin from right edge
    const logY = this.scale.height - logHeight - 10; // Small margin from bottom edge
    
    // Create combat log container at correct position
    this.combatLogContainer = this.add.container(logX, logY);
    this.combatLogContainer.setDepth(1000);

    // Combat log title ABOVE the box
    const logTitle = this.add.text(logX, logY - 25, 'Combat Log', {
      fontSize: '18px',
      color: '#000000',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    logTitle.setOrigin(0, 0);
    logTitle.setDepth(1000);
    logTitle.setName('logTitle');

    // Combat log background with relative positioning (centered in container)
    const logBg = this.add.rectangle(logWidth / 2, logHeight / 2, logWidth, logHeight, 0x1a1a1a, 0.9);
    logBg.setStrokeStyle(1, 0x4a90e2, 0.6);
    logBg.setName('logBg');

    // Add background to container
    this.combatLogContainer.add(logBg);


    // Enable mouse wheel scrolling on the log background
    logBg.setInteractive();
    logBg.on('wheel', (pointer: any, deltaX: number, deltaY: number) => {
      this.handleLogScroll(deltaY);
    });

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

    // Phase indicator (top left) - Simple text only
    const phaseText = this.add.text(20, 20, 'Planning', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    phaseText.setOrigin(0, 0);
    phaseText.setDepth(1000);
    this.hudContainer.add(phaseText);

    // Bottom left HUD with proper positioning and sizing
    const statsWidth = 220;
    const statsHeight = 80;
    const statsX = 20; // Small margin from left edge (moved 10px right total)
    const statsY = this.scale.height - statsHeight - 10; // Small margin from bottom edge
    
    // Create stats background as direct scene child to avoid coordinate issues - using lobby plate
    const bottomLeftBg = this.add.image(statsX + statsWidth / 2, statsY + statsHeight / 2, 'lobbyplate');
    bottomLeftBg.setDisplaySize(280, 105); // Scale to fit (1200x450 -> maintain aspect ratio)
    bottomLeftBg.setDepth(1000);
    // Don't add to hudContainer to avoid coordinate issues

    // Store references to stat text objects so we can update them - direct scene children
    this.playerHpText = this.add.text(statsX + 20, statsY + 15, 'HP: 100%', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.playerHpText.setDepth(1001);

    this.playerLevelText = this.add.text(statsX + 20, statsY + 35, 'Level: 1', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.playerLevelText.setDepth(1001);

    this.playerApText = this.add.text(statsX + 20, statsY + 55, 'AP: 5', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.playerApText.setDepth(1001);
    
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
    bg.setInteractive({ useHandCursor: false });
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
    
    // Get player's deck state
    const myDeck = this.playerDecks.get(this.userId);
    if (!myDeck) {
      console.log('No deck for current player');
      return;
    }

    console.log(`Creating hand UI with ${myDeck.hand.length} cards from deck:`, myDeck.hand);
    console.log(`  Remaining in draw pile: ${myDeck.drawPile.length}, Discard: ${myDeck.discardPile.length}`);
    
    // Extra cleanup before creating HandUI to ensure no orphaned animated cards
    console.log('[BattleScene] Cleaning up any orphaned animated cards before creating HandUI');
    const allObjects = this.children.list;
    for (let i = allObjects.length - 1; i >= 0; i--) {
      const obj = allObjects[i];
      if (obj && obj.name && (obj.name === 'animatedDrawCard' || obj.name === 'animatedDiscardCard')) {
        console.log(`[BattleScene] DESTROYING orphaned animated card: ${obj.name}`);
        obj.destroy();
      }
    }
    
    // Create hand UI with current 4 cards from deck
    // Hide all cards initially for turn 1 deal animation
    this.handUI = new HandUI(
      this,
      myDeck.hand,
      (cardId) => this.selectCard(cardId),
      this.currentTurn === 1 ? myDeck.hand : undefined // Hide all cards on turn 1 for deal animation
    );

    // Update AP display
    const currentAP = this.playerAP.get(this.userId) || 0;
    this.handUI.setAP(currentAP);
    
    // Update pile indicators immediately (no delay needed - created immediately in HandUI)
    // On turn 1, show the full deck size before dealing (hand + draw pile)
    // On other turns, show the actual draw pile size
    if (this.currentTurn === 1) {
      const initialDeckSize = myDeck.hand.length + myDeck.drawPile.length;
      console.log(`[Deck] Turn 1: Showing initial deck size of ${initialDeckSize} cards in draw pile`);
      this.handUI.updatePileIndicators(initialDeckSize, myDeck.discardPile.length);
    } else {
      this.handUI.updatePileIndicators(myDeck.drawPile.length, myDeck.discardPile.length);
    }
    
    // Animate initial deal on turn 1
    if (this.currentTurn === 1) {
      console.log(`[Deck] Animating initial deal for turn 1`);
      const ANIMATION_STAGGER_MS = 200; // Delay between each card animation
      
      const totalCardsInDeck = myDeck.hand.length + myDeck.drawPile.length;
      myDeck.hand.forEach((cardId, index) => {
        const animationDelay = index * ANIMATION_STAGGER_MS; // 0ms, 200ms, 400ms, 600ms
        this.time.delayedCall(animationDelay + 100, () => { // Extra 100ms to ensure HandUI is ready
          if (this.handUI) {
            this.handUI.animateDrawCard(cardId, index, 0);
            
            // Update pile indicators after each card is dealt
            // Show remaining cards: total cards - cards dealt so far - 1 (for the current card being dealt)
            const remainingCards = totalCardsInDeck - index - 1;
            console.log(`[Deck] After dealing card ${index + 1} of ${myDeck.hand.length}, remaining in draw pile: ${remainingCards}`);
            this.handUI.updatePileIndicators(remainingCards, myDeck.discardPile.length);
          }
        });
      });
    }

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

    // Check if this is an ultimate card (0 AP cost)
    const isUltimateCard = card.ap === 0;
    
    if (isUltimateCard) {
      // Handle ultimate card - use ultimate power instead of AP
      if (!this.ultimatePowerManager) {
        console.error('Ultimate power manager not found');
        return;
      }
      
      const canUseUltimate = this.ultimatePowerManager.isUltimateReady(playerActor.id);
      if (!canUseUltimate) {
        this.showPendingActionText('❌ Ultimate not ready!', '#e74c3c');
        return;
      }
      
      // Consume ultimate power
      this.ultimatePowerManager.useUltimate(playerActor.id);
      this.updatePowerBar(playerActor.id);
      
      // Queue the ultimate action (same as regular cards)
      const action: ActionPlan = {
        by: playerActor.id,
        type: 'Card',
        target: targetId || undefined,
        cardId: this.selectedCardId || undefined,
      };
      this.queuedActions.push(action);
      
      console.log(`🔥 ULTIMATE QUEUED: ${card.name}!`);
      console.log(`Queued actions: ${this.queuedActions.length}`);
      
      // Ultimate card feedback removed - no announcement box needed
      
      // Update hand UI for ultimate card
      if (this.handUI) {
        // Raise the ultimate card FIRST before clearing selection
        if (this.selectedCardId) {
          this.handUI.raiseCard(this.selectedCardId);
        }
        this.handUI.clearSelection();
        
        // Remove the ultimate card from hand after playing it
        // This allows it to be re-added when ultimate is charged again
        this.handUI.removeUltimateCard();
        console.log(`✅ Removed ultimate card after playing`);
      }

      // Clear selection
      this.selectedCardId = null;
      this.selectedAction = null;
      this.selectedTarget = null;
    }

    // Regular card - deduct AP and queue
    const currentAP = this.playerAP.get(this.userId) || 0;
    const newAP = spendAP(currentAP, card.ap);
    this.playerAP.set(this.userId, newAP);

    // Queue the action
    const action: ActionPlan = {
      by: playerActor.id,
      type: 'Card',
      target: targetId || undefined,
      cardId: this.selectedCardId || undefined,
    };
    this.queuedActions.push(action);

    console.log(`Card ${card.name} played! AP: ${currentAP} -> ${newAP}`);
    console.log(`Queued actions: ${this.queuedActions.length}`);

    // Update hand UI
    if (this.handUI) {
      // Raise the card FIRST before updating AP (so it stays bright)
      if (this.selectedCardId) {
        this.handUI.raiseCard(this.selectedCardId);
      }
      this.handUI.setAP(newAP);
      this.handUI.clearSelection();
    }

    // Update player stats display
    this.updatePlayerStatsDisplay();

    // Update queued actions display
    this.updateQueueDisplay();

    // Card queued feedback removed - no announcement box needed

    // Clear selection
    this.selectedCardId = null;
    this.selectedAction = null;
    this.selectedTarget = null;

    // Show lock button to end turn
    this.showLockButton();
  }

  /**
   * Process played cards and update deck state
   * Called after turn resolution to discard played cards
   */
  private processPlayedCards(): void {
    console.log('[BattleScene] Processing played cards...');
    
    // Clean up any orphaned text elements before processing
    this.cleanupOrphanedTextElements();
    
    this.playerPlans.forEach((plans, actorId) => {
      const player = this.players.find(p => p.id === actorId);
      if (!player) return;
      
      const userId = player.userId || player.id;
      
      // ONLY process deck changes for the current player
      // Other players' card plays are already handled by the combat resolution
      if (userId !== this.userId) {
        console.log(`[BattleScene] Skipping deck processing for remote player: ${player.name}`);
        return;
      }
      
      const deck = this.playerDecks.get(userId);
      if (!deck) return;
      
      // Create animation callback for discarding cards (only for current player)
      const DISCARD_ANIMATION_STAGGER_MS = 200; // Delay between each card discard
      const onDiscardAnimation = (cardId: string, position: number, delay: number) => {
        if (this.handUI) {
          this.handUI.animateDiscardCard(cardId, position, delay);
        }
      };
      
      let cardIndex = 0;
      plans.forEach(plan => {
        if (plan.type === 'Card' && plan.cardId) {
          console.log(`[BattleScene] Processing played card: ${plan.cardId} for ${player.name}`);
          const animationDelay = cardIndex * DISCARD_ANIMATION_STAGGER_MS; // 0ms, 200ms, 400ms, etc.
          deckPlayCard(deck, plan.cardId, onDiscardAnimation, animationDelay);
          cardIndex++;
        }
      });
      
      // Update pile indicators for current player
      if (this.handUI) {
        this.handUI.updatePileIndicators(deck.drawPile.length, deck.discardPile.length);
      }
    });
    
    // Reset raised cards after processing (cards are now discarded)
    if (this.handUI) {
      this.handUI.resetRaisedCards();
    }
    
    console.log('[BattleScene] Finished processing played cards');
  }
  private isUltimateCard(cardName: string): boolean {
    const ultimateCardNames = ['Rain of Arrows', 'Meteor Shower', 'Berserk Rage'];
    return ultimateCardNames.includes(cardName);
  }

  private getUltimateCardId(cardName: string): string {
    const nameToIdMap: { [key: string]: string } = {
      'Rain of Arrows': 'RainOfArrows',
      'Meteor Shower': 'Meteor',
      'Berserk Rage': 'BerserkRage'
    };
    return nameToIdMap[cardName] || cardName;
  }

  private triggerUltimateAnimation(ultimateCardId: string, casterId: ActorId): void {
    if (ultimateCardId === 'RainOfArrows') {
      // Huntress ultimate - rain of arrows
      this.playArrowRain(casterId);
    } else if (ultimateCardId === 'Meteor') {
      // Mage ultimate - meteor shower
      this.playMeteorShower(casterId);
    } else if (ultimateCardId === 'BerserkRage') {
      // Warrior ultimate - berserk rage combo
      this.playBerserkRage(casterId);
    }
  }

  /**
   * ULTIMATE: Berserk Rage - 4-hit combo with all 3 attack animations
   */
  private playBerserkRage(casterId: ActorId): void {
    console.log(`⚔️ BERSERK RAGE ULTIMATE cast by ${casterId}!`);
    
    // Find the warrior player by casterId
    const warriorPlayer = this.players.find(p => p.id === casterId);
    if (!warriorPlayer) {
      console.warn(`Could not find warrior player with id: ${casterId}`);
      return;
    }
    
    // Get warrior's slot and sprite
    const warriorIndex = this.players.findIndex(p => p.id === warriorPlayer.id);
    const warriorSlot = this.partySlots[warriorIndex];
    if (!warriorSlot) {
      console.warn(`Could not find warrior slot for player: ${warriorPlayer.name}`);
      return;
    }
    
    const warriorSprite = warriorSlot.list.find(obj => obj.type === 'Sprite') as Phaser.GameObjects.Sprite | undefined;
    if (!warriorSprite) {
      console.warn(`Could not find warrior sprite for player: ${warriorPlayer.name}`);
      return;
    }
    
    // 🎬 DRAMATIC SLOW MOTION EFFECT
    this.time.timeScale = 0.5; // EXTREME slow motion for maximum drama
    
    // MASSIVE Red screen flash and vignette
    this.cameras.main.flash(300, 255, 0, 0); // Pure red flash
    
    // Camera zoom in slightly for drama
    const originalZoom = this.cameras.main.zoom;
    this.tweens.add({
      targets: this.cameras.main,
      zoom: originalZoom * 1.15,
      duration: 400,
      ease: 'Power2',
    });
    
    // Zoom back out at end
    this.time.delayedCall(3500, () => {
      this.tweens.add({
        targets: this.cameras.main,
        zoom: originalZoom,
        duration: 500,
        ease: 'Power2',
      });
    });
    
    // Add INTENSE pulsing red screen vignette
    const vignette = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      0xff0000,
      0
    );
    vignette.setDepth(150);
    
    this.tweens.add({
      targets: vignette,
      alpha: { from: 0.4, to: 0 },
      duration: 400,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });
    
    this.time.delayedCall(4000, () => {
      vignette.destroy();
    });
    
    // Lightning/energy bolts around warrior
    for (let i = 0; i < 6; i++) {
      const lightning = this.add.graphics();
      lightning.lineStyle(3, 0xffff00, 0.9);
      lightning.setDepth(50);
      
      const angle = (Math.PI * 2 * i) / 6;
      const startRadius = 60;
      const endRadius = 100;
      
      lightning.beginPath();
      lightning.moveTo(
        warriorSlot.x + Math.cos(angle) * startRadius,
        warriorSlot.y + Math.sin(angle) * startRadius
      );
      lightning.lineTo(
        warriorSlot.x + Math.cos(angle) * endRadius,
        warriorSlot.y + Math.sin(angle) * endRadius
      );
      lightning.strokePath();
      
      this.tweens.add({
        targets: lightning,
        alpha: { from: 1, to: 0 },
        duration: 300,
        delay: i * 100,
        repeat: 2,
        ease: 'Sine.easeInOut',
        onComplete: () => lightning.destroy(),
      });
    }
    
    // Add massive red aura around warrior with particles
    const rageAura = this.add.circle(warriorSlot.x, warriorSlot.y, 70, 0xff0000, 0);
    rageAura.setStrokeStyle(5, 0xff4444, 1);
    rageAura.setDepth(49);
    
    this.tweens.add({
      targets: rageAura,
      scale: { from: 0.8, to: 1.5 },
      alpha: { from: 0.8, to: 0 },
      duration: 3000,
      ease: 'Power2',
      onComplete: () => rageAura.destroy(),
    });
    
    // Pulsing rage circles
    for (let i = 0; i < 3; i++) {
      const rageCircle = this.add.circle(warriorSlot.x, warriorSlot.y, 50, 0xff0000, 0);
      rageCircle.setStrokeStyle(3, 0xff6666, 0.8);
      rageCircle.setDepth(48);
      
      this.tweens.add({
        targets: rageCircle,
        scale: { from: 1, to: 2 },
        alpha: { from: 0.6, to: 0 },
        duration: 800,
        delay: i * 200,
        repeat: 3,
        ease: 'Power2',
        onComplete: () => rageCircle.destroy(),
      });
    }
    
    // Combo sequence: Attack1 → Attack2 → Attack3 → Attack1
    const comboSequence = [
      'warrior_attack_anim',
      'warrior_attack2_anim',
      'warrior_attack3_anim',
      'warrior_attack_anim',
    ];
    
    let comboStep = 0;
    const damagePerHit = 7;
    
    // Execute combo with timing between attacks
    const executeComboStep = () => {
      if (comboStep >= comboSequence.length) {
        // Combo complete - return to idle
        console.log('✅ Berserk Rage combo complete!');
        warriorSprite.play('warrior_idle_anim');
        
        // Restore normal time speed immediately
        this.time.timeScale = 1.0;
        console.log('⏱️ Time speed restored');
        
        // Final victory pose effect
        const victoryFlash = this.add.circle(warriorSlot.x, warriorSlot.y, 80, 0xff4444, 0.5);
        victoryFlash.setDepth(49);
        
        this.tweens.add({
          targets: victoryFlash,
          scale: 2,
          alpha: 0,
          duration: 600,
          ease: 'Power3',
          onComplete: () => victoryFlash.destroy(),
        });
        
        // Check if combat ended from Berserk Rage damage
        this.checkCombatEndAfterUltimate();
        
        return;
      }
      
      const attackAnim = comboSequence[comboStep];
      console.log(`🗡️ Berserk combo step ${comboStep + 1}: ${attackAnim}`);
      
      // Pick a random living enemy to attack
      const livingEnemies = this.enemies.filter(e => e.hp > 0);
      if (livingEnemies.length === 0) {
        // No enemies left, end combo early
        console.log('All enemies defeated mid-combo!');
        warriorSprite.play('warrior_idle_anim');
        
        // Restore time speed
        this.time.timeScale = 1.0;
        
        // Check if combat ended from Berserk Rage damage
        this.checkCombatEndAfterUltimate();
        
        return;
      }
      
      const targetEnemy = Phaser.Utils.Array.GetRandom(livingEnemies);
      const enemyIndex = this.enemies.findIndex(e => e.id === targetEnemy.id);
      const enemySlot = this.enemySlots[enemyIndex];
      
      // Get scale factor for explosion effects based on enemy type
      const explosionScale = this.getAbilityScaleForEnemy(enemySlot) / 3; // Convert from ability scale to explosion scale
      
      // Check if this is the final hit
      const isFinalHit = comboStep === comboSequence.length - 1;
      
      // 🎬 BRIEF PAUSE before hit (use actual pause, not timeScale = 0)
      // Skip freeze frame to avoid stuck animation issues
      // The slow-mo effect is dramatic enough!
      
      // Chromatic aberration effect (RGB split)
      const chromaticR = this.add.rectangle(
        this.scale.width / 2 + 3,
        this.scale.height / 2,
        this.scale.width,
        this.scale.height,
        0xff0000,
        isFinalHit ? 0.15 : 0.08
      );
      chromaticR.setDepth(151);
      
      const chromaticB = this.add.rectangle(
        this.scale.width / 2 - 3,
        this.scale.height / 2,
        this.scale.width,
        this.scale.height,
        0x0000ff,
        isFinalHit ? 0.15 : 0.08
      );
      chromaticB.setDepth(151);
      
      this.tweens.add({
        targets: [chromaticR, chromaticB],
        alpha: 0,
        duration: 200,
        ease: 'Power2',
        onComplete: () => {
          chromaticR.destroy();
          chromaticB.destroy();
        },
      });
      
      // Play attack animation
      if (this.anims.exists(attackAnim)) {
        warriorSprite.play(attackAnim);
      }
      
      // Create MULTIPLE afterimages/ghost trails for more intensity
      for (let a = 0; a < (isFinalHit ? 3 : 2); a++) {
        const afterimage = this.add.sprite(warriorSlot.x, warriorSlot.y, warriorSprite.texture.key);
        afterimage.setFrame(warriorSprite.frame.name);
        afterimage.setScale(warriorSprite.scaleX, warriorSprite.scaleY);
        afterimage.setAlpha(0.6 - (a * 0.2));
        afterimage.setTint(0xff0000);
        afterimage.setDepth(48 - a);
        
        this.tweens.add({
          targets: afterimage,
          alpha: 0,
          x: afterimage.x - (a * 20),
          duration: 500 + (a * 100),
          ease: 'Power2',
          onComplete: () => afterimage.destroy(),
        });
      }
      
      // Play slash sound with increasing pitch
      if (this.soundManager) {
        this.soundManager.playCardSound('Strike');
        if (isFinalHit) {
          // Extra sound for finisher
          this.time.delayedCall(100, () => {
            if (this.soundManager) {
              this.soundManager.playCardSound('Bash');
            }
          });
        }
      }
      
      // Screen shake for each hit (gets MUCH stronger as combo builds)
      const shakeIntensity = isFinalHit ? 0.012 : (0.003 + (comboStep * 0.002));
      const shakeDuration = isFinalHit ? 300 : 100;
      this.cameras.main.shake(shakeDuration, shakeIntensity);
      
      // Speed lines during dash
      for (let i = 0; i < 5; i++) {
        const speedLine = this.add.line(
          warriorSlot.x - 50 + (i * 15),
          warriorSlot.y + Phaser.Math.Between(-30, 30),
          0, 0,
          -40, 0,
          0xff4444,
          0.6
        );
        speedLine.setLineWidth(3);
        speedLine.setDepth(47);
        
        this.tweens.add({
          targets: speedLine,
          alpha: 0,
          x: speedLine.x + 60,
          duration: 200,
          ease: 'Power2',
          onComplete: () => speedLine.destroy(),
        });
      }
      
      // Dash toward enemy (faster and further for finisher)
      const originalX = warriorSlot.x;
      const dashDistance = isFinalHit ? 120 : 80;
      this.tweens.add({
        targets: warriorSlot,
        x: originalX + dashDistance,
        duration: isFinalHit ? 200 : 150,
        ease: 'Power2',
        yoyo: true,
      });
      
      // Apply damage and visual effects
      if (enemySlot) {
        // Shake enemy (more intense for finisher)
        const enemyShakeDuration = isFinalHit ? 400 : 150;
        this.tweens.add({
          targets: enemySlot,
          scaleX: isFinalHit ? 0.7 : 0.9,
          scaleY: isFinalHit ? 0.7 : 0.9,
          duration: enemyShakeDuration,
          yoyo: true,
          ease: 'Power2',
        });
        
        // Slash VFX
        const slashSize = isFinalHit ? 100 : 60;
        const slash = this.add.graphics();
        slash.lineStyle(isFinalHit ? 8 : 5, 0xffffff, 1);
        slash.strokeCircle(enemySlot.x, enemySlot.y, slashSize);
        slash.setDepth(99);
        
        // Animated slash marks
        const slashAngle = Math.random() * Math.PI * 2;
        const slashLine = this.add.line(
          enemySlot.x,
          enemySlot.y,
          0, 0,
          Math.cos(slashAngle) * slashSize,
          Math.sin(slashAngle) * slashSize,
          0xff4444,
          1
        );
        slashLine.setLineWidth(isFinalHit ? 6 : 4);
        slashLine.setDepth(99);
        
        this.tweens.add({
          targets: [slash, slashLine],
          alpha: 0,
          duration: isFinalHit ? 400 : 200,
          ease: 'Power2',
          onComplete: () => {
            slash.destroy();
            slashLine.destroy();
          },
        });
        
        // Final hit gets ABSOLUTELY MASSIVE explosion
        if (isFinalHit) {
          // 💥 ULTRA FINISHER EXPLOSION 💥
          
          // White screen flash for impact
          this.cameras.main.flash(200, 255, 255, 255);
          
          // Multiple explosion layers
          const explosionLayers = [
            { radius: 30 * explosionScale, color: 0xffff00, scale: 6, duration: 500 },   // Bright core
            { radius: 50 * explosionScale, color: 0xff4400, scale: 5, duration: 600 },   // Inner blast
            { radius: 70 * explosionScale, color: 0xff0000, scale: 4.5, duration: 700 }, // Outer blast
          ];
          
          explosionLayers.forEach((layer, idx) => {
            const explosion = this.add.circle(enemySlot.x, enemySlot.y, layer.radius, layer.color, 0.9 - (idx * 0.2));
            explosion.setDepth(98 - idx);
            
            this.tweens.add({
              targets: explosion,
              scale: layer.scale,
              alpha: 0,
              duration: layer.duration,
              ease: 'Power3',
              onComplete: () => explosion.destroy(),
            });
          });
          
          // Expanding shockwave rings
          for (let r = 0; r < 3; r++) {
            const shockwave = this.add.circle(enemySlot.x, enemySlot.y, (40 + (r * 10)) * explosionScale, 0xff6666, 0);
            shockwave.setStrokeStyle(8 - (r * 2), 0xff8888, 1);
            shockwave.setDepth(95 - r);
            
            this.tweens.add({
              targets: shockwave,
              scale: 6 + r,
              alpha: 0,
              duration: 800 + (r * 100),
              delay: r * 100,
              ease: 'Power2',
              onComplete: () => shockwave.destroy(),
            });
          }
          
          // EXPLOSION PARTICLES EVERYWHERE
          for (let p = 0; p < 20; p++) {
            const particle = this.add.circle(
              enemySlot.x, 
              enemySlot.y, 
              Phaser.Math.Between(4, 8) * explosionScale, 
              Phaser.Math.Between(0, 1) > 0.5 ? 0xff4444 : 0xffff00, 
              1
            );
            particle.setDepth(96);
            
            const pAngle = (Math.PI * 2 * p) / 20;
            const pDist = Phaser.Math.Between(80, 150) * explosionScale;
            
            this.tweens.add({
              targets: particle,
              x: enemySlot.x + Math.cos(pAngle) * pDist,
              y: enemySlot.y + Math.sin(pAngle) * pDist,
              alpha: 0,
              scale: 0.3,
              duration: Phaser.Math.Between(600, 900),
              ease: 'Power2',
              onComplete: () => particle.destroy(),
            });
          }
          
          // Explosion sparks (smaller particles)
          for (let s = 0; s < 30; s++) {
            const spark = this.add.circle(
              enemySlot.x, 
              enemySlot.y, 
              2 * explosionScale, 
              0xffff00, 
              1
            );
            spark.setDepth(95);
            
            const sAngle = Math.random() * Math.PI * 2;
            const sDist = Phaser.Math.Between(50, 200) * explosionScale;
            
            this.tweens.add({
              targets: spark,
              x: enemySlot.x + Math.cos(sAngle) * sDist,
              y: enemySlot.y + Math.sin(sAngle) * sDist,
              alpha: 0,
              duration: Phaser.Math.Between(400, 700),
              ease: 'Linear',
              onComplete: () => spark.destroy(),
            });
          }
          
          // Ground impact cracks (radiating lines from impact)
          for (let c = 0; c < 8; c++) {
            const crackAngle = (Math.PI * 2 * c) / 8;
            const crack = this.add.line(
              enemySlot.x,
              enemySlot.y,
              0, 0,
              Math.cos(crackAngle) * 120,
              Math.sin(crackAngle) * 120,
              0xff4444,
              0.8
            );
            crack.setLineWidth(4);
            crack.setDepth(94);
            
            this.tweens.add({
              targets: crack,
              alpha: 0,
              duration: 800,
              delay: 200,
              ease: 'Power2',
              onComplete: () => crack.destroy(),
            });
          }
        }
        
        // Create afterimage/ghost trail
        const afterimage = this.add.sprite(warriorSlot.x, warriorSlot.y, warriorSprite.texture.key);
        afterimage.setFrame(warriorSprite.frame.name);
        afterimage.setScale(warriorSprite.scaleX, warriorSprite.scaleY);
        afterimage.setAlpha(0.5);
        afterimage.setTint(0xff0000);
        afterimage.setDepth(48);
        
        this.tweens.add({
          targets: afterimage,
          alpha: 0,
          duration: 400,
          ease: 'Power2',
          onComplete: () => afterimage.destroy(),
        });
        
        // Damage number with combo counter
        const fontSize = isFinalHit ? '36px' : '24px';
        const damageText = this.add.text(
          enemySlot.x + 40,
          enemySlot.y - 30,
          `-${damagePerHit}`,
          {
            fontSize: fontSize,
            color: isFinalHit ? '#ff0000' : '#ff4444',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: isFinalHit ? 6 : 4,
          }
        );
        damageText.setOrigin(0.5);
        damageText.setDepth(100);
        
        // Combo counter text
        const comboTextContent = isFinalHit ? '💥 FINISHER! 💥' : `HIT ${comboStep + 1}!`;
        const comboText = this.add.text(
          enemySlot.x + 40,
          enemySlot.y + 10,
          comboTextContent,
          {
            fontSize: isFinalHit ? '22px' : '18px',
            color: isFinalHit ? '#ffff00' : '#ffaa00',
            fontFamily: 'Arial Black',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: isFinalHit ? 4 : 3,
          }
        );
        comboText.setOrigin(0.5);
        comboText.setDepth(100);
        
        this.tweens.add({
          targets: damageText,
          y: damageText.y - (isFinalHit ? 70 : 50),
          scaleX: isFinalHit ? 1.3 : 1,
          scaleY: isFinalHit ? 1.3 : 1,
          alpha: 0,
          duration: isFinalHit ? 1000 : 800,
          ease: 'Power2',
          onComplete: () => damageText.destroy(),
        });
        
        this.tweens.add({
          targets: comboText,
          y: comboText.y - (isFinalHit ? 50 : 30),
          scaleX: isFinalHit ? 1.2 : 1,
          scaleY: isFinalHit ? 1.2 : 1,
          alpha: 0,
          duration: isFinalHit ? 800 : 600,
          ease: 'Power2',
          onComplete: () => comboText.destroy(),
        });
      }
      
      // Apply actual damage
      this.time.delayedCall(150, () => {
        if (isFinalHit) {
          // 💥 FINAL HIT: AOE DAMAGE TO ALL ENEMIES! 💥
          console.log('💥 FINISHER AOE - Damaging ALL enemies!');
          
          this.enemies.forEach((enemy, idx) => {
            if (enemy.hp > 0) {
              this.applyDamageToActor(enemy.id, damagePerHit);
              
              // Show AOE damage numbers on ALL enemies
              const enemySlotForAOE = this.enemySlots[idx];
              if (enemySlotForAOE) {
                const aoeDamageText = this.add.text(
                  enemySlotForAOE.x,
                  enemySlotForAOE.y - 30,
                  `-${damagePerHit}`,
                  {
                    fontSize: '32px',
                    color: '#ff0000',
                    fontFamily: 'Arial Black',
                    fontStyle: 'bold',
                    stroke: '#000000',
                    strokeThickness: 5,
                  }
                );
                aoeDamageText.setOrigin(0.5);
                aoeDamageText.setDepth(100);
                
                this.tweens.add({
                  targets: aoeDamageText,
                  y: aoeDamageText.y - 60,
                  scaleX: 1.3,
                  scaleY: 1.3,
                  alpha: 0,
                  duration: 1000,
                  ease: 'Power2',
                  onComplete: () => aoeDamageText.destroy(),
                });
                
                // AOE impact flash on each enemy
                const impactFlash = this.add.circle(enemySlotForAOE.x, enemySlotForAOE.y, 40, 0xffff00, 0.7);
                impactFlash.setDepth(97);
                this.tweens.add({
                  targets: impactFlash,
                  scale: 2.5,
                  alpha: 0,
                  duration: 500,
                  ease: 'Power3',
                  onComplete: () => impactFlash.destroy(),
                });
              }
            }
          });
          
          this.addCombatLogEntry(`💥 BERSERK FINISHER hits ALL enemies for ${damagePerHit} damage each!`, '#ffff00');
          
          // Check if combat ended after AOE damage
          this.time.delayedCall(500, () => {
            this.checkCombatEndAfterUltimate();
          });
        } else {
          // Regular hits: single target damage
          this.applyDamageToActor(targetEnemy.id, damagePerHit);
          this.addCombatLogEntry(`Berserk Rage hits ${targetEnemy.name} for ${damagePerHit} damage! (${comboStep + 1}/4)`, '#ff4444');
        }
      });
      
      // Move to next combo step
      comboStep++;
      
      // Wait for animation to complete before next attack
      warriorSprite.once('animationcomplete', () => {
        this.time.delayedCall(100, executeComboStep);
      });
    };
    
    // Start the combo!
    executeComboStep();
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
      // Only target alive enemies
      targets = this.enemies.filter(enemy => enemy.hp > 0);
    } else if (targetType === 'ally' || targetType === 'Guard' || targetType === 'Skill') {
      // Only target alive players
      targets = this.players.filter(player => player.hp > 0);
    } else {
      targets = [];
    }
    
    targets.forEach((target) => {
      const isEnemy = target.side === 'enemy';
      
      // Find the correct slot for this target
      let slot: Phaser.GameObjects.Container | undefined;
      if (isEnemy) {
        // Find the slot index for this specific enemy
        const enemyIndex = this.enemies.findIndex(enemy => enemy.id === target.id);
        slot = this.enemySlots[enemyIndex];
      } else {
        // Find the slot index for this specific player
        const playerIndex = this.players.findIndex(player => player.id === target.id);
        slot = this.partySlots[playerIndex];
      }
      
      if (slot) {
        // Adjust highlight size based on enemy type
        let width = 100;
        let height = 150;
        let offsetX = 0;
        let offsetY = 0;
        
        if (isEnemy) {
          const enemyType = this.getEnemyType(target.name);
          if (enemyType === 'Minotaur') {
            // Minotaur is much larger and positioned higher
            width = 200;   // Wider clickable area
            height = 300;  // Taller clickable area
            offsetX = 45;  // Move the center right to match sprite center
            offsetY = -80; // Move the center up to match sprite center
          }
        }
        
        const highlight = this.add.rectangle(slot.x + offsetX, slot.y + offsetY, width, height, 0xffff00, 0.3);
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
      
      // Locked confirmation removed - no announcement box needed
      
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
    
    // IMPORTANT: Deserialize shield values FIRST before building timeline!
    console.log('📦 Received payload.shields:', payload.shields);
    if (payload.shields && payload.shields.length > 0) {
      const shieldsMap = new Map();
      for (const entry of payload.shields) {
        console.log(`🛡️ Deserializing shields for actor ${entry.actorId}: ${entry.shieldValue}`);
        shieldsMap.set(entry.actorId, entry.shieldValue);
      }
      this.combatState.shields = shieldsMap;
      console.log('✅ Shield values loaded BEFORE timeline:', Array.from(shieldsMap.entries()));
    } else {
      // Clear shield effects if none exist
      console.log('🧹 No shield effects in payload, clearing combatState.shields');
      this.combatState.shields = new Map();
    }
    
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
    
    // Shields were already deserialized before building the timeline (line 2544-2558)
    
    // IMPORTANT: Deserialize fireShield values BEFORE building timeline!
    console.log('📦 Received payload.fireShield:', payload.fireShield);
    if (payload.fireShield && payload.fireShield.length > 0) {
      const fireShieldSet = new Set(payload.fireShield);
      this.combatState.fireShield = fireShieldSet;
      console.log('✅ Fire Shield actors loaded BEFORE timeline:', Array.from(fireShieldSet));
    } else {
      console.log('🧹 No fire shield actors in payload, clearing combatState.fireShield');
      this.combatState.fireShield = new Set();
    }
    
    // Deserialize blinded actors (should be empty as it's cleared each turn)
    console.log('📦 Received payload.blinded:', payload.blinded);
    if (payload.blinded && payload.blinded.length > 0) {
      const blindedSet = new Set(payload.blinded);
      this.combatState.blinded = blindedSet;
      console.log('✅ Blinded actors loaded:', Array.from(blindedSet));
    } else {
      this.combatState.blinded = new Set();
    }
    
    // Deserialize taunted actors (should be empty as it's cleared each turn)
    console.log('📦 Received payload.taunted:', payload.taunted);
    if (payload.taunted && payload.taunted.length > 0) {
      const tauntedMap = new Map();
      for (const entry of payload.taunted) {
        console.log(`🎯 Deserializing taunt: ${entry.actorId} must attack ${entry.taunter}`);
        tauntedMap.set(entry.actorId, entry.taunter);
      }
      this.combatState.taunted = tauntedMap;
      console.log('✅ Taunt effects loaded:', Array.from(tauntedMap.entries()));
    } else {
      this.combatState.taunted = new Map();
    }
    
    // Deserialize buff effects
    console.log('📦 Received payload.buffs:', payload.buffs);
    if (payload.buffs && payload.buffs.length > 0) {
      const buffsMap = new Map();
      for (const entry of payload.buffs) {
        console.log(`💪 Deserializing buffs for actor ${entry.actorId}:`, entry.buffs);
        buffsMap.set(entry.actorId, entry.buffs);
      }
      this.combatState.buffs = buffsMap;
      console.log('✅ Buff effects loaded:', Array.from(buffsMap.entries()));
    } else {
      this.combatState.buffs = new Map();
    }
    
    // Update status indicators after DOT persistence
    this.updateAllStatusIndicators();
    
    // DON'T check for combat end here - wait until animations complete
    // This allows death animations to play out fully
    
    // Start next turn (will be used if combat doesn't end)
    this.currentTurn = payload.turn + 1;
    this.combatState.turn = this.currentTurn;
    console.log(`Starting turn ${this.currentTurn}`);
    
    // Process played cards and update deck state
    this.processPlayedCards();
    
    // Reset for next turn
    this.playerPlans.clear();
    this.isLocked = false;
    this.selectedAction = null;
    this.selectedTarget = null;
    
    // Start timeline
    if (this.timeline) {
      console.log('Starting animation timeline...');
      console.log('Timeline before start:', {
        isActive: this.timeline.isActive()
      });
      
      this.timeline.start();
      
      console.log('Timeline after start:', {
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
        
        // Check if this is a boss turn and play boss turn sound
        const srcActor = [...this.players, ...this.enemies].find(a => a.id === srcId);
        if (srcActor && srcActor.side === 'enemy') {
          const enemyType = this.getEnemyType(srcActor.name);
          if (enemyType === 'Minotaur' && this.soundManager) {
            this.soundManager.playBossTurn();
          }
        }
        
        if (dstId) {
          // Clean up orphaned text before adding combat log
          this.cleanupOrphanedTextElements();
          this.addCombatLogEntry(`${srcName} targets ${dstName}`, '#f39c12');
        }
        this.playTelegraph(srcId, dstId);
      },
      onStrike: (srcId, dstId, note) => {
        console.log(`Animation: Strike from ${srcId} to ${dstId} (${note})`);
        
        // Clean up orphaned text before strike animation
        this.cleanupOrphanedTextElements();
        
        // Remove card from queue as it's being executed (for current player only)
        if (srcId === this.userId && this.queuedActions.length > 0) {
          this.animateQueueCardRemoval(0, 0); // Remove first card (index 0)
        }
        
        // Check if this is an ultimate card and trigger special animation
        if (note && this.isUltimateCard(note)) {
          console.log(`🔥 ULTIMATE CARD DETECTED: ${note} cast by ${srcId}!`);
          const cardId = this.getUltimateCardId(note);
          this.triggerUltimateAnimation(cardId, srcId);
          return; // Skip regular strike animation for ultimates
        }
        
        // Play sound based on the action note
        // Only play card sounds for actual card names (not animation types)
        if (note && this.soundManager) {
          const validCardNames = ['Strike', 'Nova', 'Bash', 'Slash', 'Heavy Strike', 'Cleave'];
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
        // Clean up orphaned text before adding combat log
        this.cleanupOrphanedTextElements();
        this.addCombatLogEntry(`${srcName} hits ${dstName} for ${damage} damage!`, '#e74c3c');
        
        // Don't play sound here - it's already played in onStrike callback
        // This prevents double-playing the Strike sound
        
        this.playHit(srcId, dstId, damage);
        
        // Apply damage immediately so health drops are visible during animations
        // Both clients receive the same damage values from the resolve payload, so this stays in sync
        console.log(`Applying damage to ${dstId} during animation`);
        this.applyDamageToActor(dstId, damage);
        
        // Grant ultimate power for attacker (card played)
        if (this.ultimatePowerManager && srcId) {
          const actor = [...this.players, ...this.enemies].find(a => a.id === srcId);
          if (actor && actor.side === 'party') {
            this.ultimatePowerManager.onCardPlayed(srcId);
            this.updatePowerBar(srcId);
          }
        }
        
        // Grant ultimate power for defender (damage taken)
        if (this.ultimatePowerManager && dstId) {
          const dstActor = [...this.players, ...this.enemies].find(a => a.id === dstId);
          if (dstActor && dstActor.side === 'party') {
            this.ultimatePowerManager.onDamageTaken(dstId, damage, dstActor);
            this.updatePowerBar(dstId);
          }
        }
        
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
        console.log(`[Animation] VFX from ${srcId} to ${dstId} (${note})`);
        
        // Add combat log entries for status effects
        if (note === 'vulnerable' && dstId) {
          const srcName = this.getActorName(srcId);
          const dstName = this.getActorName(dstId);
          this.addCombatLogEntry(`${srcName} weakens ${dstName}! (+2 dmg taken)`, '#9b59b6');
        }
        
        if (note === 'poison' && dstId) {
          const srcName = this.getActorName(srcId);
          const dstName = this.getActorName(dstId);
          this.addCombatLogEntry(`☠️ ${srcName} poisons ${dstName}!`, '#00ff00');
        }
        
        if (note === 'burn' && dstId) {
          const srcName = this.getActorName(srcId);
          const dstName = this.getActorName(dstId);
          this.addCombatLogEntry(`🔥 ${srcName} burns ${dstName}!`, '#ff4500');
        }
        
        if (note === 'taunt' && dstId) {
          const srcName = this.getActorName(srcId);
          const dstName = this.getActorName(dstId);
          this.addCombatLogEntry(`❗ ${srcName} taunts ${dstName}!`, '#ff0000');
        }
        
        if (note === 'blind' && dstId) {
          const srcName = this.getActorName(srcId);
          const dstName = this.getActorName(dstId);
          this.addCombatLogEntry(`💨 ${srcName} blinds ${dstName}!`, '#888888');
        }
        
        // Handle fire shield retaliate
        if (note === 'fire_shield_retaliate' && dstId) {
          const srcName = this.getActorName(srcId);
          const dstName = this.getActorName(dstId);
          this.addCombatLogEntry(`🔥 ${srcName}'s Fire Shield retaliates against ${dstName}!`, '#ff6347');
        }
        
        // Play sound effects for special VFX
        if (note && this.soundManager) {
          console.log(`VFX note detected: "${note}"`);
          if (note === 'vulnerable') {
            console.log('✓ Matched "vulnerable嫦 - Playing Weaken sound...');
            this.soundManager.playCardSound('Weaken');
          } else if (note === 'stun') {
            console.log('✓ Matched "stun" - Playing Bash sound...');
            this.soundManager.playCardSound('Bash');
          } else if (note === 'fire_shield_retaliate') {
            console.log('✓ Matched "fire_shield_retaliate" - Playing fire sound...');
            this.soundManager.playMageFireSpell();
          } else {
            console.log(`No sound mapping for VFX note: "${note}"`);
          }
        }
        
        this.playVfx(srcId, dstId, note);
        console.log(`=== END VFX CALLBACK ===`);
      },
      onUltimateGain: (srcId, amount) => {
        console.log(`Animation: Ultimate gain for ${srcId}, amount: ${amount}%`);
        const srcName = this.getActorName(srcId);
        this.addCombatLogEntry(`⚡ ${srcName} gains ${amount}% ultimate power!`, '#f39c12');
        
        // Grant ultimate power using the manager
        if (this.ultimatePowerManager) {
          this.ultimatePowerManager.addPower(srcId, amount, 'ultimate_elixir');
          console.log(`✓ Granted ${amount}% ultimate power to ${srcId}`);
          
          // Refresh UI if this is the local player
          getCurrentUserId().then(myId => {
            if (myId === srcId) {
              console.log(`Ultimate power updated for local player: ${srcId}`);
            }
          });
        }
        
        // Visual effect - add a glow animation
        const srcSlot = this.getActorSlot(srcId);
        if (srcSlot) {
          this.tweens.add({
            targets: srcSlot,
            alpha: { from: 1, to: 0.5 },
            scale: { from: 1, to: 1.2 },
            duration: 300,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
          });
        }
      },
      onMiss: (srcId, dstId) => {
        console.log(`Animation: Miss from ${srcId} to ${dstId}`);
        const srcName = this.getActorName(srcId);
        const dstName = this.getActorName(dstId);
        
        // Add combat log for miss
        this.addCombatLogEntry(`${srcName}'s attack misses ${dstName}!`, '#888888');
        
        // Visual effect - show "MISS" text above target
        const dstSlot = this.getActorSlot(dstId);
        if (dstSlot) {
          const missText = this.add.text(
            dstSlot.x,
            dstSlot.y - 80,
            'MISS!',
            {
              fontSize: '28px',
              color: '#888888',
              fontFamily: 'Arial, sans-serif',
              fontStyle: 'bold',
              stroke: '#000000',
              strokeThickness: 4,
            }
          );
          missText.setOrigin(0.5);
          missText.setDepth(100);
          
          // Animate the miss text
          this.tweens.add({
            targets: missText,
            y: missText.y - 40,
            alpha: 0,
            duration: 800,
            ease: 'Power2.easeOut',
            onComplete: () => missText.destroy(),
          });
          
          // Wobble the target to show they dodged
          this.tweens.add({
            targets: dstSlot,
            x: dstSlot.x + 10,
            duration: 100,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
          });
        }
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

  /**
   * Fire a fireball projectile from Mage to target
   */
  private fireFireballProjectile(srcSlot: Phaser.GameObjects.Container, dstSlot: Phaser.GameObjects.Container): void {
    // Create fireball sprite with animated frames
    const fireball = this.add.sprite(srcSlot.x, srcSlot.y, 'mage_meteor');
    fireball.setScale(2); // Scale up the fireball
    fireball.setDepth(50); // Above characters but below UI
    
    // Play fireball animation (looping)
    if (this.anims.exists('mage_meteor_anim')) {
      fireball.play('mage_meteor_anim');
    }
    
    // Calculate angle to target
    const angle = Phaser.Math.Angle.Between(srcSlot.x, srcSlot.y, dstSlot.x, dstSlot.y);
    fireball.setRotation(angle);
    
    console.log(`🔥 Firing fireball from (${srcSlot.x}, ${srcSlot.y}) to (${dstSlot.x}, ${dstSlot.y})`);
    
    // Tween fireball to target
    this.tweens.add({
      targets: fireball,
      x: dstSlot.x,
      y: dstSlot.y,
      duration: 300, // Slightly slower than arrow for visibility
      ease: 'Linear',
      onComplete: () => {
        // Explosion effect - scale up and fade out
        this.tweens.add({
          targets: fireball,
          scaleX: 3,
          scaleY: 3,
          alpha: 0,
          duration: 150,
          onComplete: () => fireball.destroy(),
        });
      },
    });
  }

  /**
   * Fire a Flame Nova - large fireball that splits into smaller fireballs at mid-point
   */
  private fireFlameNova(srcSlot: Phaser.GameObjects.Container): void {
    // Get all enemy slots for targets
    const enemySlots = this.enemySlots;
    if (enemySlots.length === 0) return;

    // Create large fireball sprite with animated frames
    const largeFireball = this.add.sprite(srcSlot.x, srcSlot.y, 'mage_meteor');
    largeFireball.setScale(4); // Much larger than regular fireball
    largeFireball.setDepth(50);
    
    // Play fireball animation (looping)
    if (this.anims.exists('mage_meteor_anim')) {
      largeFireball.play('mage_meteor_anim');
    }
    
    // Calculate midpoint between mage and first enemy (arbitrary mid-point)
    const targetEnemy = enemySlots[0];
    const midX = (srcSlot.x + targetEnemy.x) / 2;
    const midY = (srcSlot.y + targetEnemy.y) / 2;
    
    console.log(`🔥 Flame Nova: Firing large fireball from (${srcSlot.x}, ${srcSlot.y}) to midpoint (${midX}, ${midY})`);
    
    // Move large fireball to mid-point
    this.tweens.add({
      targets: largeFireball,
      x: midX,
      y: midY,
      duration: 400, // Slower than regular fireball
      ease: 'Linear',
      onComplete: () => {
        // DRAMATIC EXPLOSION EFFECT - Multiple layers for epicness
        
        // Layer 1: Core flash explosion (bright orange/yellow)
        const coreFlash = this.add.circle(midX, midY, 30, 0xffaa00, 1);
        coreFlash.setDepth(52);
        this.tweens.add({
          targets: coreFlash,
          scaleX: 6,
          scaleY: 6,
          alpha: 0,
          duration: 300,
          ease: 'Power2',
          onComplete: () => coreFlash.destroy(),
        });
        
        // Layer 2: Large explosion ring (white with orange border)
        const explosionRing = this.add.circle(midX, midY, 40, 0xffffff, 0.9);
        explosionRing.setStrokeStyle(4, 0xff6600, 1);
        explosionRing.setDepth(51);
        this.tweens.add({
          targets: explosionRing,
          scale: 8,
          alpha: 0,
          duration: 400,
          ease: 'Power3',
          onComplete: () => explosionRing.destroy(),
        });
        
        // Layer 3: Secondary explosion rings (smaller, for layering effect)
        const explosionRing2 = this.add.circle(midX, midY, 25, 0xffffee, 0.8);
        explosionRing2.setStrokeStyle(3, 0xff8844, 0.9);
        explosionRing2.setDepth(50);
        this.tweens.add({
          targets: explosionRing2,
          scale: 5,
          alpha: 0,
          duration: 350,
          ease: 'Power2',
          onComplete: () => explosionRing2.destroy(),
        });
        
        // Layer 4: Debris particles flying outward in all directions
        const debrisCount = 12;
        for (let i = 0; i < debrisCount; i++) {
          const angle = (Math.PI * 2 * i) / debrisCount;
          const debris = this.add.circle(midX, midY, 6, 0xff6600, 1);
          debris.setDepth(53);
          
          const distance = Phaser.Math.Between(80, 150);
          this.tweens.add({
            targets: debris,
            x: midX + Math.cos(angle) * distance,
            y: midY + Math.sin(angle) * distance,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => debris.destroy(),
          });
        }
        
        // Layer 5: Shockwave effect (semi-transparent expanding circle)
        const shockwave = this.add.circle(midX, midY, 10, 0xffffff, 0.4);
        shockwave.setStrokeStyle(6, 0xffff00, 0.6);
        shockwave.setDepth(49);
        this.tweens.add({
          targets: shockwave,
          scale: 12,
          alpha: 0,
          duration: 500,
          ease: 'Power3',
          onComplete: () => shockwave.destroy(),
        });
        
        // Finally, destroy the large fireball
        this.tweens.add({
          targets: largeFireball,
          scaleX: 6,
          scaleY: 6,
          alpha: 0,
          duration: 250,
          onComplete: () => largeFireball.destroy(),
        });
        
        // Delay then spawn smaller fireballs
        this.time.delayedCall(200, () => {
          console.log(`🔥 Flame Nova: Exploding into multiple heat-seeking fireballs!`);
          
          // Create 6 smaller fireballs for each enemy
          const fireballsPerEnemy = 6;
          let fireballIndex = 0;
          
          enemySlots.forEach((enemySlot, enemyIdx) => {
            // Create fireballs in a spread pattern around each enemy
            for (let i = 0; i < fireballsPerEnemy; i++) {
              this.time.delayedCall(fireballIndex * 15, () => {
                // Calculate initial spread angle (evenly distributed around circle)
                const spreadAngle = (Math.PI * 2 * i) / fireballsPerEnemy;
                
                // Start position for heat-seek behavior (orbit around midpoint)
                const orbitRadius = 80;
                const startX = midX + Math.cos(spreadAngle) * orbitRadius;
                const startY = midY + Math.sin(spreadAngle) * orbitRadius;
                
                const smallFireball = this.add.sprite(midX, midY, 'mage_meteor');
                smallFireball.setScale(1.5);
                smallFireball.setDepth(50);
                
                // Play fireball animation
                if (this.anims.exists('mage_meteor_anim')) {
                  smallFireball.play('mage_meteor_anim');
                }
                
                // Phase 1: Heat-seek orbit - move in a circle before homing in
                this.tweens.add({
                  targets: smallFireball,
                  x: startX,
                  y: startY,
                  duration: 200,
                  ease: 'Power1',
                  onComplete: () => {
                    // Phase 2: Homing behavior - curve towards enemy
                    const targetX = enemySlot.x + Phaser.Math.Between(-15, 15); // Add slight variation
                    const targetY = enemySlot.y + Phaser.Math.Between(-15, 15);
                    
                    // Update rotation to face target
                    const angle = Phaser.Math.Angle.Between(smallFireball.x, smallFireball.y, targetX, targetY);
                    smallFireball.setRotation(angle);
                    
                    // Get explosion scale based on enemy type
                    const explosionScale = this.getAbilityScaleForEnemy(enemySlot) / 3;
                    
                    this.tweens.add({
                      targets: smallFireball,
                      x: targetX,
                      y: targetY,
                      duration: 400,
                      ease: 'Power2',
                      onComplete: () => {
                        // Explosion flash effect
                        const explosionFlash = this.add.circle(targetX, targetY, 15 * explosionScale, 0xff6600, 1);
                        explosionFlash.setDepth(50);
                        
                        // Explosion ring
                        const explosionRing = this.add.circle(targetX, targetY, 20 * explosionScale, 0xffffff, 0.8);
                        explosionRing.setStrokeStyle(3, 0xff6600, 1);
                        explosionRing.setDepth(49);
                        
                        // Animate explosion flash
                        this.tweens.add({
                          targets: explosionFlash,
                          scaleX: 5,
                          scaleY: 5,
                          alpha: 0,
                          duration: 200,
                          ease: 'Power2',
                          onComplete: () => explosionFlash.destroy(),
                        });
                        
                        // Animate explosion ring
                        this.tweens.add({
                          targets: explosionRing,
                          scale: 3,
                          alpha: 0,
                          duration: 250,
                          ease: 'Power2',
                          onComplete: () => explosionRing.destroy(),
                        });
                        
                        // Destroy fireball immediately on impact
                        smallFireball.destroy();
                      },
                    });
                  },
                });
              });
              
              fireballIndex++;
            }
          });
        });
      },
    });
  }

  /**
   * Get the scale factor for abilities appearing at enemy locations based on the enemy type
   */
  private getAbilityScaleForEnemy(dstSlot: Phaser.GameObjects.Container): number {
    // Find the actor associated with this slot
    const enemyIndex = this.enemySlots.indexOf(dstSlot);
    if (enemyIndex === -1 || !this.enemies[enemyIndex]) {
      return 3; // Default scale
    }
    
    const enemy = this.enemies[enemyIndex];
    const enemyType = this.getEnemyType(enemy.name);
    
    // Boss enemies (Minotaur) are scaled 3.5x, so abilities should be 1.75x larger (3 * 1.75 = 5.25)
    // Regular enemies are scaled 1.5x, so keep ability at 3x
    if (enemyType === 'Minotaur') {
      return 5.25;
    }
    
    return 3;
  }

  /**
   * Fire Inferno spell - large flame appears at enemy location and lasts for 3 seconds
   */
  private fireInfernoFlame(srcSlot: Phaser.GameObjects.Container, dstSlot: Phaser.GameObjects.Container): void {
    const scale = this.getAbilityScaleForEnemy(dstSlot);
    
    // Find the actor associated with this slot to check enemy type
    const enemyIndex = this.enemySlots.indexOf(dstSlot);
    const xOffset = (enemyIndex !== -1 && this.enemies[enemyIndex]) 
      ? (this.getEnemyType(this.enemies[enemyIndex].name) === 'Minotaur' ? 60 : 0)
      : 0;
    const yOffset = (enemyIndex !== -1 && this.enemies[enemyIndex]) 
      ? (this.getEnemyType(this.enemies[enemyIndex].name) === 'Minotaur' ? -70 : 0)
      : 0;
    
    const flameX = dstSlot.x + xOffset;
    const flameY = dstSlot.y + yOffset;
    console.log(`🔥 Inferno: Creating flame at enemy location (${flameX}, ${flameY}) with scale ${scale}`);
    
    // Create flame sprite
    const flame = this.add.sprite(flameX, flameY, 'mage_inferno_flame');
    flame.setScale(scale);
    flame.setDepth(50); // Above characters
    
    // Play flame animation
    if (this.anims.exists('mage_inferno_flame_anim')) {
      flame.play('mage_inferno_flame_anim');
    }
    
    // Fade in the flame
    flame.setAlpha(0);
    this.tweens.add({
      targets: flame,
      alpha: 1,
      duration: 200,
      ease: 'Linear',
    });
    
    // Keep flame active for 1.5 seconds
    this.time.delayedCall(1500, () => {
      // Fade out
      this.tweens.add({
        targets: flame,
        alpha: 0,
        duration: 300,
        ease: 'Linear',
        onComplete: () => {
          flame.destroy();
        },
      });
    });
  }

  /**
   * ULTIMATE: Rain of Arrows - 15 arrows fall from sky hitting all enemies
   */
  private playArrowRain(casterId: ActorId): void {
    console.log(`🏹 RAIN OF ARROWS ULTIMATE cast by ${casterId}!`);
    
    // Get all enemy slots
    const enemySlots = this.enemySlots;
    if (enemySlots.length === 0) return;
    
    // Create 15 arrows that fall from the sky
    const arrowCount = 15;
    const skyY = -100; // Start above screen
    
    for (let i = 0; i < arrowCount; i++) {
      // Delay each arrow slightly for cascade effect
      this.time.delayedCall(i * 80, () => {
        // Pick a random enemy to target
        const targetSlot = Phaser.Utils.Array.GetRandom(enemySlots);
        
        // Random X offset around the target
        const offsetX = Phaser.Math.Between(-40, 40);
        const startX = targetSlot.x + offsetX;
        const endX = targetSlot.x + offsetX * 0.3; // Slight drift
        const endY = targetSlot.y;
        
        // Create arrow pointing downward
        const arrow = this.add.image(startX, skyY, 'huntress_arrow');
        arrow.setScale(2.5); // Slightly larger for ultimate
        arrow.setRotation(Math.PI / 2); // Point downward
        arrow.setDepth(100);
        arrow.setTint(0xffdd00); // Slight golden tint for ultimate
        
        // Animate arrow falling
        this.tweens.add({
          targets: arrow,
          x: endX,
          y: endY,
          duration: 500,
          ease: 'Cubic.easeIn', // Accelerate as it falls
          onComplete: () => {
            // Impact effect - small flash
            const impact = this.add.circle(endX, endY, 15, 0xffff00, 0.8);
            impact.setDepth(99);
            
            this.tweens.add({
              targets: impact,
              scale: 2,
              alpha: 0,
              duration: 200,
              ease: 'Power2',
              onComplete: () => impact.destroy(),
            });
            
            // Destroy arrow
            arrow.destroy();
          },
        });
      });
    }
    
    // Play sound effect for ultimate
    if (this.soundManager) {
      this.soundManager.playHuntressArrow();
      // Play additional sound after a moment for epic feel
      this.time.delayedCall(400, () => {
        if (this.soundManager) {
          this.soundManager.playHuntressArrow();
        }
      });
    }
    
    // Check if combat ended after Rain of Arrows
    // 15 arrows × 80ms stagger + 700ms for last hit + 200ms buffer = 2100ms
    this.time.delayedCall(2100, () => {
      this.checkCombatEndAfterUltimate();
    });
  }

  /**
   * ULTIMATE: Meteor Shower - Animated fireballs fall from sky hitting all enemies
   */
  private playMeteorShower(casterId: ActorId): void {
    console.log(`☄️ METEOR SHOWER ULTIMATE cast by ${casterId}!`);
    
    // Get all enemy slots
    const enemySlots = this.enemySlots;
    if (enemySlots.length === 0) return;
    
    // Create 12 meteors that fall from the sky
    const meteorCount = 12;
    const skyY = -150; // Start higher above screen
    
    for (let i = 0; i < meteorCount; i++) {
      // Delay each meteor slightly for cascade effect
      this.time.delayedCall(i * 100, () => {
        // Pick a random enemy to target
        const targetSlot = Phaser.Utils.Array.GetRandom(enemySlots);
        
        // Check if target is Minotaur boss to apply offset
        const enemyIndex = enemySlots.indexOf(targetSlot);
        const isMinotaur = enemyIndex !== -1 && this.enemies[enemyIndex] 
          ? this.getEnemyType(this.enemies[enemyIndex].name) === 'Minotaur'
          : false;
        const bossXOffset = isMinotaur ? 60 : 0;
        const bossYOffset = isMinotaur ? -70 : 0;
        
        // Random X offset around the target
        const offsetX = Phaser.Math.Between(-60, 60);
        const startX = targetSlot.x + offsetX + bossXOffset;
        const endX = targetSlot.x + offsetX * 0.2 + bossXOffset; // Slight drift with boss offset
        const endY = targetSlot.y + bossYOffset;
        
        // Create animated meteor sprite
        const meteor = this.add.sprite(startX, skyY, 'mage_meteor');
        meteor.setScale(3); // Scale up the meteor
        meteor.setRotation(Math.PI / 2); // Point downward (90 degrees)
        meteor.setDepth(100);
        meteor.setTint(0xff8800); // Orange/fire tint
        
        // Play meteor animation
        if (this.anims.exists('mage_meteor_anim')) {
          meteor.play('mage_meteor_anim');
        }
        
        // Animate meteor falling straight down (slightly slower for impact)
        this.tweens.add({
          targets: meteor,
          x: endX,
          y: endY,
          duration: 800, // Slowed down from 600ms
          ease: 'Cubic.easeIn', // Accelerate as it falls
          onUpdate: () => {
            // Add trail effect by spawning smaller particles
            if (Math.random() < 0.3) {
              const trail = this.add.circle(meteor.x, meteor.y, 4, 0xff8800, 0.8);
              trail.setDepth(99);
              this.tweens.add({
                targets: trail,
                alpha: 0,
                scale: 0.5,
                duration: 200,
                onComplete: () => trail.destroy(),
              });
            }
          },
          onComplete: () => {
            // Screen shake on impact for extra oomph
            this.cameras.main.shake(100, 0.003);
            
            // Core explosion (bright orange)
            const explosionCore = this.add.circle(endX, endY, 20, 0xffff00, 1);
            explosionCore.setDepth(101);
            
            // Middle explosion layer (orange)
            const explosion = this.add.circle(endX, endY, 30, 0xff4400, 0.9);
            explosion.setDepth(100);
            
            // Outer explosion ring (yellow-orange)
            const explosionRing = this.add.circle(endX, endY, 30, 0xff8800, 0);
            explosionRing.setStrokeStyle(4, 0xffaa00, 1);
            explosionRing.setDepth(99);
            
            // Second outer ring for extra impact
            const explosionRing2 = this.add.circle(endX, endY, 35, 0xff6600, 0);
            explosionRing2.setStrokeStyle(3, 0xff8800, 0.8);
            explosionRing2.setDepth(98);
            
            // Animate core explosion
            this.tweens.add({
              targets: explosionCore,
              scale: 3,
              alpha: 0,
              duration: 250,
              ease: 'Power3',
              onComplete: () => explosionCore.destroy(),
            });
            
            // Animate middle explosion
            this.tweens.add({
              targets: explosion,
              scale: 3.5,
              alpha: 0,
              duration: 350,
              ease: 'Power2',
              onComplete: () => explosion.destroy(),
            });
            
            // Animate outer ring
            this.tweens.add({
              targets: explosionRing,
              scale: 4,
              alpha: 0,
              duration: 450,
              ease: 'Power2',
              onComplete: () => explosionRing.destroy(),
            });
            
            // Animate second ring
            this.tweens.add({
              targets: explosionRing2,
              scale: 4.5,
              alpha: 0,
              duration: 500,
              ease: 'Power2',
              onComplete: () => explosionRing2.destroy(),
            });
            
            // Debris particles
            for (let j = 0; j < 8; j++) {
              const debris = this.add.circle(endX, endY, 3, 0xff6600, 1);
              debris.setDepth(97);
              
              const angle = (Math.PI * 2 * j) / 8;
              const distance = Phaser.Math.Between(30, 60);
              
              this.tweens.add({
                targets: debris,
                x: endX + Math.cos(angle) * distance,
                y: endY + Math.sin(angle) * distance,
                alpha: 0,
                duration: 400,
                ease: 'Power2',
                onComplete: () => debris.destroy(),
              });
            }
            
            // Destroy meteor
            meteor.destroy();
          },
        });
      });
    }
    
    // Play sound effects for ultimate
    if (this.soundManager) {
      this.soundManager.playMageFireSpell();
      // Play additional sounds for epic feel
      this.time.delayedCall(300, () => {
        if (this.soundManager) {
          this.soundManager.playMageFireSpell();
        }
      });
      this.time.delayedCall(600, () => {
        if (this.soundManager) {
          this.soundManager.playMageFireSpell();
        }
      });
    }
    
    // Check if combat ended after Meteor Shower
    // 12 meteors × 100ms stagger + 700ms for last hit + 500ms for explosion animations = 2400ms
    this.time.delayedCall(2400, () => {
      this.checkCombatEndAfterUltimate();
    });
  }

  private playStrike(srcId: ActorId, dstId: ActorId, note?: string): void {
    const srcSlot = this.getActorSlot(srcId);
    const dstSlot = this.getActorSlot(dstId);
    
    if (srcSlot) {
      // Try to play attack animation on sprite
      const actor = [...this.players, ...this.enemies].find(a => a.id === srcId);
      
      if (actor && actor.side === 'party') {
        // PLAYER ATTACK ANIMATIONS
        const battleActor = actor as BattleActor;
        const characterClass = battleActor.selectedClass;
        
        // Find sprite in the container
        const sprite = srcSlot.list.find(obj => obj.type === 'Sprite') as Phaser.GameObjects.Sprite | undefined;
        
        if (sprite && characterClass) {
          // Play attack animation if available
          let attackAnimKey: string | null = null;
          
          if (characterClass === 'Mage') {
            attackAnimKey = 'mage_attack_anim';
            
            // Play mage fire spell sound
            if (this.soundManager) {
              this.soundManager.playMageFireSpell();
            }
            
            // Check for special Mage cards
            if (note === 'Flame Nova') {
              // Fire Flame Nova special effect
              this.time.delayedCall(200, () => {
                this.fireFlameNova(srcSlot);
              });
            } else if (note === 'Inferno' && dstSlot) {
              // Fire Inferno flame effect at enemy location
              this.time.delayedCall(200, () => {
                this.fireInfernoFlame(srcSlot, dstSlot);
              });
            } else if (dstSlot) {
              // Fire regular fireball projectile for Mage
              this.time.delayedCall(200, () => {
                this.fireFireballProjectile(srcSlot, dstSlot);
              });
            }
          } else if (characterClass === 'Warrior') {
            // Randomly select from 3 warrior attack animations (no repeats)
            attackAnimKey = getRandomWarriorAttackAnim(sprite);
            console.log(`🗡️ Warrior using attack: ${attackAnimKey}`);
          } else if (characterClass === 'Huntress') {
            attackAnimKey = 'huntress_attack_anim';
            
            // Play huntress arrow sound
            if (this.soundManager) {
              this.soundManager.playHuntressArrow();
            }
            
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
      } else if (actor && actor.side === 'enemy') {
        // ENEMY ATTACK ANIMATIONS
        const enemyType = this.getEnemyType(actor.name);
        const sprite = srcSlot.list.find(obj => obj.type === 'Sprite') as Phaser.GameObjects.Sprite | undefined;
        
        if (sprite && enemyType) {
          let attackAnimKey: string | null = null;
          let idleAnimKey: string | null = null;
          
          if (enemyType === 'Goblin') {
            attackAnimKey = 'goblin_attack_anim';
            idleAnimKey = 'goblin_idle_anim';
          } else if (enemyType === 'FlyingDemon') {
            attackAnimKey = 'flying_demon_attack_anim';
            idleAnimKey = 'flying_demon_idle_anim';
          } else if (enemyType === 'SkeleMage') {
            attackAnimKey = 'skele_mage_attack_anim';
            idleAnimKey = 'skele_mage_idle_anim';
          } else if (enemyType === 'Minotaur') {
            // Alternate between attack1 and attack due
            this.minotaurAttackCounter++;
            attackAnimKey = this.minotaurAttackCounter % 2 === 1 ? 'minotaur_attack1_anim' : 'minotaur_attack2_anim';
            idleAnimKey = 'minotaur_idle_anim';
          } else if (enemyType === 'StoneGolem') {
            attackAnimKey = 'stone_golem_attack_anim';
            idleAnimKey = 'stone_golem_idle_anim';
          } else if (enemyType === 'SkeletonWarrior') {
            // Alternate between attack1 and attack2
            this.minotaurAttackCounter++;
            attackAnimKey = this.minotaurAttackCounter % 2 === 1 ? 'skeleton_warrior_attack1_anim' : 'skeleton_warrior_attack2_anim';
            idleAnimKey = 'skeleton_warrior_idle_anim';
          } else if (enemyType === 'DemonBoss') {
            attackAnimKey = 'demon_boss_attack_anim';
            idleAnimKey = 'demon_boss_idle_anim';
          }
          
          if (attackAnimKey && this.anims.exists(attackAnimKey)) {
            console.log(`🔥 Playing enemy attack animation: ${attackAnimKey}`);
            sprite.play(attackAnimKey);
            
            // Play boss attack sound if this is a boss
            if (enemyType === 'Minotaur' && this.soundManager) {
              this.soundManager.playBossAttack();
            }
            
            // Return to idle after attack animation completes
            if (idleAnimKey && this.anims.exists(idleAnimKey)) {
              sprite.once('animationcomplete', () => {
                sprite.play(idleAnimKey);
              });
            }
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
      // Try to play hurt animation on sprite
      const actor = [...this.players, ...this.enemies].find(a => a.id === dstId);
      
      if (actor && actor.side === 'party') {
        // PLAYER HURT ANIMATIONS
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
      } else if (actor && actor.side === 'enemy') {
        // ENEMY HURT ANIMATIONS
        // Skip hurt animations for dead enemies
        if (actor.hp <= 0) {
          console.log(`💀 Skipping hurt animation for dead enemy: ${actor.name}`);
          return;
        }
        
        const enemyType = this.getEnemyType(actor.name);
        const sprite = dstSlot.list.find(obj => obj.type === 'Sprite') as Phaser.GameObjects.Sprite | undefined;
        
        if (sprite && enemyType) {
          let hurtAnimKey: string | null = null;
          let idleAnimKey: string | null = null;
          
          if (enemyType === 'Goblin') {
            hurtAnimKey = 'goblin_hurt_anim';
            idleAnimKey = 'goblin_idle_anim';
          } else if (enemyType === 'FlyingDemon') {
            hurtAnimKey = 'flying_demon_hurt_anim';
            idleAnimKey = 'flying_demon_idle_anim';
          } else if (enemyType === 'SkeleMage') {
            hurtAnimKey = 'skele_mage_hurt_anim';
            idleAnimKey = 'skele_mage_idle_anim';
          } else if (enemyType === 'Minotaur') {
            hurtAnimKey = 'minotaur_hurt_anim';
            idleAnimKey = 'minotaur_idle_anim';
          } else if (enemyType === 'StoneGolem') {
            hurtAnimKey = 'stone_golem_hurt_anim';
            idleAnimKey = 'stone_golem_idle_anim';
          } else if (enemyType === 'SkeletonWarrior') {
            hurtAnimKey = 'skeleton_warrior_hurt_anim';
            idleAnimKey = 'skeleton_warrior_idle_anim';
          } else if (enemyType === 'DemonBoss') {
            hurtAnimKey = 'demon_boss_hurt_anim';
            idleAnimKey = 'demon_boss_idle_anim';
          }
          
          if (hurtAnimKey && this.anims.exists(hurtAnimKey)) {
            console.log(`💔 Playing enemy hurt animation: ${hurtAnimKey}`);
            sprite.play(hurtAnimKey);
            
            // Play boss hurt sound if this is a boss
            if (enemyType === 'Minotaur' && this.soundManager) {
              this.soundManager.playBossHurt();
            }
            
            // Return to idle after hurt animation completes (only if enemy is still alive)
            if (idleAnimKey && this.anims.exists(idleAnimKey)) {
              sprite.once('animationcomplete', () => {
                // Check if enemy is still alive before returning to idle
                const enemy = this.enemies.find(e => e.id === dstId);
                if (enemy && enemy.hp > 0) {
                  sprite.play(idleAnimKey);
                }
                // If enemy is dead, don't return to idle - death animation will handle it
              });
            }
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
        } else if (enemyType === 'SkeleMage') {
          deathAnimKey = 'skele_mage_death_anim';
        } else if (enemyType === 'Minotaur') {
          deathAnimKey = 'minotaur_death_anim';
        } else if (enemyType === 'StoneGolem') {
          deathAnimKey = 'stone_golem_death_anim';
        } else if (enemyType === 'SkeletonWarrior') {
          deathAnimKey = 'skeleton_warrior_death_anim';
        } else if (enemyType === 'DemonBoss') {
          deathAnimKey = 'demon_boss_death_anim';
        }
        
        if (deathAnimKey && this.anims.exists(deathAnimKey)) {
          console.log(`💀 Playing death animation: ${deathAnimKey}`);
          
          // Stop any existing animations and tweens
          sprite.stop();
          this.tweens.killTweensOf(sprite);
          
          // Play death animation
          sprite.play(deathAnimKey);
          
          // When death animation completes, stay on the last frame
          sprite.once('animationcomplete', () => {
            console.log(`💀 Death animation complete for ${enemyType}, staying on last frame`);
            
            // Stop the animation and stay on the last frame
            sprite.stop();
            
            // Get the last frame of the death animation
            const deathAnim = this.anims.get(deathAnimKey);
            if (deathAnim && deathAnim.frames.length > 0) {
              const lastFrame = deathAnim.frames[deathAnim.frames.length - 1];
              sprite.setFrame(lastFrame.textureFrame);
            }
            
            // Keep enemy visible until battle ends (except flying demon which fades out)
            if (enemyType !== 'FlyingDemon') {
              // Mark as dead but keep visible
              enemy.isDead = true;
              console.log(`💀 ${enemyType} staying visible in death pose until battle ends`);
            } else {
              // Flying demon fades out as intended
              enemySlot.setVisible(false);
            }
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

  /**
   * Create or update a persistent shield aura on an actor
   */
  private playGuard(srcId: ActorId, value: number): void {
    const srcSlot = this.getActorSlot(srcId);
    if (!srcSlot) return;

    // Get the actor to determine their class
    const actor = [...this.players, ...this.enemies].find(a => a.id === srcId);
    const battleActor = actor as BattleActor;
    const characterClass = battleActor?.selectedClass;

    // Value is the total shield amount (passed from combat.ts)
    const currentShield = value;
    console.log(`[Shield] playGuard called for ${srcId}, total shield: ${currentShield}`);

    // Check if shield aura already exists
    const existingAura = this.shieldAuras.get(srcId);
    
    if (existingAura) {
      // Update existing shield aura with current shield from combat state
      this.updateShieldAura(srcId, currentShield);
      this.updateFireShieldAura(srcId); // Update fire aura if needed
      
      // Don't play shield absorb effect when adding shield, only when taking damage
    } else if (currentShield > 0) {
      // Create new shield aura with current shield from combat state
      const aura = this.createShieldAura(srcSlot.x, srcSlot.y, currentShield, characterClass, srcId);
      this.shieldAuras.set(srcId, aura);

      // Initial spawn animation (burst effect)
      this.playShieldSpawnEffect(srcSlot.x, srcSlot.y);
    }
  }

  /**
   * Create a beautiful persistent shield aura
   */
  private createShieldAura(x: number, y: number, shieldValue: number, characterClass?: string, actorId?: ActorId): ShieldAura {
    const container = this.add.container(x, y);
    container.setDepth(49); // Just behind damage text

    // Check if this actor has Fire Shield active
    const hasFireShield = actorId && this.combatState.fireShield?.has(actorId);
    
    // Create fire-colored aura if Fire Shield is active
    let fireAura: Phaser.GameObjects.Graphics | undefined;
    if (hasFireShield) {
      fireAura = this.add.graphics();
      
      // Outer layer - bright red-orange glow
      fireAura.fillStyle(0xff6347, 0.35); // Visible but not too bright
      fireAura.fillCircle(0, 0, 85);
      
      // Middle layer - bright orange
      fireAura.fillStyle(0xff7700, 0.25); // More transparent orange
      fireAura.fillCircle(0, 0, 70);
      
      // Inner layer - soft orange-yellow (keep it subtle in center)
      fireAura.fillStyle(0xffaa00, 0.15); // Very transparent center so player is visible
      fireAura.fillCircle(0, 0, 55);
      
      fireAura.setDepth(48);
      container.add(fireAura);
      
      // Animate the fire aura (more pronounced flickering effect)
      this.tweens.add({
        targets: fireAura,
        alpha: { from: 0.5, to: 0.9 }, // More dramatic flicker
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      
      // Add pulsing scale animation for extra visibility
      this.tweens.add({
        targets: fireAura,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Check if this is a Mage using Fire Shield
    const isMageFireShield = characterClass === 'Mage';
    
    if (isMageFireShield) {
      // Mage fire shield sprite
      const shieldSprite = this.add.sprite(0, 0, 'mage_fire_shield');
      shieldSprite.play('mage_fire_shield_anim');
      shieldSprite.setScale(3.5); // Scale appropriately
      shieldSprite.setDepth(48); // Behind the container
      container.add(shieldSprite);
      
      // Shield value text (positioned below character)
      const shieldText = this.add.text(0, 35, `🛡️${shieldValue}`, {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'Arial Black',
        fontStyle: 'bold',
        stroke: '#ff6347',
        strokeThickness: 3,
      });
      shieldText.setOrigin(0.5);
      container.add(shieldText);
      
      // Gentle pulse animation
      const pulseAnim = this.tweens.add({
        targets: container,
        scaleX: 1.02,
        scaleY: 1.02,
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      
      return {
        container,
        shieldSprite,
        shieldText,
        pulseAnim,
        fireAura,
      };
    }

    // Standard shield visuals for non-mages
    
    // Outer glow (much more subtle)
    const glow = this.add.graphics();
    glow.fillStyle(0x4da6ff, 0.08); // Much more transparent
    glow.fillCircle(0, 0, 70);
    glow.fillStyle(0x4da6ff, 0.12); // Subtle inner glow
    glow.fillCircle(0, 0, 50);
    container.add(glow);

    // Hexagon shield pattern (wireframe style - more transparent)
    const hexagon = this.add.graphics();
    hexagon.lineStyle(4, 0x3498db, 0.6); // Thicker lines, more transparent
    this.drawHexagonStroke(hexagon, 0, 0, 45);
    container.add(hexagon);

    // Inner hexagon (smaller, more transparent)
    const innerHex = this.add.graphics();
    innerHex.lineStyle(2, 0x5dade2, 0.5);
    this.drawHexagonStroke(innerHex, 0, 0, 30);
    container.add(innerHex);

    // Floating particles around shield (smaller and more subtle)
    const particles: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < 6; i++) { // Fewer particles
      const angle = (Math.PI * 2 * i) / 6;
      const distance = 50; // Closer to center
      const particle = this.add.graphics();
      particle.fillStyle(0x5dade2, 0.6); // More transparent
      particle.fillCircle(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        2 // Smaller particles
      );
      container.add(particle);
      particles.push(particle);

      // Animate particles floating (slower)
      this.tweens.add({
        targets: particle,
        x: Math.cos(angle) * (distance + 8),
        y: Math.sin(angle) * (distance + 8),
        alpha: 0.3,
        duration: 1500 + (i * 100),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Shield value text (positioned below character)
    const shieldText = this.add.text(0, 35, `🛡️${shieldValue}`, {
      fontSize: '16px', // Smaller text
      color: '#ffffff',
      fontFamily: 'Arial Black',
      fontStyle: 'bold',
      stroke: '#3498db',
      strokeThickness: 3,
    });
    shieldText.setOrigin(0.5);
    container.add(shieldText);

    // Gentle pulse animation (much subtler)
    const pulseAnim = this.tweens.add({
      targets: container,
      scaleX: 1.02, // Much smaller pulse
      scaleY: 1.02,
      duration: 2000, // Slower pulse
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Slow rotation for hexagon
    const rotateAnim = this.tweens.add({
      targets: [hexagon, innerHex],
      angle: 360,
      duration: 8000,
      repeat: -1,
      ease: 'Linear',
    });

    // Add energy ring at character's feet (doesn't cover character)
    const energyRing = this.add.graphics();
    energyRing.lineStyle(3, 0x4da6ff, 0.4);
    energyRing.strokeCircle(0, 20, 25); // Below the character
    energyRing.lineStyle(2, 0x5dade2, 0.3);
    energyRing.strokeCircle(0, 20, 35); // Outer ring
    container.add(energyRing);

    // Animate energy ring pulsing
    this.tweens.add({
      targets: energyRing,
      alpha: 0.7,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return {
      container,
      hexagon,
      glow,
      particles,
      shieldText,
      pulseAnim,
      rotateAnim,
      fireAura,
    };
  }

  /**
   * Draw a hexagon shape
   */
  private drawHexagon(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, alpha: number): void {
    graphics.fillStyle(color, alpha);
    graphics.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const px = x + size * Math.cos(angle);
      const py = y + size * Math.sin(angle);
      if (i === 0) {
        graphics.moveTo(px, py);
      } else {
        graphics.lineTo(px, py);
      }
    }
    graphics.closePath();
    graphics.fillPath();
  }

  /**
   * Draw a hexagon stroke
   */
  private drawHexagonStroke(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
    graphics.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const px = x + size * Math.cos(angle);
      const py = y + size * Math.sin(angle);
      if (i === 0) {
        graphics.moveTo(px, py);
      } else {
        graphics.lineTo(px, py);
      }
    }
    graphics.closePath();
    graphics.strokePath();
  }

  /**
   * Shield spawn burst effect
   */
  private playShieldSpawnEffect(x: number, y: number): void {
    // Blue flash
    const flash = this.add.circle(x, y, 30, 0x3498db, 0.8);
    flash.setDepth(50);

    this.tweens.add({
      targets: flash,
      scale: 3,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => flash.destroy(),
    });

    // Expanding rings
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(x, y, 40, 0x5dade2, 0);
      ring.setStrokeStyle(3, 0x5dade2, 1);
      ring.setDepth(50);

      this.tweens.add({
        targets: ring,
        scale: 2 + (i * 0.3),
        alpha: 0,
        duration: 600 + (i * 100),
        delay: i * 80,
        ease: 'Power2',
        onComplete: () => ring.destroy(),
      });
    }

    // Burst particles
    for (let p = 0; p < 12; p++) {
      const angle = (Math.PI * 2 * p) / 12;
      const particle = this.add.circle(x, y, 4, 0x85c1e9, 1);
      particle.setDepth(50);

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * 60,
        y: y + Math.sin(angle) * 60,
        alpha: 0,
        scale: 0.5,
        duration: 500,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }

    // "+SHIELD" text popup
    const shieldPopup = this.add.text(x, y - 60, '+SHIELD', {
      fontSize: '22px',
      color: '#3498db',
      fontFamily: 'Arial Black',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 4,
    });
    shieldPopup.setOrigin(0.5);
    shieldPopup.setDepth(100);

    this.tweens.add({
      targets: shieldPopup,
      y: shieldPopup.y - 30,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => shieldPopup.destroy(),
    });
  }

  /**
   * Remove shield aura from an actor
   */
  private removeShieldAura(actorId: ActorId): void {
    const aura = this.shieldAuras.get(actorId);
    if (aura) {
      // Stop animations
      if (aura.pulseAnim) aura.pulseAnim.stop();
      if (aura.rotateAnim) aura.rotateAnim.stop();

      // Fade out effect
      this.tweens.add({
        targets: aura.container,
        alpha: 0,
        scale: 0.8,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          // Clean up fire aura if it exists
          if (aura.fireAura) {
            aura.fireAura.destroy();
          }
          aura.container.destroy();
        },
      });

      this.shieldAuras.delete(actorId);
    }
  }

  /**
   * Update shield aura value (when shield amount changes)
   */
  private updateShieldAura(actorId: ActorId, newValue: number): void {
    const aura = this.shieldAuras.get(actorId);
    if (aura) {
      aura.shieldText.setText(`🛡️${newValue}`);
      
      // Flash effect on update
      this.tweens.add({
        targets: aura.shieldText,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 200,
        yoyo: true,
        ease: 'Back.easeOut',
      });
    }
  }

  /**
   * Update fire shield aura based on combat state
   */
  private updateFireShieldAura(actorId: ActorId): void {
    const aura = this.shieldAuras.get(actorId);
    if (!aura) return;
    
    const hasFireShield = this.combatState.fireShield?.has(actorId);
    
    // If Fire Shield is active and aura doesn't exist, create it
    if (hasFireShield && !aura.fireAura) {
      const fireAura = this.add.graphics();
      
      // Outer layer - bright red-orange glow
      fireAura.fillStyle(0xff6347, 0.35); // Visible but not too bright
      fireAura.fillCircle(0, 0, 85);
      
      // Middle layer - bright orange
      fireAura.fillStyle(0xff7700, 0.25); // More transparent orange
      fireAura.fillCircle(0, 0, 70);
      
      // Inner layer - soft orange-yellow (keep it subtle in center)
      fireAura.fillStyle(0xffaa00, 0.15); // Very transparent center so player is visible
      fireAura.fillCircle(0, 0, 55);
      
      fireAura.setDepth(48);
      aura.container.add(fireAura);
      
      // Animate the fire aura (more pronounced flickering effect)
      this.tweens.add({
        targets: fireAura,
        alpha: { from: 0.5, to: 0.9 }, // More dramatic flicker
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      
      // Add pulsing scale animation for extra visibility
      this.tweens.add({
        targets: fireAura,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      
      aura.fireAura = fireAura;
    }
    // If Fire Shield is not active but aura exists, remove it
    else if (!hasFireShield && aura.fireAura) {
      aura.fireAura.destroy();
      aura.fireAura = undefined;
    }
  }

  /**
   * Update shield aura from combat state (when damage is applied)
   */
  private updateShieldAuraFromCombatState(actorId: ActorId): void {
    // Get current shield value from combat state
    const shieldValue = this.combatState.shields?.get(actorId) || 0;
    
    console.log(`[Shield Update] Actor ${actorId}: shieldValue = ${shieldValue}`);
    
    if (shieldValue > 0) {
      // Update existing shield aura or create new one
      const aura = this.shieldAuras.get(actorId);
      if (aura) {
        console.log(`[Shield Update] Updating existing shield aura from ${aura.shieldText.text} to ${shieldValue}`);
        this.updateShieldAura(actorId, shieldValue);
        this.updateFireShieldAura(actorId); // Update fire aura
        
        // Show shield absorption effect
        this.playShieldAbsorbEffect(actorId);
      } else {
        // Create new shield aura if it doesn't exist
        const slot = this.getActorSlot(actorId);
        if (slot) {
          // Get the actor to determine their class
          const actor = [...this.players, ...this.enemies].find(a => a.id === actorId);
          const battleActor = actor as BattleActor;
          const characterClass = battleActor?.selectedClass;
          
          console.log(`[Shield Update] Creating new shield aura for actor ${actorId}`);
          const newAura = this.createShieldAura(slot.x, slot.y, shieldValue, characterClass, actorId);
          this.shieldAuras.set(actorId, newAura);
        }
      }
    } else {
      // Only remove shield aura if it exists
      const aura = this.shieldAuras.get(actorId);
      if (aura) {
        console.log(`[Shield Update] Removing shield for actor ${actorId}`);
        this.removeShieldAura(actorId);
        
        // Show shield break effect
        this.playShieldBreakEffect(actorId);
      }
    }
  }

  /**
   * Play shield absorption effect when shield takes damage
   */
  private playShieldAbsorbEffect(actorId: ActorId): void {
    const slot = this.getActorSlot(actorId);
    if (!slot) return;

    // Blue spark effect when shield absorbs damage
    const spark = this.add.circle(slot.x, slot.y, 8, 0x4da6ff, 0.8);
    spark.setDepth(50);

    this.tweens.add({
      targets: spark,
      scale: 2,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => spark.destroy(),
    });

    // Shield absorption text
    const absorbText = this.add.text(slot.x, slot.y - 40, 'SHIELD ABSORBED', {
      fontSize: '14px',
      color: '#4da6ff',
      fontFamily: 'Arial Black',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 2,
    });
    absorbText.setOrigin(0.5);
    absorbText.setDepth(100);

    this.tweens.add({
      targets: absorbText,
      y: absorbText.y - 20,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => absorbText.destroy(),
    });
  }

  /**
   * Play shield break effect when shield is destroyed
   */
  private playShieldBreakEffect(actorId: ActorId): void {
    const slot = this.getActorSlot(actorId);
    if (!slot) return;

    // Explosion of blue particles when shield breaks
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const particle = this.add.circle(slot.x, slot.y, 4, 0x4da6ff, 1);
      particle.setDepth(50);

      this.tweens.add({
        targets: particle,
        x: slot.x + Math.cos(angle) * 40,
        y: slot.y + Math.sin(angle) * 40,
        alpha: 0,
        scale: 0.3,
        duration: 600,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }

    // Shield break text
    const breakText = this.add.text(slot.x, slot.y - 50, 'SHIELD BROKEN!', {
      fontSize: '16px',
      color: '#ff4444',
      fontFamily: 'Arial Black',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 3,
    });
    breakText.setOrigin(0.5);
    breakText.setDepth(100);

    this.tweens.add({
      targets: breakText,
      y: breakText.y - 30,
      alpha: 0,
      scale: 1.2,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => breakText.destroy(),
    });
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
    if (note === 'fire_shield_retaliate' && dstId) {
      const srcSlot = this.getActorSlot(srcId);
      const dstSlot = this.getActorSlot(dstId);
      if (srcSlot && dstSlot) {
        // Fire simple fireball from player to enemy (no attack animation)
        this.fireSimpleFireball(srcSlot, dstSlot);
      }
      return;
    }
    
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
    
    // Poison DOT effect
    if (note === 'poison' && dstId) {
      const dstSlot = this.getActorSlot(dstId);
      if (dstSlot) {
        // Create poison bubbles/particles
        const poisonGraphics = this.add.graphics();
        poisonGraphics.fillStyle(0x00ff00, 0.7);
        
        // Create multiple poison bubbles
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const radius = 30 + Math.random() * 10;
          const x = dstSlot.x + Math.cos(angle) * radius;
          const y = dstSlot.y + Math.sin(angle) * radius;
          const size = 5 + Math.random() * 5;
          
          poisonGraphics.fillCircle(x - dstSlot.x, y - dstSlot.y, size);
        }
        
        poisonGraphics.setPosition(dstSlot.x, dstSlot.y);
        poisonGraphics.setDepth(90);
        
        // Poison text indicator
        const poisonText = this.add.text(
          dstSlot.x,
          dstSlot.y - 60,
          '☠️ POISONED',
          {
            fontSize: '18px',
            color: '#00ff00',
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            backgroundColor: '#000000',
            padding: { x: 6, y: 4 },
            stroke: '#003300',
            strokeThickness: 2,
          }
        );
        poisonText.setOrigin(0.5);
        poisonText.setDepth(100);
        
        // Animate bubbles rising and fading
        this.tweens.add({
          targets: poisonGraphics,
          y: dstSlot.y - 50,
          alpha: 0,
          duration: 1200,
          ease: 'Sine.easeOut',
          onComplete: () => poisonGraphics.destroy(),
        });
        
        // Pulse text
        this.tweens.add({
          targets: poisonText,
          scaleX: 1.2,
          scaleY: 1.2,
          duration: 200,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
        });
        
        // Fade out text
        this.tweens.add({
          targets: poisonText,
          alpha: 0,
          duration: 800,
          delay: 600,
          ease: 'Power2',
          onComplete: () => poisonText.destroy(),
        });
      }
    }
    
    // Burn DOT effect
    if (note === 'burn' && dstId) {
      const dstSlot = this.getActorSlot(dstId);
      if (dstSlot) {
        console.log(`[VFX] Burn effect on ${dstId}`);
        // Create fire particles
        const fireGraphics = this.add.graphics();
        fireGraphics.setDepth(90);
        
        // Create flame effect with multiple circles
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const radius = 25 + Math.random() * 15;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const size = 6 + Math.random() * 6;
          
          // Gradient from red to orange to yellow
          const colors = [0xff0000, 0xff4500, 0xff8800, 0xffaa00];
          const color = colors[Math.floor(Math.random() * colors.length)];
          fireGraphics.fillStyle(color, 0.8);
          fireGraphics.fillCircle(x, y, size);
        }
        
        fireGraphics.setPosition(dstSlot.x, dstSlot.y);
        
        // Burn text indicator
        const burnText = this.add.text(
          dstSlot.x,
          dstSlot.y - 60,
          '🔥 BURNING',
          {
            fontSize: '18px',
            color: '#ff4500',
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            backgroundColor: '#000000',
            padding: { x: 6, y: 4 },
            stroke: '#330000',
            strokeThickness: 2,
          }
        );
        burnText.setOrigin(0.5);
        burnText.setDepth(100);
        
        // Animate flames rising and flickering
        this.tweens.add({
          targets: fireGraphics,
          y: dstSlot.y - 60,
          alpha: 0,
          duration: 1000,
          ease: 'Sine.easeOut',
          onComplete: () => fireGraphics.destroy(),
        });
        
        // Add flicker effect
        this.tweens.add({
          targets: fireGraphics,
          scaleX: { from: 1, to: 1.3 },
          scaleY: { from: 1, to: 1.3 },
          duration: 150,
          yoyo: true,
          repeat: 3,
          ease: 'Sine.easeInOut',
        });
        
        // Pulse text
        this.tweens.add({
          targets: burnText,
          scaleX: 1.2,
          scaleY: 1.2,
          duration: 200,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
        });
        
        // Fade out text
        this.tweens.add({
          targets: burnText,
          alpha: 0,
          duration: 800,
          delay: 500,
          ease: 'Power2',
          onComplete: () => burnText.destroy(),
        });
      }
    }
    
    // Taunt effect
    if (note === 'taunt' && dstId) {
      const dstSlot = this.getActorSlot(dstId);
      const srcSlot = this.getActorSlot(srcId);
      if (dstSlot && srcSlot) {
        // Draw a line/arrow from taunted enemy to taunter
        const line = this.add.graphics();
        line.lineStyle(4, 0xff0000, 0.8);
        line.beginPath();
        line.moveTo(dstSlot.x, dstSlot.y);
        line.lineTo(srcSlot.x, srcSlot.y);
        line.strokePath();
        line.setDepth(85);
        
        // Add exclamation mark above enemy
        const tauntText = this.add.text(
          dstSlot.x,
          dstSlot.y - 70,
          '❗ TAUNTED',
          {
            fontSize: '18px',
            color: '#ff0000',
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            backgroundColor: '#000000',
            padding: { x: 6, y: 4 },
            stroke: '#660000',
            strokeThickness: 2,
          }
        );
        tauntText.setOrigin(0.5);
        tauntText.setDepth(100);
        
        // Pulse line
        this.tweens.add({
          targets: line,
          alpha: 0.3,
          duration: 300,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
        });
        
        // Shake text
        this.tweens.add({
          targets: tauntText,
          y: tauntText.y - 10,
          duration: 150,
          yoyo: true,
          repeat: 3,
          ease: 'Sine.easeInOut',
        });
        
        // Fade out
        this.tweens.add({
          targets: [line, tauntText],
          alpha: 0,
          duration: 800,
          delay: 800,
          ease: 'Power2',
          onComplete: () => {
            line.destroy();
            tauntText.destroy();
          },
        });
      }
    }
    
    // Blind effect (smoke grenade)
    if (note === 'blind' && dstId) {
      const dstSlot = this.getActorSlot(dstId);
      if (dstSlot) {
        // Create smoke cloud
        const smokeGraphics = this.add.graphics();
        smokeGraphics.setDepth(90);
        
        // Draw multiple smoke puffs
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const radius = 20 + Math.random() * 25;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const size = 10 + Math.random() * 15;
          
          smokeGraphics.fillStyle(0x888888, 0.6);
          smokeGraphics.fillCircle(x, y, size);
        }
        
        smokeGraphics.setPosition(dstSlot.x, dstSlot.y);
        
        // Blind text indicator
        const blindText = this.add.text(
          dstSlot.x,
          dstSlot.y - 60,
          '💨 BLINDED',
          {
            fontSize: '18px',
            color: '#888888',
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            backgroundColor: '#000000',
            padding: { x: 6, y: 4 },
            stroke: '#222222',
            strokeThickness: 2,
          }
        );
        blindText.setOrigin(0.5);
        blindText.setDepth(100);
        
        // Animate smoke dispersing
        this.tweens.add({
          targets: smokeGraphics,
          scaleX: 2,
          scaleY: 2,
          alpha: 0,
          duration: 1500,
          ease: 'Sine.easeOut',
          onComplete: () => smokeGraphics.destroy(),
        });
        
        // Wobble text
        this.tweens.add({
          targets: blindText,
          x: blindText.x + 5,
          duration: 100,
          yoyo: true,
          repeat: 4,
          ease: 'Sine.easeInOut',
        });
        
        // Fade out text
        this.tweens.add({
          targets: blindText,
          alpha: 0,
          duration: 1000,
          delay: 600,
          ease: 'Power2',
          onComplete: () => blindText.destroy(),
        });
      }
    }
  }

  /**
   * Fire a simple fireball for Fire Shield retaliation (no character animation)
   */
  private fireSimpleFireball(srcSlot: Phaser.GameObjects.Container, dstSlot: Phaser.GameObjects.Container): void {
    // Create fireball sprite with animated frames
    const fireball = this.add.sprite(srcSlot.x, srcSlot.y, 'mage_meteor');
    fireball.setScale(2); // Scale up the fireball
    fireball.setDepth(50); // Above characters but below UI
    
    // Play fireball animation (looping)
    if (this.anims.exists('mage_meteor_anim')) {
      fireball.play('mage_meteor_anim');
    }
    
    // Calculate angle to target
    const angle = Phaser.Math.Angle.Between(srcSlot.x, srcSlot.y, dstSlot.x, dstSlot.y);
    fireball.setRotation(angle);
    
    console.log(`🔥 Fire Shield retaliating: Firing fireball from (${srcSlot.x}, ${srcSlot.y}) to (${dstSlot.x}, ${dstSlot.y})`);
    
    // Tween fireball to target
    this.tweens.add({
      targets: fireball,
      x: dstSlot.x,
      y: dstSlot.y,
      duration: 300, // 300ms to travel
      ease: 'Linear',
      onComplete: () => {
        // Explosion effect - scale up and fade out
        this.tweens.add({
          targets: fireball,
          scaleX: 3,
          scaleY: 3,
          alpha: 0,
          duration: 150,
          onComplete: () => fireball.destroy(),
        });
      },
    });
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
    // Clean up any orphaned text elements before updating UI
    this.cleanupOrphanedTextElements();
    
    // Update stage text (index 0 in hudContainer)
    const stageText = this.hudContainer.getAt(0) as Phaser.GameObjects.Text;
    stageText.setText(`Stage ${this.currentStage}`);
    
    // Update turn text (index 1 in hudContainer)
    const turnText = this.hudContainer.getAt(1) as Phaser.GameObjects.Text;
    turnText.setText(`Turn ${this.currentTurn}`);
    
    // Update phase text (index 2 in hudContainer) - Simple text only
    const phaseText = this.hudContainer.getAt(2) as Phaser.GameObjects.Text;
    if (this.phase === 'planning') {
      phaseText.setText('Planning');
    } else if (this.phase === 'resolving') {
      phaseText.setText('Resolving');
    } else {
      phaseText.setText(''); // Hide for idle phase
    }

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
      // NOTE: The damage value has ALREADY been reduced by shield absorption in combat.ts
      // We just apply the remaining damage directly to HP
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
      
      // Update shield aura if it exists (shield amount may have changed)
      this.updateShieldAuraFromCombatState(targetId);
      
      // Update player stats display if this is the current player
      this.updatePlayerStatsDisplay();
      return;
    }

    const combatEnemy = this.combatState.enemies.find(e => e.id === targetId);
    if (combatEnemy) {
      // NOTE: The damage value has ALREADY been reduced by shield absorption in combat.ts
      // We just apply the remaining damage directly to HP
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
        
        // Grant ultimate power to all party members for kill/assist
        if (this.ultimatePowerManager) {
          this.players.forEach(player => {
            if (player.id && this.ultimatePowerManager) {
              // Everyone gets assist power, could track actual killer for bonus
              this.ultimatePowerManager.onKill(player.id);
              this.updatePowerBar(player.id);
            }
          });
        }
      }
      
      // Update health bar immediately
      this.updateTargetHealthBar(targetId);
      
      // Update shield aura if it exists (shield amount may have changed)
      this.updateShieldAuraFromCombatState(targetId);
      
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
      
      // Update shield aura if it exists (shield amount may have changed)
      this.updateShieldAuraFromCombatState(targetId);
      
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
      
      // Update shield aura if it exists (shield amount may have changed)
      this.updateShieldAuraFromCombatState(targetId);
      
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
    this.combatEndedEarly = false; // Reset flag for new turn
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
    
    // Track which cards are drawn for animation
    let newlyDrawnCards: string[] = [];
    
    // Draw new cards from deck for all players (including turn 1)
    // This happens at START of planning phase, so previous hand has been played
    this.players.forEach(player => {
      const deck = this.playerDecks.get(player.userId || player.id);
      if (deck) {
        // Only draw new cards if this isn't the very first turn
        // (Turn 1 uses the initial hand from createDeck)
        if (this.currentTurn > 1) {
          // DISCARD ALL CARDS FROM HAND FIRST (unused cards from previous turn)
          discardAllCardsFromHand(deck);
          console.log(`[Deck] ${player.name} discarded all cards from previous turn`);
          
          if (player.userId === this.userId) {
            // Current player - with animation
            // Create animation callback for drawing cards (only for current player)
            const onDrawAnimation = (cardId: string, position: number, delay: number) => {
              console.log(`[Deck] Animation callback triggered for ${cardId} at position ${position} with delay ${delay}ms`);
              if (this.handUI) {
                this.handUI.animateDrawCard(cardId, position, delay);
              } else {
                console.warn(`[Deck] HandUI not available for animation callback`);
              }
            };
            
            // Create reshuffle callback to update pile indicators when discard pile is reshuffled
            const onReshuffleCallback = (drawPileSize: number, discardPileSize: number) => {
              console.log(`[Deck] Reshuffle callback: DrawPile=${drawPileSize}, Discard=${discardPileSize}`);
              if (this.handUI) {
                this.handUI.updatePileIndicators(drawPileSize, discardPileSize);
              }
            };
            
            drawCardsAtTurnStart(deck, onDrawAnimation, onReshuffleCallback);
            
            // Track which cards were just drawn (all 4 cards since hand was empty)
            newlyDrawnCards = deck.hand.slice();
            
            console.log(`[Deck] ${player.name} drew cards - Hand: ${deck.hand.length}, DrawPile: ${deck.drawPile.length}, Discard: ${deck.discardPile.length}`);
            console.log(`[Deck] Newly drawn cards:`, newlyDrawnCards);
          } else {
            // Other players - no animation
            drawCardsAtTurnStart(deck);
            console.log(`[Deck] ${player.name} drew cards - Hand: ${deck.hand.length}, DrawPile: ${deck.drawPile.length}, Discard: ${deck.discardPile.length}`);
          }
        }
        
        // Reset reusable item charges for new turn (including turn 1)
        resetReusableCharges(deck);
      }
    });
    
    // Recreate hand UI with current cards for current player
    if (this.userId && this.currentTurn > 1) {
      const myDeck = this.playerDecks.get(this.userId);
      if (myDeck && this.handUI) {
        console.log(`[Deck] ========================================`);
        console.log(`[Deck] TURN ${this.currentTurn} - HAND UI UPDATE`);
        console.log(`[Deck] Current hand (${myDeck.hand.length} cards):`, myDeck.hand);
        console.log(`[Deck] Draw pile remaining: ${myDeck.drawPile.length} cards`);
        console.log(`[Deck] Discard pile: ${myDeck.discardPile.length} cards`);
        console.log(`[Deck] Cards to hide for animation:`, newlyDrawnCards);
        console.log(`[Deck] ========================================`);
        
        // Save ultimate card ID before destroying HandUI
        const savedUltimateCardId = this.handUI.getUltimateCardId();
        console.log(`[Deck] Ultimate card before destroy: ${savedUltimateCardId}`);
        
        this.handUI.destroy();
        this.handUI = new HandUI(
          this,
          myDeck.hand,
          (cardId) => this.selectCard(cardId),
          newlyDrawnCards // Hide newly drawn cards for animation
        );
        
        // Re-add ultimate card if it existed
        if (savedUltimateCardId) {
          console.log(`[Deck] Re-adding ultimate card: ${savedUltimateCardId}`);
          this.handUI.addUltimateCard(savedUltimateCardId);
        }
        
        // Update pile indicators immediately (no delay needed - created immediately in HandUI)
        this.handUI.updatePileIndicators(myDeck.drawPile.length, myDeck.discardPile.length);
      }
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
    // Skip button - Compact and stylish
    const skipButton = this.add.container(957, 669);
    skipButton.setDepth(100);
    skipButton.setSize(140, 36);

    // Smaller, more elegant background with rounded corners
    const bg = this.add.rectangle(0, 0, 140, 36, 0x34495e, 1);
    bg.setStrokeStyle(2, 0x3498db, 0.8);
    skipButton.add(bg);

    const currentAP = this.userId ? (this.playerAP.get(this.players.find(p => p.userId === this.userId)?.id || '') || 0) : 0;
    const text = this.add.text(0, 0, `⏩ Skip | +${currentAP} AP`, {
      fontSize: '13px',
      color: '#ecf0f1',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    skipButton.add(text);

    // Make the container interactive for clicking - tight hit area to prevent overlap with cards
    bg.setInteractive({ useHandCursor: false });
    skipButton.setSize(140, 36);

    bg.on('pointerover', () => {
      bg.setFillStyle(0x3498db, 1);
      bg.setStrokeStyle(2, 0x5dade2, 1);
      text.setColor('#ffffff');
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x34495e, 1);
      bg.setStrokeStyle(2, 0x3498db, 0.8);
      text.setColor('#ecf0f1');
    });

    bg.on('pointerdown', () => {
      this.showPendingActionText(`⏩ Skipping turn - Saving AP for next round!`, '#95a5a6');
      this.time.delayedCall(500, () => {
        this.lockAction();
      });
      skipButton.destroy();
    });

    // Store reference for cleanup
    skipButton.setData('skipButton', true);
  }

  /**
   * Check if combat should end after an ultimate ability
   */
  private checkCombatEndAfterUltimate(): void {
    // Check combat state (which has been updated via applyDamageToActor during hit callbacks)
    // Use combatState instead of local arrays for accurate HP values
    const allEnemiesDead = this.combatState.enemies.every(e => e.hp <= 0);
    const allPlayersDead = this.combatState.party.every(p => p.hp <= 0);
    
    console.log('[Ultimate] Checking combat end...');
    console.log('[Ultimate] Enemies HP:', this.combatState.enemies.map(e => `${e.name}: ${e.hp}/${e.maxHp}`));
    console.log('[Ultimate] Players HP:', this.combatState.party.map(p => `${p.name}: ${p.hp}/${p.maxHp}`));
    
    if (allEnemiesDead) {
      console.log('🎉 All enemies defeated by ultimate! Victory!');
      // Set flag to prevent normal timeline completion from interfering
      this.combatEndedEarly = true;
      // Clear timeline to prevent normal combat end check
      this.timeline = null;
      this.pendingPostState = null;
      
      this.time.delayedCall(1000, () => {
        this.endCombat('victory');
      });
    } else if (allPlayersDead) {
      console.log('💀 All players defeated! Defeat!');
      // Set flag to prevent normal timeline completion from interfering
      this.combatEndedEarly = true;
      // Clear timeline to prevent normal combat end check
      this.timeline = null;
      this.pendingPostState = null;
      
      this.time.delayedCall(1000, () => {
        this.endCombat('defeat');
      });
    } else {
      console.log('[Ultimate] Combat continues - some actors still alive');
    }
  }

  /**
   * Clean up dead enemies - hide all dead enemies except flying demons
   */
  private cleanupDeadEnemies(): void {
    console.log('🧹 Cleaning up dead enemies...');
    
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) {
        const enemySlot = this.getActorSlot(enemy.id);
        if (enemySlot) {
          const enemyType = this.getEnemyType(enemy.name);
          
          // Hide all dead enemies except flying demons (they already fade out)
          if (enemyType !== 'FlyingDemon') {
            console.log(`🧹 Hiding dead ${enemyType} at battle end`);
            enemySlot.setVisible(false);
          }
        }
      }
    }
  }

  private endCombat(result: 'victory' | 'defeat'): void {
    // Prevent duplicate calls
    if (this.combatEnded) {
      console.log(`⚠️ endCombat already called, ignoring duplicate call for ${result}`);
      return;
    }
    this.combatEnded = true;
    
    console.log(`Combat ended: ${result} (Stage ${this.currentStage})`);
    
    // Clean up dead enemies - hide all dead enemies except flying demons
    this.cleanupDeadEnemies();
    
    // Show result banner
    if (result === 'victory') {
      // Fade out battle music and play victory sound
      if (this.soundManager) {
        console.log('Victory - fading out battle music and playing victory sound');
        this.soundManager.fadeOutMusic(500); // Fade out over 500ms
        
        // Play victory sound after a short delay
        this.time.delayedCall(300, () => {
          if (this.soundManager) {
            this.soundManager.playSfx('sfx_victory', { volume: 0.4 });
          }
        });
      }
      
      // Display victory image (1024x1024, scaled to 250x250, positioned higher)
      const victoryImage = this.add.image(
        this.scale.width / 2,
        this.scale.height / 2 - 100, // Move up 100 pixels
        'victory'
      );
      victoryImage.setDisplaySize(250, 250);
      victoryImage.setDepth(1000); // Ensure it's on top
      
      // Add a subtle scale-in animation
      victoryImage.setScale(0);
      this.tweens.add({
        targets: victoryImage,
        scale: 250 / 1024, // Scale from 1024x1024 to 250x250
        duration: 500,
        ease: 'Back.easeOut',
      });
    } else {
      // Defeat banner (keep original style)
      const banner = this.add.rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        400,
        100,
        0xe74c3c,
        0.9
      );
      banner.setStrokeStyle(3, 0xffffff, 0.8);

      const bannerText = this.add.text(
        this.scale.width / 2,
        this.scale.height / 2,
        'DEFEAT!',
        {
          fontSize: '36px',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        }
      );
      bannerText.setOrigin(0.5);
    }

    // Return to map or lobby after delay
    this.time.delayedCall(3000, () => {
      if (result === 'victory') {
        // Note: Victory sound continues playing through loot scene and fades out in map scene
        
        // Save ultimate power state for next battle (carries over between stages)
        if (this.ultimatePowerManager) {
          destroyUltimatePowerManager(true); // Save power on victory
          this.ultimatePowerManager = null;
          console.log('💾 Ultimate power saved for next battle!');
        }
        
        // Calculate gold reward based on stage
        const goldReward = this.calculateGoldReward(this.currentStage);
        
        // Check if this is stage 6 (boss fight) - transition to world2 and reset progress
        const isBossDefeated = this.currentStage === 6 && this.worldKey === 'world1';
        const nextWorld = isBossDefeated ? 'world2' : this.worldKey;
        const resetProgress = isBossDefeated;
        
        console.log(`🌍 Boss defeated: ${isBossDefeated}, transitioning to ${nextWorld}`);
        
        // Transition to loot scene to show rewards and card selection
        this.scene.start('LootScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.mapSeed || (Date.now() % 2147483647), // Keep within PostgreSQL integer range
          visitedNodes: isBossDefeated ? [] : this.visitedNodes, // Reset visited nodes for new world
          currentNodeId: isBossDefeated ? undefined : this.currentNodeId, // Reset position for new world
          stage: isBossDefeated ? 0 : this.currentStage, // Reset stage for new world
          goldReward: goldReward, // Pass calculated gold reward
          battleBackground: this.battleBackgroundKey, // Pass background for continuity
          world: this.worldKey, // Pass world for transition detection
        });
      } else {
        // Return to lobby on defeat - DON'T save ultimate power (fresh start)
        if (this.ultimatePowerManager) {
          destroyUltimatePowerManager(false); // Don't save power on defeat
          this.ultimatePowerManager = null;
          console.log('❌ Ultimate power cleared (defeat)');
        }
        this.scene.start('Lobby');
      }
    });
  }

  /**
   * Calculate gold reward based on stage difficulty
   */
  private calculateGoldReward(stage: number): number {
    // Base gold: 50
    // +10 per stage
    // +random variance (0-20)
    const baseGold = 50;
    const stageBonus = stage * 10;
    const variance = Math.floor(Math.random() * 21); // 0-20
    
    const totalGold = baseGold + stageBonus + variance;
    console.log(`[Battle] Gold reward for stage ${stage}: ${totalGold} (base: ${baseGold}, stage bonus: ${stageBonus}, variance: ${variance})`);
    
    return totalGold;
  }

  // UI Helper Methods
  private updateQueueDisplay(): void {
    // Remove old queue display
    if (this.queueDisplay) {
      this.queueDisplay.destroy();
      this.queueDisplay = null;
    }

    if (this.queuedActions.length === 0) return;

    // Create queue display at top of screen
    const centerX = this.scale.width / 2;
    const y = 80; // Top of screen

    this.queueDisplay = this.add.container(centerX, y);
    this.queueDisplay.setDepth(900);

    // Calculate spacing for card images
    const cardImageWidth = 45; // Smaller card image width
    const cardImageHeight = 68; // Smaller card image height (2:3 aspect ratio)
    const spacing = 15; // Space between cards
    const plusWidth = 25; // Width for "+" symbol
    
    // Calculate total width needed
    const totalWidth = (this.queuedActions.length * cardImageWidth) + 
                      ((this.queuedActions.length - 1) * (spacing + plusWidth));
    
    // Start position (left edge)
    const startX = -totalWidth / 2;

    // Create card images with "+" between them
    this.queuedActions.forEach((action, index) => {
      const card = getCardById(action.cardId || '');
      if (!card) return;

      // Calculate position for this card
      const cardX = startX + (index * (cardImageWidth + spacing + plusWidth)) + (cardImageWidth / 2);
      
      // Create card image
      const imageKey = `card_${card.type}`;
      const cardImage = this.add.image(cardX, 0, imageKey);
      cardImage.setDisplaySize(cardImageWidth, cardImageHeight);
      
      // Add card name text on the card
      const cardNameText = this.add.text(cardX, 0, card.name, {
        fontSize: '10px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
        wordWrap: { width: cardImageWidth - 6 }
      });
      cardNameText.setOrigin(0.5);
      
      // Make card image clickable to remove from queue
      cardImage.setInteractive({ useHandCursor: true });
      
      // Hover effects
      cardImage.on('pointerover', () => {
        cardImage.setTint(0xff6666); // Red tint on hover
        cardNameText.setText('✖ Remove');
      });
      
      cardImage.on('pointerout', () => {
        cardImage.clearTint(); // Remove tint
        cardNameText.setText(card.name);
      });
      
      // Click to remove from queue
      cardImage.on('pointerdown', () => {
        this.removeFromQueue(index);
      });
      
      if (this.queueDisplay) {
        this.queueDisplay.add(cardImage);
        this.queueDisplay.add(cardNameText);
      }

      // Add "+" symbol between cards (not after the last one)
      if (index < this.queuedActions.length - 1) {
        const plusX = cardX + (cardImageWidth / 2) + (spacing / 2) + (plusWidth / 2);
        const plusText = this.add.text(plusX, 0, '+', {
          fontSize: '32px',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        });
        plusText.setOrigin(0.5);
        if (this.queueDisplay) {
          this.queueDisplay.add(plusText);
        }
      }
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

    // Hide lock button if no cards queued
    if (this.queuedActions.length === 0) {
      this.hideLockButton();
      this.hidePendingActionText();
    }
  }

  /**
   * Animate cards disappearing from queue as they are played
   */
  private animateQueueCardRemoval(cardIndex: number, delayMs: number = 0): void {
    if (!this.queueDisplay || cardIndex >= this.queuedActions.length) return;

    this.time.delayedCall(delayMs, () => {
      // Find the card container at the specified index
      const cardContainers = this.queueDisplay!.list.filter(child => 
        child instanceof Phaser.GameObjects.Image && child.texture.key.startsWith('card_')
      ) as Phaser.GameObjects.Image[];

      if (cardIndex < cardContainers.length) {
        const cardImage = cardContainers[cardIndex];
        
        // Animate card disappearing
        this.tweens.add({
          targets: cardImage,
          alpha: 0,
          scaleX: 0,
          scaleY: 0,
          duration: 300,
          ease: 'Power2.easeIn',
          onComplete: () => {
            // Remove the card from queue
            this.queuedActions.splice(cardIndex, 1);
            
            // Update the queue display to shift remaining cards
            this.updateQueueDisplay();
          }
        });
      }
    });
  }

  private showLockButton(): void {
    this.hideLockButton();

    // Position button just above the player's hand
    this.lockButton = this.add.container(this.scale.width / 2, this.scale.height - 250);

    // Use custom button image (1536x1024, scaled down)
    const buttonImage = this.add.image(0, 0, 'lock_button');
    buttonImage.setDisplaySize(120, 80); // Scale down from 1536x1024 to 120x80
    buttonImage.setInteractive({ useHandCursor: true });
    this.lockButton.add(buttonImage);

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

    buttonImage.on('pointerover', () => {
      buttonImage.setTint(0xcccccc); // Slight tint on hover
    });

    buttonImage.on('pointerout', () => {
      buttonImage.clearTint(); // Remove tint
    });

    buttonImage.on('pointerdown', () => {
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

    // DISABLED TO FIX GREY BOX ISSUE - No more pending action text
    console.log(`[BattleScene] Pending action text disabled: ${text}`);
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
    bg.setInteractive({ useHandCursor: false });
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

  /**
   * Create debug button to fill ultimate bar (for testing)
   */
  private createDebugUltimateButton(): void {
    const x = this.scale.width - 120;
    const y = 80;
    
    const container = this.add.container(x, y);
    
    // Background
    const bg = this.add.rectangle(0, 0, 100, 40, 0xff00ff, 0.8);
    bg.setStrokeStyle(2, 0xffffff, 1);
    bg.setInteractive({ useHandCursor: false });
    container.add(bg);
    
    // Text
    const text = this.add.text(0, 0, 'DEBUG:\nFill ULT', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: 'bold',
      align: 'center',
    });
    text.setOrigin(0.5);
    container.add(text);
    
    // Hover effects
    bg.on('pointerover', () => {
      bg.setFillStyle(0xff44ff, 1);
      container.setScale(1.1);
    });
    
    bg.on('pointerout', () => {
      bg.setFillStyle(0xff00ff, 0.8);
      container.setScale(1);
    });
    
    // Click handler
    bg.on('pointerdown', () => {
      if (!this.userId || !this.ultimatePowerManager) return;
      
      // Find current player
      const playerActor = this.players.find(p => p.userId === this.userId);
      if (!playerActor || !playerActor.id) return;
      
      // Fill ultimate to 100%
      const currentPower = this.ultimatePowerManager.getPower(playerActor.id);
      const powerToAdd = 100 - currentPower;
      
      if (powerToAdd > 0) {
        this.ultimatePowerManager.addPower(playerActor.id, powerToAdd, 'debug');
        this.updatePowerBar(playerActor.id);
        
        // Flash effect
        this.tweens.add({
          targets: container,
          scale: 1.3,
          duration: 100,
          yoyo: true,
          ease: 'Back.easeOut',
        });
        
        console.log(`🔧 DEBUG: Filled ${playerActor.name}'s ultimate to 100%`);
      }
    });
    
    this.debugUltimateButton = container;
  }

  /**
   * Create debug button to skip +1 level (for testing)
   */
  private createDebugSkipLevelButton(): void {
    const x = this.scale.width - 120;
    const y = 130;
    
    const container = this.add.container(x, y);
    
    // Background
    const bg = this.add.rectangle(0, 0, 100, 40, 0x00ff00, 0.8);
    bg.setStrokeStyle(2, 0xffffff, 1);
    bg.setInteractive({ useHandCursor: false });
    container.add(bg);
    
    // Text
    const text = this.add.text(0, 0, 'DEBUG:\n+1 Level', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: 'bold',
      align: 'center',
    });
    text.setOrigin(0.5);
    container.add(text);
    
    // Hover effects
    bg.on('pointerover', () => {
      bg.setFillStyle(0x44ff44, 1);
      container.setScale(1.1);
    });
    
    bg.on('pointerout', () => {
      bg.setFillStyle(0x00ff00, 0.8);
      container.setScale(1);
    });
    
    // Click handler - instantly win current battle and advance to next stage
    bg.on('pointerdown', () => {
      if (!this.isHost) {
        console.log('⚠️ Only host can skip levels');
        return;
      }
      
      console.log(`🔧 DEBUG: Skipping to Stage ${this.currentStage + 1}`);
      
      // Flash effect
      this.tweens.add({
        targets: container,
        scale: 1.3,
        duration: 100,
        yoyo: true,
        ease: 'Back.easeOut',
      });
      
      // Send debug skip message to sync all players
      if (this.lobbyId) {
        sendDebugSkip(this.lobbyId, 'next').catch(err => {
          console.error('Failed to send debug skip:', err);
        });
      }
    });
    
    this.debugSkipLevelButton = container;
  }

  /**
   * Create debug button to skip to boss of current world (for testing)
   */
  private createDebugSkipToBossButton(): void {
    const x = this.scale.width - 120;
    const y = 180;
    
    const container = this.add.container(x, y);
    
    // Background
    const bg = this.add.rectangle(0, 0, 100, 40, 0xff9900, 0.8);
    bg.setStrokeStyle(2, 0xffffff, 1);
    bg.setInteractive({ useHandCursor: false });
    container.add(bg);
    
    // Text
    const text = this.add.text(0, 0, 'DEBUG:\nTO BOSS', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: 'bold',
      align: 'center',
    });
    text.setOrigin(0.5);
    container.add(text);
    
    // Hover effects
    bg.on('pointerover', () => {
      bg.setFillStyle(0xffbb44, 1);
      container.setScale(1.1);
    });
    
    bg.on('pointerout', () => {
      bg.setFillStyle(0xff9900, 0.8);
      container.setScale(1);
    });
    
    // Click handler - skip directly to stage 6 (Minotaur Boss)
    bg.on('pointerdown', () => {
      if (!this.isHost) {
        console.log('⚠️ Only host can skip to boss');
        return;
      }
      
      const bossStage = 6;
      console.log(`🔧 DEBUG: Skipping to Boss Fight (Stage ${bossStage})`);
      
      // Flash effect
      this.tweens.add({
        targets: container,
        scale: 1.3,
        duration: 100,
        yoyo: true,
        ease: 'Back.easeOut',
      });
      
      // Send debug skip message to sync all players
      if (this.lobbyId) {
        sendDebugSkip(this.lobbyId, 'boss').catch(err => {
          console.error('Failed to send debug skip:', err);
        });
      }
    });
    
    this.debugSkipToBossButton = container;
  }

  /**
   * Update a player's ultimate power bar visually
   */
  private updatePowerBar(actorId: ActorId): void {
    if (!this.ultimatePowerManager) return;
    
    const powerBar = this.powerBars.get(actorId);
    const powerState = this.ultimatePowerManager.getPowerState(actorId);
    
    if (powerBar && powerState) {
      const wasPreviouslyReady = powerBar.getContainer().getData('wasReady') || false;
      const isNowReady = powerState.isReady;
      
      powerBar.updatePower(powerState.power, powerState);
      
      // Trigger cinematic effect when ultimate becomes ready
      if (!wasPreviouslyReady && isNowReady) {
        powerBar.triggerReadyEffect();
        powerBar.getContainer().setData('wasReady', true);
        
        // Play ultimate ready sound
        if (this.soundManager) {
          // TODO: Add ultimate ready sound effect
          console.log(`🔥 ${actorId} ULTIMATE READY! Playing sound...`);
        }
        
        // Add ultimate card to hand if this is the current player
        const actor = this.players.find(p => p.id === actorId);
        console.log(`[Ultimate] Checking if should add card: actor=${actor?.name}, userId match=${actor?.userId === this.userId}, handUI exists=${!!this.handUI}`);
        
        if (actor && actor.userId === this.userId && this.handUI) {
          const battleActor = actor as BattleActor;
          const characterClass = battleActor.selectedClass;
          console.log(`[Ultimate] Character class: ${characterClass}`);
          
          // Get the appropriate ultimate card for this class
          if (characterClass === 'Huntress') {
            console.log(`[Ultimate] Attempting to add Rain of Arrows...`);
            this.handUI.addUltimateCard('RainOfArrows');
            console.log(`✨ Added Rain of Arrows to ${actor.name}'s hand!`);
          } else if (characterClass === 'Mage') {
            console.log(`[Ultimate] Attempting to add Meteor...`);
            this.handUI.addUltimateCard('Meteor');
            console.log(`✨ Added Meteor to ${actor.name}'s hand!`);
          } else if (characterClass === 'Warrior') {
            console.log(`[Ultimate] Attempting to add Berserk Rage...`);
            this.handUI.addUltimateCard('BerserkRage');
            console.log(`✨ Added Berserk Rage to ${actor.name}'s hand!`);
          } else {
            console.warn(`[Ultimate] Unknown class: ${characterClass}`);
          }
        } else {
          console.log(`[Ultimate] Not adding card - conditions not met`);
        }
      }
      
      // Reset the wasReady flag if power drops below 100
      if (wasPreviouslyReady && !isNowReady) {
        powerBar.getContainer().setData('wasReady', false);
        
        // Remove ultimate card from hand if this is the current player
        const actor = this.players.find(p => p.id === actorId);
        if (actor && actor.userId === this.userId && this.handUI) {
          this.handUI.removeUltimateCard();
          console.log(`Removed ultimate card from ${actor.name}'s hand`);
        }
      }
    }
  }

  update(): void {
    // Update animation timeline
    if (this.timeline) {
      if (this.timeline.isActive()) {
        this.timeline.update();
        
        if (!this.timeline.isActive()) {
          console.log('Timeline complete - checking for combat end');
          
          // Skip normal completion if combat ended early via ultimate
          if (this.combatEndedEarly) {
            console.log('Combat already ended via ultimate - skipping normal completion');
            this.timeline = null;
            return;
          }
          
          // Verify synchronization with pendingPostState (damage was already applied during animations)
          if (this.pendingPostState) {
            console.log('Verifying combat state synchronization...');
            console.log('Current combat state:', this.combatState);
            console.log('Expected post state:', this.pendingPostState);
            
            // Check if there are any discrepancies (this should not happen if damage was applied correctly)
            let needsReconciliation = false;
            this.pendingPostState.forEach(expectedActor => {
              const currentActor = this.combatState.party.find(a => a.id === expectedActor.id) ||
                                   this.combatState.enemies.find(a => a.id === expectedActor.id);
              if (currentActor && currentActor.hp !== expectedActor.hp) {
                console.warn(`⚠️ HP mismatch for ${currentActor.name}: current=${currentActor.hp}, expected=${expectedActor.hp}`);
                
                // Only reconcile if expected HP is LOWER (more damage to apply)
                // Never restore health by reconciling to a HIGHER HP value
                if (expectedActor.hp < currentActor.hp) {
                  console.warn(`   → Will reconcile: expected HP (${expectedActor.hp}) < current HP (${currentActor.hp})`);
                  needsReconciliation = true;
                } else {
                  console.warn(`   → Skipping reconciliation: expected HP (${expectedActor.hp}) >= current HP (${currentActor.hp}) - would restore health!`);
                }
              }
            });
            
            // Only reconcile if needed (safety net)
            if (needsReconciliation) {
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

    // Apply same offset as local cursor (match setupCustomCursor offset)
    const cursorOffsetX = 10;
    const cursorOffsetY = 15;

    // Update position with smooth interpolation and apply offset
    this.tweens.add({
      targets: cursorContainer,
      x: cursor.x + cursorOffsetX,
      y: cursor.y + cursorOffsetY,
      duration: this.CURSOR_THROTTLE_MS,
      ease: 'Linear',
    });
  }

  private handleDebugSkip(skipType: 'next' | 'boss'): void {
    console.log(`🔧 DEBUG SKIP RECEIVED: ${skipType}`);
    
    if (skipType === 'boss') {
      // Skip to boss stage
      const bossStage = 6;
      console.log(`Setting stage to ${bossStage - 1} to make next battle the boss`);
      this.currentStage = bossStage - 1;
    }
    // For 'next', just end combat normally (stage increments naturally)
    
    // End combat as victory for all players
    this.endCombat('victory');
  }

  private createRemoteCursor(userId: string, userName?: string, color?: string): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    container.setDepth(1000); // Always on top

    // RPG cursor image - match local cursor size and offset
    const cursorImage = this.add.image(0, 0, 'rpg_cursor');
    cursorImage.setScale(0.08); // Scale down from 500x500 to 40x40 (match local cursor)
    cursorImage.setOrigin(0.5); // Center the cursor on the pointer position
    
    // Apply color tint to cursor
    const cursorColor = color ? parseInt(color.replace('#', ''), 16) : this.getPlayerColorHex(userId);
    cursorImage.setTint(cursorColor);
    
    container.add(cursorImage);

    // Username label - adjust position for smaller cursor
    if (userName) {
      const nameText = this.add.text(25, 0, userName, {
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

    // Cast to a type that has position properties
    const positionedElement = element as any;
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;

    let newX = positionedElement.x;
    let newY = positionedElement.y;

    // Check horizontal bounds
    if (positionedElement.x < margin) {
      newX = margin;
    } else if (positionedElement.x > viewportWidth - margin) {
      newX = viewportWidth - margin;
    }

    // Check vertical bounds
    if (positionedElement.y < margin) {
      newY = margin;
    } else if (positionedElement.y > viewportHeight - margin) {
      newY = viewportHeight - margin;
    }

    // Apply corrections if needed
    if (newX !== positionedElement.x || newY !== positionedElement.y) {
      positionedElement.setPosition(newX, newY);
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
      
      // Update title position above the box
      const logTitle = this.children.getByName('logTitle') as Phaser.GameObjects.Text;
      if (logTitle) {
        logTitle.setPosition(logX, logY - 25);
      }
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
    const logWidth = 220;
    
    // Position button at top-right of log (relative to log container)
    const buttonX = logWidth - 10; // 10px from right edge
    const buttonY = 10; // 10px from top

    this.logExpandButton = this.add.container(buttonX, buttonY);
    this.logExpandButton.setDepth(1000);

    // Button background with relative positioning (0, 0 within container)
    const bg = this.add.rectangle(0, 0, buttonSize, buttonSize, 0x4a90e2, 0.8);
    bg.setStrokeStyle(1, 0xffffff, 0.5);
    bg.setInteractive({ useHandCursor: false });
    bg.setName('bg');

    // Arrow icon (down/up) with relative positioning
    const arrow = this.add.text(0, 0, '▼', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    arrow.setOrigin(0.5);
    arrow.setName('arrow');

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

    // Add elements to the button container
    this.logExpandButton.add([bg, arrow]);
    
    // Add button container to log container
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
    
    // Update title position above the box
    const logTitle = this.children.getByName('logTitle') as Phaser.GameObjects.Text;
    if (logTitle) {
      logTitle.setPosition(logX, logY - 25);
    }

    // Update button position to stay at top-right corner
    if (this.logExpandButton) {
      const buttonX = logWidth - 10; // 10px from right edge
      const buttonY = 10; // 10px from top
      this.logExpandButton.setPosition(buttonX, buttonY);
      
      // Update arrow icon
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

    const startY = 5; // Lower start since title is now outside the box
    const entrySpacing = this.isLogExpanded ? 5 : 6; // More spacing to avoid overlap when collapsed
    const logHeight = this.isLogExpanded ? 300 : 80;
    const visibleHeight = logHeight - 10; // Height available for entries (title is outside, only need space for scroll indicator)

    // DON'T remove entries from container - just reposition and toggle visibility
    // Calculate total height of all entries
    let totalContentHeight = 0;
    this.combatLogEntries.forEach(entry => {
      if (entry && entry.scene === this) {
        totalContentHeight += entry.height + entrySpacing;
      }
    });

    // Calculate max scroll offset
    this.maxLogScrollOffset = Math.max(0, totalContentHeight - visibleHeight);
    
    // Clamp scroll offset
    this.logScrollOffset = Math.max(0, Math.min(this.logScrollOffset, this.maxLogScrollOffset));

    // Position entries with scroll offset applied
    let currentY = startY - this.logScrollOffset;
    
    this.combatLogEntries.forEach((entry, index) => {
      // Safety check: ensure entry is valid and from this scene
      if (!entry || entry.scene !== this) {
        console.warn('Skipping invalid log entry from old scene');
        return;
      }
      
      const entryHeight = entry.height;
      
      // Add to container if not already there (only for new entries)
      if (!this.combatLogContainer!.list.includes(entry)) {
        this.combatLogContainer!.add(entry);
      }
      
      // Only show entries that are visible in the viewport
      // Clamp to stay within the box bounds (startY to visibleHeight)
      if (currentY >= startY && currentY <= visibleHeight) {
        entry.setVisible(true);
        entry.setPosition(10, currentY);
        
        // Fade based on position (newer = more opaque)
        const alpha = 0.4 + (index / this.combatLogEntries.length) * 0.6;
        entry.setAlpha(Math.max(0.4, Math.min(1, alpha)));
      } else {
        // Hide entries outside viewport
        entry.setVisible(false);
      }
      
      currentY += entryHeight + entrySpacing;
    });

  }

  private handleLogScroll(deltaY: number): void {
    // Scroll up = negative deltaY, scroll down = positive deltaY
    const scrollSpeed = 20;
    this.logScrollOffset += deltaY * scrollSpeed * 0.01;
    
    // Clamp scroll offset
    this.logScrollOffset = Math.max(0, Math.min(this.logScrollOffset, this.maxLogScrollOffset));
    
    // Refresh display with new scroll position
    this.refreshLogEntries();
  }

  private addCombatLogEntry(message: string, color: string = '#ffffff'): void {
    if (!this.combatLogContainer) return;

    // Create entry WITHOUT adding to world; add to container only in refresh
    const entry = this.make.text({
      x: 0,
      y: 0,
      text: `• ${message}`,
      style: {
        fontSize: '11px',
        color,
        fontFamily: 'Arial, sans-serif',
        wordWrap: { width: 195 },
        align: 'left',
        lineSpacing: 4,
      },
      add: false,
    });
    entry.setOrigin(0, 0);

    this.combatLogEntries.push(entry);
    this.logScrollOffset = 999999; // scroll to bottom
    this.refreshLogEntries();

    entry.setAlpha(1);
    this.tweens.add({ targets: entry, scaleX: 1.02, scaleY: 1.02, duration: 100, yoyo: true, ease: 'Back.easeOut' });
  }

  private clearCombatLog(): void {
    // Destroy all log entries
    this.combatLogEntries.forEach(entry => {
      if (entry && entry.scene === this) {
        entry.destroy();
      }
    });
    
    // Clear the array
    this.combatLogEntries = [];
    
    // Reset scroll offset
    this.logScrollOffset = 0;
    this.maxLogScrollOffset = 0;
    
    // Refresh display
    if (this.combatLogContainer) {
      this.refreshLogEntries();
    }
    
    console.log('Combat log cleared for new stage');
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
    console.log('[BattleScene] Shutting down and cleaning up...');
    
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
    
    // CRITICAL: Destroy all party and enemy slots to prevent stacking in next battle
    console.log(`🗑️ Shutdown: Destroying ${this.partySlots.length} party slots and ${this.enemySlots.length} enemy slots...`);
    for (const slot of this.partySlots) {
      if (slot) slot.destroy();
    }
    for (const slot of this.enemySlots) {
      if (slot) slot.destroy();
    }
    for (const button of this.actionButtons) {
      if (button) button.destroy();
    }
    this.partySlots = [];
    this.enemySlots = [];
    this.actionButtons = [];
    
    // Clean up queue display
    if (this.queueDisplay) {
      this.queueDisplay.destroy();
      this.queueDisplay = null;
    }
    
    // Clean up hand UI
    if (this.handUI) {
      this.handUI.destroy();
      this.handUI = null;
    }
    
    // Clean up status effect containers
    for (const container of this.statusEffectContainers.values()) {
      if (container) container.destroy();
    }
    this.statusEffectContainers.clear();
    
    // Clean up skip button if exists
    const skipButtons = this.children.list.filter((obj: any) => obj.getData && obj.getData('skipButton'));
    skipButtons.forEach(btn => btn.destroy());
    
    // Clean up remote cursors
    this.remoteCursors.forEach(cursor => cursor.destroy());
    this.remoteCursors.clear();
    
    console.log('[BattleScene] Cleanup complete');
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
    
    // Clean up ultimate power system (don't save - already handled in endCombat)
    if (this.ultimatePowerManager) {
      this.ultimatePowerManager.resetAll();
      destroyUltimatePowerManager(false); // Don't save in generic cleanup
      this.ultimatePowerManager = null;
    }
    this.powerBars.forEach(bar => bar.destroy());
    this.powerBars.clear();
    
    // Clean up debug button
    if (this.debugUltimateButton) {
      this.debugUltimateButton.destroy();
      this.debugUltimateButton = null;
    }
    
    // Clean up shield auras
    this.shieldAuras.forEach(aura => {
      if (aura.pulseAnim) aura.pulseAnim.stop();
      if (aura.rotateAnim) aura.rotateAnim.stop();
      aura.container.destroy();
    });
    this.shieldAuras.clear();
    
    // Clean up UI elements
    this.remoteCursors.forEach(cursor => cursor.destroy());
    this.actionButtons.forEach(button => button.destroy());
    if (this.hudContainer) this.hudContainer.destroy();
    if (this.combatLogContainer) this.combatLogContainer.destroy();
    
    // Scene cleanup is handled by Phaser automatically
  }
}