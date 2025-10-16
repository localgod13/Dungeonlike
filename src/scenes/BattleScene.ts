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

/**
 * Side-view battle scene with deterministic combat pipeline
 */

// Extended Actor type for BattleScene that includes userId
interface BattleActor extends Actor {
  userId?: string;
  isHost?: boolean;
}

export class BattleScene extends Phaser.Scene {
  private lobbyId: string | null = null;
  private userId: string | null = null;
  private isHost = false;
  private unsubscribe: (() => void) | null = null;

  // Combat state
  private combatState: CombatState;
  private currentTurn = 1;
  private phase: 'planning' | 'resolving' | 'idle' = 'planning';
  private playerPlans = new Map<ActorId, ActionPlan>();
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

  // Cursor tracking
  private remoteCursors = new Map<string, Phaser.GameObjects.Container>();
  private cursorThrottle = 0;
  private readonly CURSOR_THROTTLE_MS = 50; // Send cursor updates every 50ms max

  // Combat log
  private combatLogContainer: Phaser.GameObjects.Container | null = null;
  private combatLogEntries: Phaser.GameObjects.Text[] = [];
  private readonly MAX_LOG_ENTRIES = 4;

  constructor() {
    super('BattleScene');
  }

  init(data: { lobbyId: string; players: any[]; loadouts?: Loadout[] }): void {
    this.lobbyId = data.lobbyId;
    this.players = data.players || [];
    
    console.log('=== BATTLE SCENE INIT DEBUG ===');
    console.log('Received data:', data);
    console.log('Loadouts in data:', data.loadouts);
    
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

    // Create initial enemies
    this.enemies = [
      {
        id: 'enemy_1',
        side: 'enemy',
        name: 'Shadow Beast',
        hp: 50,
        maxHp: 50,
        ap: 5,
      },
    ];

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

    // Set background
    this.cameras.main.setBackgroundColor('#0d0d0d');

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

    // Create party slots (left side)
    for (let i = 0; i < 3; i++) {
      const player = this.players[i];
      const slot = this.createPartySlot(
        centerX - 200 + i * 100,
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
    player: Actor | undefined
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Slot background
    const bg = this.add.rectangle(0, 0, 80, 120, 0x1a1a1a, 0.8);
    bg.setStrokeStyle(2, 0xffffff, 0.8);
    container.add(bg);

    if (player) {
      // Player avatar (simple robed figure)
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

      // Player name
      const nameText = this.add.text(0, 50, player.name, {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
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
    } else {
      // Empty slot
      const emptyText = this.add.text(0, 0, 'Empty', {
        fontSize: '14px',
        color: '#666666',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'italic',
      });
      emptyText.setOrigin(0.5);
      container.add(emptyText);
    }

    return container;
  }

  private createEnemySlot(x: number, y: number, enemy: Actor): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Enemy background
    const bg = this.add.rectangle(0, 0, 100, 140, 0x2a1a1a, 0.8);
    bg.setStrokeStyle(2, 0xff4444, 0.8);
    container.add(bg);

    // Enemy silhouette
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

    return container;
  }

  private createHUD(): void {
    this.hudContainer = this.add.container(0, 0);

    // Top HUD background
    const topBg = this.add.rectangle(
      this.scale.width / 2,
      30,
      this.scale.width,
      60,
      0x1a1a1a,
      0.9
    );
    this.hudContainer.add(topBg);

    // Combat log panel (top left corner with proper bounds)
    const logWidth = 250;
    const logHeight = 150;
    const logX = 10; // Small margin from left edge
    const logY = 80;
    
    this.combatLogContainer = this.add.container(logX, logY);
    this.combatLogContainer.setDepth(10);

    // Combat log background with proper sizing
    const logBg = this.add.rectangle(logWidth / 2, logHeight / 2, logWidth, logHeight, 0x1a1a2e, 0.9);
    logBg.setStrokeStyle(1, 0x4a90e2, 0.6);
    this.combatLogContainer.add(logBg);

    // Combat log title positioned within bounds
    const logTitle = this.add.text(10, 10, 'Log', {
      fontSize: '14px',
      color: '#4a90e2',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    logTitle.setOrigin(0, 0);
    this.combatLogContainer.add(logTitle);

    // Add initial message
    this.addCombatLogEntry('Battle begins!', '#4a90e2');

    // Turn indicator (top right)
    const turnText = this.add.text(this.scale.width - 20, 20, `Turn ${this.currentTurn}`, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    turnText.setOrigin(1, 0);
    this.hudContainer.add(turnText);

    // Phase indicator (top left)
    const phaseText = this.add.text(
      20,
      20,
      'Planning',
      {
        fontSize: '20px',
        color: '#4a90e2',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      }
    );
    phaseText.setOrigin(0, 0);
    this.hudContainer.add(phaseText);

    // Bottom left HUD with proper positioning and sizing
    const statsWidth = 220;
    const statsHeight = 80;
    const statsX = 10; // Small margin from left edge
    const statsY = this.scale.height - statsHeight - 10; // Small margin from bottom edge
    
    const bottomLeftBg = this.add.rectangle(statsX + statsWidth / 2, statsY + statsHeight / 2, statsWidth, statsHeight, 0x1a1a1a, 0.9);
    bottomLeftBg.setStrokeStyle(1, 0x4a90e2, 0.6);
    this.hudContainer.add(bottomLeftBg);

    const hpText = this.add.text(statsX + 10, statsY + 15, 'HP: 100%', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.hudContainer.add(hpText);

    const levelText = this.add.text(statsX + 10, statsY + 35, 'Level: 1', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.hudContainer.add(levelText);

    const apText = this.add.text(statsX + 10, statsY + 55, 'AP: 5', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    this.hudContainer.add(apText);
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
      return;
    }

    this.selectedCardId = cardId;
    this.selectedAction = 'Card'; // Set action type to Card
    this.selectedTarget = null;

    // Show target selector if card requires target
    if (requiresTarget(card)) {
      this.showTargetSelector(card.target);
    } else {
      // No target needed, can lock immediately
      this.showLockButton();
    }
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
          
          const actionText = this.selectedAction === 'Card' && this.selectedCardId 
            ? getCardById(this.selectedCardId)?.name 
            : this.selectedAction;
          this.showPendingActionText(`${actionText} → ${target.name} - Ready to lock!`);
          this.showLockButton();
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
      this.hidePendingActionText();
      this.clearButtonHighlights();
    });
  }

  private hideTargetSelector(): void {
    if (this.targetSelector) {
      this.targetSelector.destroy();
      this.targetSelector = null;
    }
  }

  private async lockAction(): Promise<void> {
    if (!this.lobbyId || !this.userId || !this.selectedAction) return;

    this.hideTargetSelector();
    this.hideLockButton();

    // Find current player actor
    const playerActor = this.players.find(p => p.userId === this.userId);
    if (!playerActor) {
      console.error('Player actor not found for userId:', this.userId);
      console.error('Available players:', this.players);
      console.error('Current userId:', this.userId);
      this.showPendingActionText(`❌ Player not found! Refresh and try again.`, '#e74c3c');
      return;
    }

    // Validate playerActor has required fields
    if (!playerActor.id) {
      console.error('Player actor missing id field:', playerActor);
      this.showPendingActionText(`❌ Player data corrupted! Refresh and try again.`, '#e74c3c');
      return;
    }

    // Handle card actions - validate AP and include cardId
    if (this.selectedAction === 'Card') {
      if (!this.selectedCardId) {
        console.error('Card action selected but no cardId');
        this.showPendingActionText(`❌ No card selected!`, '#e74c3c');
        return;
      }

      const card = getCardById(this.selectedCardId);
      if (!card) {
        console.error('Card not found:', this.selectedCardId);
        this.showPendingActionText(`❌ Card not found!`, '#e74c3c');
        return;
      }

      const currentAP = this.playerAP.get(this.userId) || 0;
      if (!canAfford(currentAP, card.ap)) {
        console.error(`Cannot afford card: need ${card.ap} AP, have ${currentAP}`);
        this.showPendingActionText(`❌ Not enough AP!`, '#e74c3c');
        return;
      }

      // Deduct AP
      const newAP = spendAP(currentAP, card.ap);
      this.playerAP.set(this.userId, newAP);
      
      // Update hand UI
      if (this.handUI) {
        this.handUI.setAP(newAP);
        this.handUI.clearSelection();
      }

      console.log(`AP spent: ${currentAP} -> ${newAP} (cost: ${card.ap})`);
    }

    const plan: ActionPlan = {
      by: playerActor.id,
      type: this.selectedAction,
      target: this.selectedTarget || undefined,
      cardId: this.selectedCardId || undefined,
    };

    console.log('Created action plan:', plan);
    console.log('Player actor used:', playerActor);

    // Show loading state
    this.showPendingActionText(`🔄 Locking ${this.selectedAction}...`, '#f39c12');

    try {
      console.log(`Locking action:`, plan);
      console.log(`Sending to lobby: ${this.lobbyId}, turn: ${this.currentTurn}`);
      console.log(`Player actor:`, playerActor);
      
      await sendPlan(this.lobbyId, plan, this.currentTurn);
      
      console.log('Action plan sent successfully!');
      
      // Update local state
      this.playerPlans.set(playerActor.id, plan);
      this.isLocked = true;
      
      // Clear pending action
      this.hidePendingActionText();
      this.clearButtonHighlights();
      
      // Show locked confirmation
      this.showPendingActionText(`✓ ${this.selectedAction} locked! Waiting for others...`, '#27ae60');
      
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
        plan,
        playerActor,
        error: error.message || error
      });
      
      // Show more specific error message
      let errorMsg = '❌ Failed to lock action! Try again.';
      if (error.message?.includes('Not authenticated')) {
        errorMsg = '❌ Authentication error! Refresh and try again.';
      } else if (error.message?.includes('network')) {
        errorMsg = '❌ Network error! Check connection.';
      } else if (error.message?.includes('Player not found')) {
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

    // Update local state
    this.playerPlans.set(plan.by, plan);
    this.updateActionIndicators();

    console.log('Updated player plans:', Array.from(this.playerPlans.entries()));

    // Show notification that other player locked in
    const player = this.players.find(p => p.id === plan.by);
    if (player) {
      this.showPlayerLockedNotification(player.name, plan.type);
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
      
      // Resolve turn
      const partyPlans = Array.from(this.playerPlans.values());
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
    
    // Check for combat end using pending post state
    const result = this.pendingPostState ? isCombatOver({ 
      ...this.combatState, 
      party: this.pendingPostState.filter(a => a.side === 'party'),
      enemies: this.pendingPostState.filter(a => a.side === 'enemy')
    }) : null;
    if (result) {
      console.log(`Combat ended: ${result}`);
      this.endCombat(result);
      return;
    }
    
    // Start next turn
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
        this.playStrike(srcId, dstId, note);
      },
      onHit: (srcId, dstId, damage) => {
        console.log(`=== HIT ANIMATION CALLBACK ===`);
        console.log(`Animation: Hit from ${srcId} to ${dstId} for ${damage} damage`);
        const srcName = this.getActorName(srcId);
        const dstName = this.getActorName(dstId);
        this.addCombatLogEntry(`${srcName} hits ${dstName} for ${damage} damage!`, '#e74c3c');
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
        this.playHeal(srcId, dstId, value);
        
        // Apply healing immediately so health increases are visible during animations
        // Both clients receive the same healing values from the resolve payload, so this stays in sync
        this.applyHealingToActor(dstId, value);
      },
      onVfx: (srcId, dstId, note) => {
        console.log(`Animation: VFX from ${srcId} to ${dstId} (${note})`);
        this.playVfx(srcId, dstId, note);
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

  private playStrike(srcId: ActorId, dstId: ActorId, note?: string): void {
    const srcSlot = this.getActorSlot(srcId);
    const dstSlot = this.getActorSlot(dstId);
    
    if (srcSlot) {
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

  private playGuard(srcId: ActorId, value: number): void {
    const srcSlot = this.getActorSlot(srcId);
    if (srcSlot) {
      // Shield effect
      const shield = this.add.graphics();
      shield.lineStyle(3, 0x3498db, 0.8);
      shield.beginPath();
      shield.arc(srcSlot.x, srcSlot.y, 30, 0, Math.PI * 2);
      shield.strokePath();
      srcSlot.add(shield);

      this.tweens.add({
        targets: shield,
        alpha: 0,
        duration: 500,
        ease: 'Power2',
        onComplete: () => shield.destroy(),
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
    // Generic VFX - could be expanded based on note
    console.log(`VFX: ${note} from ${srcId} to ${dstId}`);
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

      const plan = this.playerPlans.get(player.id);
      const wasLocked = lockIndicator.text === '✓';
      
      if (plan) {
        const icons = { Attack: '⚔️', Guard: '🛡️', Skill: '✨', Skip: '⏱️' };
        actionIndicator.setText(icons[plan.type] || '');
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
    // Update phase text
    const phaseText = this.hudContainer.getAt(2) as Phaser.GameObjects.Text;
    phaseText.setText(this.phase);
    
    // Update turn text
    const turnText = this.hudContainer.getAt(1) as Phaser.GameObjects.Text;
    turnText.setText(`Turn ${this.currentTurn}`);

    // Update phase color
    let phaseColor = '#4a90e2'; // planning
    if (this.phase === 'resolving') phaseColor = '#f39c12';
    if (this.phase === 'idle') phaseColor = '#95a5a6';
    phaseText.setColor(phaseColor);

    // Update HP bars
    this.updateHPBars();
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
      
      // Update health bar immediately
      this.updateTargetHealthBar(targetId);
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
    this.isLocked = false;
    this.selectedAction = null;
    this.selectedTarget = null;
    this.selectedCardId = null;
    
    // Refresh AP for all players at start of round
    this.players.forEach(player => {
      const currentAP = this.playerAP.get(player.id) || 0;
      const newAP = refreshAP(currentAP);
      this.playerAP.set(player.id, newAP);
      console.log(`Refreshed AP for ${player.name}: ${currentAP} -> ${newAP}`);
    });
    
    // Update hand UI with new AP
    if (this.handUI && this.userId) {
      const myAP = this.playerAP.get(this.userId) || 0;
      this.handUI.setAP(myAP);
    }
    
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
    
    // No auto-timer - fully turn-based
    // Players must explicitly lock their actions
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

    // Return to lobby after delay
    this.time.delayedCall(3000, () => {
      this.scene.start('Lobby');
    });
  }

  // UI Helper Methods
  private showLockButton(): void {
    this.hideLockButton();

    this.lockButton = this.add.container(this.scale.width / 2, this.scale.height - 150);

    const bg = this.add.rectangle(0, 0, 180, 50, 0x27ae60, 1);
    bg.setStrokeStyle(3, 0xffffff, 0.9);
    bg.setInteractive({ useHandCursor: true });
    this.lockButton.add(bg);

    const text = this.add.text(0, 0, '🔒 LOCK TURN', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    this.lockButton.add(text);

    // Pulse animation
    this.tweens.add({
      targets: this.lockButton,
      scale: 1.05,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    bg.on('pointerover', () => {
      bg.setFillStyle(0x2ecc71);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x27ae60);
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

    this.pendingActionDisplay = this.add.text(
      this.scale.width / 2,
      this.scale.height - 220,
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
          console.log('Timeline complete, starting next planning phase');
          
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
    // Update HUD background size
    if (this.hudContainer) {
      const topBg = this.hudContainer.list.find(obj => obj instanceof Phaser.GameObjects.Rectangle) as Phaser.GameObjects.Rectangle;
      if (topBg) {
        topBg.setSize(this.scale.width, 60);
        topBg.setPosition(this.scale.width / 2, 30);
      }
    }

    // Reposition combat log if it would be clipped
    if (this.combatLogContainer) {
      const logWidth = 250;
      const logHeight = 150;
      const logX = Math.min(10, this.scale.width - logWidth - 10);
      const logY = 80;
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
      const statsTexts = this.hudContainer.list.filter(obj => 
        obj instanceof Phaser.GameObjects.Text && 
        obj.text.includes('HP:') || obj.text.includes('Level:') || obj.text.includes('AP:')
      ) as Phaser.GameObjects.Text[];

      statsTexts.forEach((text, index) => {
        text.setPosition(statsX + 10, statsY + 15 + index * 20);
      });
    }
  }

  private addCombatLogEntry(message: string, color: string = '#ffffff'): void {
    if (!this.combatLogContainer) return;

    // Create new log entry with proper positioning
    const entry = this.add.text(10, 0, `• ${message}`, {
      fontSize: '11px',
      color,
      fontFamily: 'Arial, sans-serif',
      wordWrap: { width: 220 },
      align: 'left',
    });
    entry.setOrigin(0, 0);

    // Add to entries array
    this.combatLogEntries.push(entry);

    // Remove oldest entry if we exceed max
    if (this.combatLogEntries.length > this.MAX_LOG_ENTRIES) {
      const oldest = this.combatLogEntries.shift();
      if (oldest) {
        oldest.destroy();
      }
    }

    // Position all entries (newest at bottom, proper spacing)
    const startY = 30; // Start below the title
    const lineHeight = 18;
    this.combatLogEntries.forEach((logEntry, index) => {
      const targetY = startY + (index * lineHeight);
      
      // Add to container if not already added
      if (!this.combatLogContainer!.list.includes(logEntry)) {
        this.combatLogContainer!.add(logEntry);
      }
      
      // Animate to position
      this.tweens.add({
        targets: logEntry,
        y: targetY,
        duration: 200,
        ease: 'Power2',
      });
      
      // Fade out older entries
      const alpha = 1 - (this.combatLogEntries.length - 1 - index) * 0.2;
      logEntry.setAlpha(Math.max(0.4, alpha));
    });

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
    return actor?.name || 'Unknown';
  }

  private showPlayerLockedNotification(playerName: string, actionType: ActionType): void {
    // Get action icon
    const icons = { Attack: '⚔️', Guard: '🛡️', Skill: '✨', Skip: '⏱️' };
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
    const actionText = this.add.text(0, 12, `${icon} ${actionType}`, {
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
    this.hideLockButton();
    this.hidePendingActionText();
    this.hideTargetSelector();
    
    // Clean up remote cursors
    this.remoteCursors.forEach(cursor => cursor.destroy());
    this.remoteCursors.clear();
  }

  destroy(): void {
    // Clean up resize handler
    this.scale.off('resize', this.handleResize, this);
    
    // Clean up other resources
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    // Clean up UI elements
    this.remoteCursors.forEach(cursor => cursor.destroy());
    this.actionButtons.forEach(button => button.destroy());
    if (this.hudContainer) this.hudContainer.destroy();
    if (this.combatLogContainer) this.combatLogContainer.destroy();
    
    super.destroy();
  }
}