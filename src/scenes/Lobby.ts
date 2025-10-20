import Phaser from 'phaser';
import { signInAnonymously, getCurrentUserId } from '../net/supa';
import {
  createLobby,
  joinLobbyByCode,
  subscribeLobby,
  setReady as setLobbyReady,
  leaveLobby as leaveLobbyNet,
  startGame,
  getLobbyState,
  selectClass,
  LobbyMember,
  Lobby as LobbyData,
} from '../net/lobby';
import { useClientStore } from '../store/clientStore';
import { COLORS } from '../game/config';
import { SoundManager } from '../game/sound';
import { createCharacterAnimations, createCharacterSprite, CharacterClass } from '../game/characterSprites';

/**
 * Lobby scene - authentication, create/join, 3-player slots, ready system
 */
export class Lobby extends Phaser.Scene {
  private userId: string | null = null;
  private lobbyId: string | null = null;
  private lobbyCode: string | null = null;
  private members: LobbyMember[] = [];
  private unsubscribe: (() => void) | null = null;

  // UI state
  private showingLobby = false;
  private isReady = false;

  // UI elements
  private container!: Phaser.GameObjects.Container;
  private nameInput!: HTMLInputElement;
  private createButton!: Phaser.GameObjects.Container;
  private joinButton!: Phaser.GameObjects.Container;
  private lobbyContainer!: Phaser.GameObjects.Container;

  // Sound manager
  private soundManager: SoundManager | null = null;

  constructor() {
    super('Lobby');
  }

  async create(): Promise<void> {
    console.log('Lobby scene started');

    const width = this.scale.width;
    const height = this.scale.height;

    // Set background color (fallback if image fails to load)
    this.cameras.main.setBackgroundColor('#0d0d0d');

    // Add background image
    const bg = this.add.image(0, 0, 'lobbybg');
    bg.setOrigin(0, 0);
    bg.setDepth(-1); // Behind everything
    
    // Scale background to cover screen while maintaining aspect ratio
    const scaleX = width / bg.width;
    const scaleY = height / bg.height;
    const scale = Math.max(scaleX, scaleY); // Use max to cover entire screen
    bg.setScale(scale);
    
    // Center the background
    bg.setPosition(
      (width - bg.width * scale) / 2,
      (height - bg.height * scale) / 2
    );
    
    console.log(`Lobby background loaded: ${bg.width}x${bg.height}, scaled: ${scale.toFixed(2)}x`);

    // Create character animations for lobby display
    createCharacterAnimations(this);
    console.log('Character animations created for lobby');

    // Initialize sound manager and ensure title music is playing
    this.soundManager = new SoundManager(this);
    
    // Check if title music should be playing (from MainMenu)
    // If not, start it
    if (!this.sound.getAllPlaying().find(s => s.key === 'music_title')) {
      console.log('Title music not playing, starting it...');
      this.soundManager.playMusic('music_title', { volume: 0.3, loop: true });
    } else {
      console.log('Title music already playing from MainMenu');
    }

    // Check if already authenticated
    const existingUserId = await getCurrentUserId();
    if (existingUserId) {
      this.userId = existingUserId;
      this.showCreateJoinUI();
    } else {
      this.showNameInput();
    }
  }

  private showNameInput(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    // Title (with shadow for visibility)
    this.add
      .text(centerX, centerY - 150, 'Enter Your Name', {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    // HTML input for name
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.placeholder = 'Player Name';
    this.nameInput.maxLength = 20;
    this.nameInput.style.position = 'absolute';
    this.nameInput.style.left = `${centerX - 100}px`;
    this.nameInput.style.top = `${centerY - 20}px`;
    this.nameInput.style.width = '200px';
    this.nameInput.style.height = '40px';
    this.nameInput.style.fontSize = '18px';
    this.nameInput.style.padding = '5px';
    this.nameInput.style.textAlign = 'center';
    document.body.appendChild(this.nameInput);

    // Get stored name if available
    const storedName = useClientStore.getState().displayName;
    if (storedName) {
      this.nameInput.value = storedName;
    }

    this.nameInput.focus();

    // Continue button
    const continueButton = this.add.container(centerX, centerY + 60);

    const bg = this.add.rectangle(0, 0, 200, 50, COLORS.UI_ACCENT, 1);
    bg.setStrokeStyle(2, 0xffffff, 0.8);
    bg.setInteractive({ useHandCursor: true });

    const label = this.add.text(0, 0, 'Continue', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 0.8);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 1);
    });

    bg.on('pointerdown', async () => {
      const name = this.nameInput.value.trim();
      if (name.length < 2) {
        alert('Name must be at least 2 characters');
        return;
      }

      try {
        await signInAnonymously(name);
        useClientStore.getState().setDisplayName(name);
        this.userId = await getCurrentUserId();
        this.nameInput.remove();
        continueButton.destroy();
        this.showCreateJoinUI();
      } catch (error) {
        alert(`Authentication failed: ${error}`);
      }
    });

    continueButton.add([bg, label]);
  }

  private showCreateJoinUI(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    this.container = this.add.container(0, 0);

    // Title (with shadow for visibility over background)
    const title = this.add.text(centerX, 100, 'Lobby', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    });
    title.setOrigin(0.5);
    this.container.add(title);

    // Create lobby button
    this.createButton = this.createButtonObj(
      centerX,
      centerY - 50,
      250,
      60,
      'Create Lobby',
      async () => {
        await this.handleCreateLobby();
      }
      );
      this.container.add(this.createButton);

      // Join lobby button
      this.joinButton = this.createButtonObj(
        centerX,
        centerY + 30,
        250,
        60,
      'Join Lobby',
      async () => {
        await this.handleJoinLobby();
      }
    );
    this.container.add(this.joinButton);

    // Back button
    this.createBackButton();
  }

  private async handleCreateLobby(): Promise<void> {
    const name = useClientStore.getState().displayName || 'Player';

    try {
      const { id, code } = await createLobby(name);
      this.lobbyId = id;
      this.lobbyCode = code;
      useClientStore.getState().setCurrentLobby(id, code);
      
      if (this.container) this.container.destroy();

      await this.showLobbyUI();
    } catch (error) {
      alert(`Failed to create lobby: ${error}`);
    }
  }

  private async handleJoinLobby(): Promise<void> {
    // Show popup for code input
    this.showJoinCodePopup();
  }

  private showJoinCodePopup(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    // Create popup background overlay
    const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.7);
    overlay.setDepth(1000);
    overlay.setScrollFactor(0);

    // Create popup container
    const popup = this.add.container(centerX, centerY);
    popup.setDepth(1001);
    popup.setScrollFactor(0);

    // Popup background
    const popupBg = this.add.rectangle(0, 0, 400, 200, COLORS.UI_BG, 0.95);
    popupBg.setStrokeStyle(3, COLORS.UI_ACCENT, 0.8);
    popup.add(popupBg);

    // Title
    const title = this.add.text(0, -60, 'Enter Lobby Code', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    popup.add(title);

    // Code input - simpler approach without background rectangle
    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.placeholder = 'CODE';
    codeInput.maxLength = 5;
    codeInput.style.position = 'fixed';
    codeInput.style.width = '180px';
    codeInput.style.height = '45px';
    codeInput.style.fontSize = '20px';
    codeInput.style.fontWeight = 'bold';
    codeInput.style.textAlign = 'center';
    codeInput.style.textTransform = 'uppercase';
    codeInput.style.border = '2px solid #ffffff';
    codeInput.style.borderRadius = '4px';
    codeInput.style.outline = 'none';
    codeInput.style.color = '#000000';
    codeInput.style.backgroundColor = '#ffffff';
    codeInput.style.letterSpacing = '6px';
    codeInput.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
    codeInput.style.zIndex = '10000';
    document.body.appendChild(codeInput);
    
    // Function to position input centered in the popup - RECALCULATE CENTER EACH TIME
    const positionInput = () => {
      const canvas = this.game.canvas;
      const canvasRect = canvas.getBoundingClientRect();
      const inputWidth = 180;
      const inputHeight = 45;
      
      // RECALCULATE center position based on current canvas size
      const currentCenterX = canvasRect.left + canvasRect.width / 2;
      const currentCenterY = canvasRect.top + canvasRect.height / 2;
      
      // Center the input at the canvas center
      codeInput.style.left = `${currentCenterX - inputWidth / 2}px`;
      codeInput.style.top = `${currentCenterY - 5 - inputHeight / 2}px`;
    };
    
    // Initial position
    positionInput();
    
    // Reposition on window resize
    const resizeHandler = () => positionInput();
    window.addEventListener('resize', resizeHandler);
    
    // Also reposition on scale manager resize (for fullscreen)
    const scaleResizeHandler = () => positionInput();
    this.scale.on('resize', scaleResizeHandler);
    
    // Focus input after a brief delay to ensure it's rendered
    this.time.delayedCall(100, () => {
      codeInput.focus();
    });

    // Join button
    const joinBtn = this.add.container(0, 40);
    const joinBg = this.add.rectangle(0, 0, 120, 40, COLORS.UI_ACCENT, 1);
    joinBg.setStrokeStyle(2, 0xffffff, 0.8);
    joinBg.setInteractive({ useHandCursor: true });
    joinBtn.add(joinBg);

    const joinText = this.add.text(0, 0, 'Join', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    joinText.setOrigin(0.5);
    joinBtn.add(joinText);

    // Cancel button
    const cancelBtn = this.add.container(0, 40);
    const cancelBg = this.add.rectangle(0, 0, 120, 40, 0x666666, 1);
    cancelBg.setStrokeStyle(2, 0x999999, 0.8);
    cancelBg.setInteractive({ useHandCursor: true });
    cancelBtn.add(cancelBg);

    const cancelText = this.add.text(0, 0, 'Cancel', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    cancelText.setOrigin(0.5);
    cancelBtn.add(cancelText);

    // Position buttons side by side
    joinBtn.x = -70;
    cancelBtn.x = 70;

    popup.add([joinBtn, cancelBtn]);

    // Join button handler
    joinBg.on('pointerdown', async () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length !== 5) {
        alert('Enter a 5-character code');
        return;
      }

      const name = useClientStore.getState().displayName || 'Player';

      try {
        const id = await joinLobbyByCode(code, name);
        this.lobbyId = id;
        this.lobbyCode = code;
        useClientStore.getState().setCurrentLobby(id, code);
        
        window.removeEventListener('resize', resizeHandler);
        this.scale.off('resize', scaleResizeHandler);
        codeInput.remove();
        overlay.destroy();
        popup.destroy();
        if (this.container) this.container.destroy();
        await this.showLobbyUI();
      } catch (error: any) {
        alert(`Failed to join lobby: ${error.message}`);
      }
    });

    // Cancel button handler
    cancelBg.on('pointerdown', () => {
      window.removeEventListener('resize', resizeHandler);
      this.scale.off('resize', scaleResizeHandler);
      codeInput.remove();
      overlay.destroy();
      popup.destroy();
    });

    // Close on overlay click
    overlay.setInteractive({ useHandCursor: false });
    overlay.on('pointerdown', () => {
      window.removeEventListener('resize', resizeHandler);
      this.scale.off('resize', scaleResizeHandler);
      codeInput.remove();
      overlay.destroy();
      popup.destroy();
    });
  }

  private async showLobbyUI(): Promise<void> {
    if (!this.lobbyId) return;

    this.showingLobby = true;

    // Fetch initial state
    const state = await getLobbyState(this.lobbyId);
    this.members = state.members;

    // Create lobby UI container
    this.lobbyContainer = this.add.container(0, 0);

    this.renderLobbyUI();

    // Subscribe to updates
    this.unsubscribe = subscribeLobby(this.lobbyId, {
      onMembersChange: (members) => {
        this.members = members;
        this.renderLobbyUI();
      },
      onGameStart: async (startedAt) => {
        console.log(`Game started at: ${startedAt}`);
        // Don't call startRun() here - host already called it when clicking button
        // Non-host clients will call it from here
        const isHost = this.members.find((m) => m.user_id === this.userId)?.is_host ?? false;
        if (!isHost) {
          // Fetch the seed from the lobby so all players use the same map
          try {
            const state = await getLobbyState(this.lobbyId!);
            const seed = state.lobby.map_seed || undefined;
            console.log(`Non-host received map seed: ${seed}`);
            this.startRun(seed);
          } catch (error) {
            console.error('Failed to fetch lobby seed:', error);
            this.startRun(); // Fallback to no seed
          }
        }
      },
    });
  }

  private renderLobbyUI(): void {
    if (!this.showingLobby || !this.lobbyContainer) return;

    // Clear previous UI
    this.lobbyContainer.removeAll(true);

    const centerX = this.scale.width / 2;
    const startY = 120;

    // Title
    const title = this.add.text(centerX, 60, 'Lobby', {
      fontSize: '42px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    this.lobbyContainer.add(title);

    // Lobby code
    const codeText = this.add.text(centerX, 110, `Code: ${this.lobbyCode}`, {
      fontSize: '28px',
      color: `#${COLORS.UI_ACCENT.toString(16)}`,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    codeText.setOrigin(0.5);
    this.lobbyContainer.add(codeText);

    // Copy code button
    const copyBtn = this.createButtonObj(centerX + 150, 110, 100, 35, 'Copy', () => {
      if (this.lobbyCode) {
        navigator.clipboard.writeText(this.lobbyCode);
        console.log('Copied code to clipboard');
      }
    });
    this.lobbyContainer.add(copyBtn);

    // Class selection title (left side)
    const classTitle = this.add.text(150, 160, 'Select Your Class:', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    classTitle.setOrigin(0.5);
    this.lobbyContainer.add(classTitle);

    // Class selection buttons (vertical layout on left side)
    const classes = ['Warrior', 'Huntress', 'Mage'];
    const buttonWidth = 100;
    const buttonHeight = 100;
    const buttonGap = 20;
    const startX = 150; // Left side position

    classes.forEach((className, index) => {
      const x = startX;
      const y = 240 + (buttonHeight + buttonGap) * index;

      // Check if class is taken by someone else
      const isTaken = this.members.some(
        (m) => m.selected_class === className && m.user_id !== this.userId
      );

      // Check if this is our selected class
      const currentMember = this.members.find((m) => m.user_id === this.userId);
      const isSelected = currentMember?.selected_class === className;

      // Find who has selected this class
      const classOwner = this.members.find((m) => m.selected_class === className);
      const ownerName = classOwner?.name || null;

      const classBtn = this.createClassButton(
        x,
        y,
        buttonWidth,
        buttonHeight,
        className,
        isTaken,
        isSelected,
        ownerName,
        async () => {
          if (!this.lobbyId || isTaken) return;
          
          try {
            // If already selected, deselect. Otherwise, select this class
            const newClass = isSelected ? null : className;
            await selectClass(this.lobbyId, newClass);
          } catch (error: any) {
            console.error('Failed to select class:', error);
            alert(error.message || 'Failed to select class');
          }
        }
      );
      this.lobbyContainer.add(classBtn);
    });

    // Render 3 slots
    for (let i = 0; i < 3; i++) {
      const member = this.members[i];
      const slotY = startY + 140 + i * 100;
      const slot = this.renderMemberSlot(centerX, slotY, i + 1, member);
      this.lobbyContainer.add(slot);
    }

    // Get current user info
    const currentMember = this.members.find((m) => m.user_id === this.userId);
    const isHost = currentMember?.is_host || false;
    this.isReady = currentMember?.ready || false;

    // Ready button
    const readyBtn = this.createButtonObj(
      centerX - 120,
      startY + 480,
      200,
      50,
      this.isReady ? '✓ Ready' : 'Ready',
      async () => {
        if (!this.lobbyId) return;
        const newReady = !this.isReady;
        try {
          await setLobbyReady(this.lobbyId, newReady);
          this.isReady = newReady;
        } catch (error) {
          console.error('Failed to set ready:', error);
        }
      }
    );
    if (this.isReady) {
      const bg = readyBtn.getAt(0) as Phaser.GameObjects.Rectangle;
      bg.setFillStyle(0x27ae60, 1);
    }
    this.lobbyContainer.add(readyBtn);

    // Leave button
    const leaveBtn = this.createButtonObj(centerX + 120, startY + 480, 200, 50, 'Leave', async () => {
      await this.handleLeaveLobby();
    });
    this.lobbyContainer.add(leaveBtn);

    // Start button (host only)
    if (isHost) {
      const allReady = this.members.every((m) => m.ready);
      const enough = this.members.length >= 1; // Allow single player
      const allHaveClass = this.members.every((m) => m.selected_class !== null);
      const canStart = allReady && enough && allHaveClass;

      const startBtn = this.createButtonObj(
        centerX,
        startY + 550,
        250,
        60,
        canStart ? 'Start Run' : !allHaveClass ? 'All must pick class' : `Need ${enough ? 'all ready' : '1+ players'}`,
        async () => {
          if (!canStart || !this.lobbyId) return;
          try {
            const seed = await startGame(this.lobbyId);
            console.log(`Starting with seed: ${seed}`);
            this.startRun(seed);
          } catch (error) {
            console.error('Failed to start game:', error);
          }
        }
      );

      if (!canStart) {
        const bg = startBtn.getAt(0) as Phaser.GameObjects.Rectangle;
        bg.setFillStyle(0x555555, 1);
        bg.disableInteractive();
      }

      this.lobbyContainer.add(startBtn);
    }
  }

  private renderMemberSlot(
    x: number,
    y: number,
    slotNum: number,
    member?: LobbyMember
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Slot background
    const bg = this.add.rectangle(0, 0, 500, 80, member ? COLORS.UI_BG : 0x1a1a1a, 0.8);
    bg.setStrokeStyle(2, member ? COLORS.UI_ACCENT : 0x444444, 0.5);
    container.add(bg);

    if (member) {
      // Character sprite (if class selected)
      if (member.selected_class) {
        const sprite = createCharacterSprite(
          this,
          -220, // Left side of slot
          0,
          member.selected_class as CharacterClass,
          1.5 // Larger size for lobby display
        );
        
        if (sprite) {
          container.add(sprite);
          console.log(`Created ${member.selected_class} sprite for ${member.name}`);
        }
      }
      
      // Name and Class
      const displayText = member.selected_class 
        ? `${member.name} - ${member.selected_class}`
        : member.name;
      const nameText = this.add.text(-160, -10, displayText, {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      });
      container.add(nameText);

      // Host crown
      if (member.is_host) {
        const crown = this.add.text(-160, 15, '👑 Host', {
          fontSize: '16px',
          color: '#ffd700',
          fontFamily: 'Arial, sans-serif',
        });
        container.add(crown);
      }

      // Ready indicator
      if (member.ready) {
        const ready = this.add.text(180, 0, '✓ Ready', {
          fontSize: '20px',
          color: '#27ae60',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        });
        ready.setOrigin(0.5);
        container.add(ready);
      } else {
        const notReady = this.add.text(180, 0, 'Not Ready', {
          fontSize: '18px',
          color: '#e74c3c',
          fontFamily: 'Arial, sans-serif',
        });
        notReady.setOrigin(0.5);
        container.add(notReady);
      }
    } else {
      // Empty slot
      const emptyText = this.add.text(0, 0, `Slot ${slotNum} - Waiting...`, {
        fontSize: '20px',
        color: '#666666',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'italic',
      });
      emptyText.setOrigin(0.5);
      container.add(emptyText);
    }

    return container;
  }

  private createButtonObj(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, width, height, COLORS.UI_ACCENT, 1);
    bg.setStrokeStyle(2, 0xffffff, 0.8);
    bg.setInteractive({ useHandCursor: true });

    const label = this.add.text(0, 0, text, {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 0.8);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(COLORS.UI_ACCENT, 1);
    });

    bg.on('pointerdown', callback);

    container.add([bg, label]);
    return container;
  }

  private createClassButton(
    x: number,
    y: number,
    width: number,
    height: number,
    className: string,
    isTaken: boolean,
    isSelected: boolean,
    ownerName: string | null,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Map class names to icon keys
    const iconMap: { [key: string]: string } = {
      'Warrior': 'class_warrior_icon',
      'Huntress': 'class_huntress_icon',
      'Mage': 'class_wizard_icon',
    };

    // Transparent background for interaction area (no visible background or border)
    const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0);
    
    if (!isTaken) {
      bg.setInteractive({ useHandCursor: true });
    }

    // Add the class icon image instead of text
    const iconKey = iconMap[className];
    const icon = this.add.image(0, 0, iconKey);
    icon.setDisplaySize(width, height); // Full button size
    
    // Apply tint if taken
    if (isTaken) {
      icon.setTint(0x666666);
      icon.setAlpha(0.5);
    }

    // Create hover text (class name) - initially hidden
    const hoverText = this.add.text(0, -height * 0.5, className, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    });
    hoverText.setOrigin(0.5);
    hoverText.setVisible(false);

    // Add player name text if class is selected (always visible)
    let playerNameText: Phaser.GameObjects.Text | null = null;
    if (ownerName) {
      playerNameText = this.add.text(0, 0, ownerName, {
        fontSize: '20px',
        color: isSelected ? '#44ff44' : '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      });
      playerNameText.setOrigin(0.5);
    }

    if (!isTaken) {
      bg.on('pointerover', () => {
        icon.setScale(icon.scale * 1.15); // Larger scale on hover
        hoverText.setVisible(true); // Show class name on hover
      });

      bg.on('pointerout', () => {
        icon.setDisplaySize(width, height); // Reset scale
        hoverText.setVisible(false); // Hide class name
      });

      bg.on('pointerdown', callback);
    } else {
      // Also show hover text for taken classes
      bg.on('pointerover', () => {
        hoverText.setVisible(true);
      });

      bg.on('pointerout', () => {
        hoverText.setVisible(false);
      });
    }

    // Add status text only if taken
    if (isTaken) {
      const takenText = this.add.text(0, height * 0.52, 'Taken', {
        fontSize: '12px',
        color: '#ff6666',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      });
      takenText.setOrigin(0.5);
      container.add(takenText);
    }

    if (playerNameText) {
      container.add([bg, icon, hoverText, playerNameText]);
    } else {
      container.add([bg, icon, hoverText]);
    }
    return container;
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    return this.createButtonObj(x, y, width, height, text, callback);
  }

  private createBackButton(): void {
    const backText = this.add.text(20, 20, '← Back', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    backText.setScrollFactor(0);
    backText.setInteractive({ useHandCursor: true });

    backText.on('pointerover', () => {
      backText.setColor('#4a90e2');
    });

    backText.on('pointerout', () => {
      backText.setColor('#ffffff');
    });

    backText.on('pointerdown', async () => {
      await this.handleLeaveLobby();
      this.scene.start('MainMenu');
    });

    // Test Map button (for development)
    if (import.meta.env.DEV) {
      const testMapText = this.add.text(20, 50, '🗺️ Test Map', {
        fontSize: '16px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      });
      testMapText.setScrollFactor(0);
      testMapText.setInteractive({ useHandCursor: true });

      testMapText.on('pointerover', () => {
        testMapText.setColor('#4a90e2');
      });

      testMapText.on('pointerout', () => {
        testMapText.setColor('#aaaaaa');
      });

      testMapText.on('pointerdown', () => {
        this.scene.start('MapScene', {
          lobbyId: 'test-lobby',
          players: [{ userId: 'test-user', name: 'Test Player', isHost: true }],
          mapSeed: Date.now() % 2147483647, // Keep within PostgreSQL integer range
        });
      });
    }
  }

  private async handleLeaveLobby(): Promise<void> {
    if (this.lobbyId) {
      try {
        await leaveLobbyNet(this.lobbyId);
        useClientStore.getState().clearCurrentLobby();
      } catch (error) {
        console.error('Failed to leave lobby:', error);
      }
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private startRun(seed?: number): void {
    // Prepare player data for card selection scene including class info
    const players = this.members.map((member) => ({
      userId: member.user_id,
      name: member.name,
      isHost: member.is_host,
      selectedClass: member.selected_class || 'Warrior', // Fallback to Warrior if somehow null
    }));

    console.log(`Starting card selection with ${players.length} players:`, players);
    console.log(`Map seed for this run: ${seed}`);
    
    // Fade out title music before transitioning to card selection
    if (this.soundManager) {
      console.log('Fading out title music...');
      this.soundManager.fadeOutMusic(1500); // 1.5 second fade
    }
    
    // Delay scene transition to allow fade to start
    this.time.delayedCall(200, () => {
      // Transition to CardSelectScene with map seed
      this.scene.start('CardSelectScene', { 
        lobbyId: this.lobbyId,
        players: players,
        mapSeed: seed, // Pass the synchronized map seed
      });
    });
  }

  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.nameInput) {
      this.nameInput.remove();
    }
    if (this.lobbyContainer) {
      this.lobbyContainer.destroy();
    }
    // Music will be faded out by startRun() before transitioning
    // Or stopped by MainMenu if going back
  }

  destroy(): void {
    // Clean up sound manager
    if (this.soundManager) {
      this.soundManager.destroy();
      this.soundManager = null;
    }
  }
}

