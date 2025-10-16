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
  LobbyMember,
  Lobby as LobbyData,
} from '../net/lobby';
import { useClientStore } from '../store/clientStore';
import { COLORS } from '../game/config';
import { SoundManager } from '../game/sound';

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
  private codeInput!: HTMLInputElement;
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

    // Join code input
    this.codeInput = document.createElement('input');
    this.codeInput.type = 'text';
    this.codeInput.placeholder = 'Enter Code';
    this.codeInput.maxLength = 5;
    this.codeInput.style.position = 'absolute';
    this.codeInput.style.left = `${centerX - 75}px`;
    this.codeInput.style.top = `${centerY + 30}px`;
    this.codeInput.style.width = '150px';
    this.codeInput.style.height = '40px';
    this.codeInput.style.fontSize = '20px';
    this.codeInput.style.padding = '5px';
    this.codeInput.style.textAlign = 'center';
    this.codeInput.style.textTransform = 'uppercase';
    document.body.appendChild(this.codeInput);

    // Join lobby button
    this.joinButton = this.createButtonObj(
      centerX,
      centerY + 100,
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
      
      if (this.codeInput) this.codeInput.remove();
      if (this.container) this.container.destroy();

      await this.showLobbyUI();
    } catch (error) {
      alert(`Failed to create lobby: ${error}`);
    }
  }

  private async handleJoinLobby(): Promise<void> {
    const code = this.codeInput.value.trim().toUpperCase();
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
      
      if (this.codeInput) this.codeInput.remove();
      if (this.container) this.container.destroy();

      await this.showLobbyUI();
    } catch (error: any) {
      alert(`Failed to join lobby: ${error.message}`);
    }
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
      onGameStart: (startedAt) => {
        console.log(`Game started at: ${startedAt}`);
        // Don't call startRun() here - host already called it when clicking button
        // Non-host clients will call it from here
        const isHost = this.members.find((m) => m.user_id === this.userId)?.is_host ?? false;
        if (!isHost) {
          this.startRun();
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

    // Render 3 slots
    for (let i = 0; i < 3; i++) {
      const member = this.members[i];
      const slotY = startY + i * 100;
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
      startY + 340,
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
    const leaveBtn = this.createButtonObj(centerX + 120, startY + 340, 200, 50, 'Leave', async () => {
      await this.handleLeaveLobby();
    });
    this.lobbyContainer.add(leaveBtn);

    // Start button (host only)
    if (isHost) {
      const allReady = this.members.every((m) => m.ready);
      const enough = this.members.length >= 1; // Allow single player
      const canStart = allReady && enough;

      const startBtn = this.createButtonObj(
        centerX,
        startY + 410,
        250,
        60,
        canStart ? 'Start Run' : `Need ${enough ? 'all ready' : '1+ players'}`,
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
      // Name
      const nameText = this.add.text(-200, -10, member.name, {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      });
      container.add(nameText);

      // Host crown
      if (member.is_host) {
        const crown = this.add.text(-200, 15, '👑 Host', {
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
          mapSeed: Date.now(),
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

    if (this.codeInput) {
      this.codeInput.remove();
    }
  }

  private startRun(seed?: number): void {
    // Prepare player data for card selection scene
    const players = this.members.map((member) => ({
      userId: member.user_id,
      name: member.name,
      isHost: member.is_host,
    }));

    console.log(`Starting card selection with ${players.length} players:`, players);
    
    // Fade out title music before transitioning to card selection
    if (this.soundManager) {
      console.log('Fading out title music...');
      this.soundManager.fadeOutMusic(1500); // 1.5 second fade
    }
    
    // Delay scene transition to allow fade to start
    this.time.delayedCall(200, () => {
      // Transition to CardSelectScene instead of directly to BattleScene
      this.scene.start('CardSelectScene', { 
        lobbyId: this.lobbyId,
        players: players,
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
    if (this.codeInput) {
      this.codeInput.remove();
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

