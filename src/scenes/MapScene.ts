import Phaser from 'phaser';
import { generateMap, GameMap, MapNode, NodeType, getNodesInLayer, getAvailableNodes, visitNode } from '../game/mapgen';
import { SoundManager } from '../game/sound';
import { subscribeMap, sendMapVote, sendMapVoteResult, sendMapCursor } from '../net/match';
import { CursorPosition } from '../net/proto';
import { getGold, initializeInventory } from '../game/inventory';
import { createEnemyAnimations } from '../game/enemySprites';
import { setupCustomCursor } from '../utils/cursor';

/**
 * Map scene - Slay the Spire style node-based progression
 */
export class MapScene extends Phaser.Scene {
  private gameMap!: GameMap;
  private nodeVisuals = new Map<string, NodeVisual>();
  private soundManager: SoundManager | null = null;
  private currentNodeId: string | null = null; // Track player's current position
  private playerMarker: Phaser.GameObjects.Container | null = null; // Visual marker for current position
  private traveledConnections = new Set<string>(); // Track which connections have been traveled
  private connectionGraphics: Phaser.GameObjects.Graphics | null = null; // Store connection graphics for updates
  private hasTransitioned = false; // Prevent duplicate scene transitions
  
  // Scene data
  private lobbyId: string | null = null;
  private players: any[] = [];
  private userId: string | null = null;
  private isHost = false;
  private currentStage = 1; // Track battle stage number
  
  // Voting system
  private mapVotes = new Map<string, string>(); // userId -> nodeId (includes own vote!)
  private votingUI: Phaser.GameObjects.Container | null = null;
  private voteIndicators = new Map<string, Phaser.GameObjects.Container[]>(); // nodeId -> indicator containers
  private unsubscribe: (() => void) | null = null;
  
  // Cursor tracking
  private remoteCursors = new Map<string, Phaser.GameObjects.Container>();
  private cursorThrottle = 0;
  private readonly CURSOR_THROTTLE_MS = 50;
  
  // Debug mode
  private debugMode = false;
  private debugText: Phaser.GameObjects.Text | null = null;
  
  // Layout constants
  private readonly NODE_RADIUS = 25;
  private readonly LAYER_HEIGHT = 80; // Spacing for 7 layers
  private readonly NODE_SPACING = 200; // Increased spacing for better visual separation
  private readonly MAP_START_Y = 650; // Moved down to avoid taskbar
  private readonly MAP_MARGIN_LEFT = 220; // Left margin for spacing
  private readonly MAP_MARGIN_RIGHT = 220; // Right margin to avoid legend
  
  constructor() {
    super('MapScene');
  }

  init(data: { lobbyId?: string; players?: any[]; mapSeed?: number; visitedNodes?: string[]; currentNodeId?: string; stage?: number; world?: 'world1' | 'world2' }): void {
    this.lobbyId = data.lobbyId || null;
    this.players = data.players || [];
    this.currentNodeId = data.currentNodeId || null;
    this.currentStage = data.stage || 1; // Receive stage number from previous battle
    this.hasTransitioned = false; // Reset transition flag for new scene instance
    
    console.log('=== MAP SCENE INITIALIZED ===');
    console.log('LobbyId:', this.lobbyId);
    console.log('Players:', this.players);
    console.log('Player count:', this.players.length);
    console.log('Map seed:', data.mapSeed);
    console.log('Visited nodes:', data.visitedNodes);
    console.log('Current node:', this.currentNodeId);
    console.log('Current stage:', this.currentStage);
    console.log('World received:', data.world);
    (this as any).worldKey = data.world || 'world1';
    console.log('World key set to:', (this as any).worldKey);
    console.log('============================');
    
    // Generate map with same seed to get same structure
    this.gameMap = generateMap({ seed: data.mapSeed });
    
    // Restore visited node state
    if (data.visitedNodes) {
      data.visitedNodes.forEach(nodeId => {
        const node = this.gameMap.nodes.get(nodeId);
        if (node) {
          node.visited = true;
          console.log(`Restored visited state for node: ${nodeId}`);
        }
      });
    }
    
    // If no current node specified, find the most recent visited node (highest layer)
    if (!this.currentNodeId && data.visitedNodes && data.visitedNodes.length > 0) {
      const visitedNodesArray = data.visitedNodes
        .map(id => this.gameMap.nodes.get(id))
        .filter(n => n !== undefined) as MapNode[];
      
      if (visitedNodesArray.length > 0) {
        // Get the visited node with the highest layer (most progress)
        const mostRecentNode = visitedNodesArray.reduce((max, node) => 
          node.layer > max.layer ? node : max
        );
        this.currentNodeId = mostRecentNode.id;
        console.log(`Set current node to most recent: ${this.currentNodeId} at layer ${mostRecentNode.layer}`);
      }
    }
    
    // If still no current node, default to start
    if (!this.currentNodeId) {
      const startNode = Array.from(this.gameMap.nodes.values()).find(n => n.type === NodeType.Start);
      if (startNode) {
        this.currentNodeId = startNode.id;
        console.log(`Set current node to start: ${this.currentNodeId}`);
      }
    }
    
    console.log(`Map generated with ${this.gameMap.nodes.size} nodes, ${data.visitedNodes?.length || 0} visited`);
  }

  async create(): Promise<void> {
    // Set up custom cursor
    setupCustomCursor(this);
    
    const width = this.scale.width;
    const height = this.scale.height;

    // Get current user ID
    this.userId = await this.getCurrentUserId();
    console.log('Current userId:', this.userId);
    
    // Determine if host (first player)
    this.isHost = this.players.length > 0 && this.players[0].userId === this.userId;
    console.log('Is host:', this.isHost);

    // Create enemy animations for previews
    createEnemyAnimations(this);

    // Fantasy dark background with gradient
    this.cameras.main.setBackgroundColor('#0d0820');
    
    // Create fantasy background
    this.createFantasyBackground();
    
    // Fade-in from black
    const fadeOverlay = this.add.rectangle(0, 0, width, height, 0x000000, 1);
    fadeOverlay.setOrigin(0);
    fadeOverlay.setDepth(50000);
    
    this.tweens.add({
      targets: fadeOverlay,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        fadeOverlay.destroy();
      }
    });

    // Initialize sound
    this.soundManager = new SoundManager(this);
    
    // Stop any music from previous scenes (battle, shop, etc.)
    console.log('Checking for music from previous scenes...');
    const allSounds = this.sound.getAllPlaying();
    console.log('Currently playing sounds:', allSounds.map(s => s.key));
    
    allSounds.forEach(sound => {
      if (sound.key.startsWith('music_')) {
        console.log(`Stopping previous scene music: ${sound.key}`);
        sound.stop();
      }
      // Fade out victory sound if playing
      if (sound.key === 'sfx_victory') {
        console.log('Fading out victory sound');
        this.tweens.add({
          targets: sound,
          volume: 0,
          duration: 1000,
          ease: 'Linear',
          onComplete: () => {
            sound.stop();
          }
        });
      }
    });
    
    // Play map music with fade in
    this.soundManager.playMusicWithFadeIn('music_map', { 
      volume: 0.35, 
      loop: true 
    }, 1500); // 1.5 second fade in
    console.log('Map music started with fade in');
    
    // Display world indicator in upper left corner
    const worldKey = (this as any).worldKey || 'world1';
    const worldNumber = worldKey === 'world2' ? '2' : '1';
    this.add.text(20, 20, `🌍 World ${worldNumber}`, {
      fontSize: '28px',
      fontFamily: 'Arial Black',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0, 0).setDepth(1000);
    
    // Display gold in top-right corner
    if (this.userId) {
      initializeInventory(this.userId); // Ensure inventory exists
      const playerGold = getGold(this.userId);
      this.add.text(width - 20, 20, `💰 ${playerGold} Gold`, {
        fontSize: '28px',
        fontFamily: 'Arial Black',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(1, 0).setDepth(1000);
      console.log(`[MapScene] Player gold: ${playerGold}`);
    }

    // Fantasy-styled title with glow effect
    const titleShadow = this.add.text(width / 2 + 2, 42, 'THE PATH AHEAD', {
      fontSize: '52px',
      color: '#1a0f2e',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold italic',
    });
    titleShadow.setOrigin(0.5);
    titleShadow.setDepth(999);

    const title = this.add.text(width / 2, 40, 'THE PATH AHEAD', {
      fontSize: '52px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold italic',
      stroke: '#8b6914',
      strokeThickness: 3,
    });
    title.setOrigin(0.5);
    title.setDepth(1000);
    
    // Glowing animation on title
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.7 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Instructions with fantasy styling
    const instructions = this.add.text(width / 2, 95, 'Choose your destiny...', {
      fontSize: '20px',
      color: '#b8a890',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
      stroke: '#000000',
      strokeThickness: 3,
    });
    instructions.setOrigin(0.5);
    instructions.setDepth(1000);

    // Legend
    this.createLegend();

    // Camera - no scrolling needed, map fits on screen
    this.cameras.main.setBounds(0, 0, width, height);
    
    // Render map
    this.renderMap();
    
    // Mark start node as visited if it's the current node
    const startNode = Array.from(this.gameMap.nodes.values()).find(n => n.type === NodeType.Start);
    if (startNode && !this.currentNodeId) {
      startNode.visited = true;
      this.currentNodeId = startNode.id;
    }
    
    // Create player marker on current node
    if (this.currentNodeId) {
      this.createPlayerMarker(this.currentNodeId);
    }
    
    // Update available nodes (only forward progression)
    this.updateAvailableNodes();
    
    // Setup networking if multiple players
    if (this.players.length > 1 && this.lobbyId) {
      this.setupVoting();
    }
    
    // Setup debug mode keyboard input
    this.setupDebugMode();
    
    // No scrolling needed - map fits on screen!
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

  private setupDebugMode(): void {
    let debugInput = '';
    
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      // Only process letter keys
      if (event.key.length === 1 && event.key.match(/[a-zA-Z]/)) {
        debugInput += event.key.toUpperCase();
        
        // Keep only last 5 characters
        if (debugInput.length > 5) {
          debugInput = debugInput.slice(-5);
        }
        
        // Check if "DEBUG" was typed
        if (debugInput.includes('DEBUG')) {
          this.toggleDebugMode();
          debugInput = ''; // Reset input
        }
      }
    });
  }

  private toggleDebugMode(): void {
    this.debugMode = !this.debugMode;
    
    if (this.debugMode) {
      console.log('🔧 DEBUG MODE ENABLED - Click any node to travel there');
      
      // Create debug text indicator
      this.debugText = this.add.text(50, 50, 'DEBUG MODE', {
        fontSize: '24px',
        color: '#ff0000',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      });
      this.debugText.setDepth(2000);
      
      // Make all nodes available for clicking
      this.updateAvailableNodes();
    } else {
      console.log('🔧 DEBUG MODE DISABLED');
      
      // Remove debug text
      if (this.debugText) {
        this.debugText.destroy();
        this.debugText = null;
      }
      
      // Restore normal node availability
      this.updateAvailableNodes();
    }
  }

  private setupVoting(): void {
    if (!this.lobbyId) return;

    subscribeMap(this.lobbyId, {
      onMapVote: this.handleRemoteVote.bind(this),
      onMapVoteResult: this.handleVoteResult.bind(this),
      onCursorMove: this.handleCursorMove.bind(this),
    }).then((unsubscribe) => {
      this.unsubscribe = unsubscribe;
      console.log('Map voting system initialized');
    }).catch((error) => {
      console.error('Failed to setup voting:', error);
    });
    
    // Setup cursor sending
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.sendCursorPosition(pointer.x, pointer.y);
    });
  }

  private handleRemoteVote(userId: string, nodeId: string): void {
    console.log(`📨 Remote vote from ${userId}: ${nodeId}`);
    console.log(`My userId: ${this.userId}`);
    
    // Store ALL votes including echoes of our own
    this.mapVotes.set(userId, nodeId);
    console.log(`Current vote map:`, Array.from(this.mapVotes.entries()));
    this.updateVotingUI();
    
    // Show visual indicator above the voted node
    this.showVoteIndicator(userId, nodeId);
    
    // If host, check if all players voted
    if (this.isHost) {
      console.log('Host checking if all votes are in...');
      this.checkAllVotesIn();
    }
  }

  private handleVoteResult(selectedNodeId: string, votes: { [nodeId: string]: string[] }): void {
    console.log('Received vote result:', selectedNodeId, votes);
    
    // Clear all vote indicators
    this.clearVoteIndicators();
    
    // Transition to the selected node
    const node = this.gameMap.nodes.get(selectedNodeId);
    if (node) {
      this.transitionToNode(node);
    }
  }

  private checkAllVotesIn(): void {
    if (!this.isHost) {
      console.log('Not host, skipping vote check');
      return;
    }
    
    const totalPlayers = this.players.length;
    const votesReceived = this.mapVotes.size;
    
    console.log(`📊 Vote check: ${votesReceived}/${totalPlayers} votes received`);
    console.log(`All votes:`, Array.from(this.mapVotes.entries()));
    console.log(`Total players:`, totalPlayers);
    console.log(`Players:`, this.players.map(p => ({ userId: p.userId, name: p.name })));
    
    if (votesReceived >= totalPlayers) {
      console.log('✅ All votes received, resolving...');
      this.resolveVotes();
    } else {
      const missingPlayers = this.players.filter(p => !this.mapVotes.has(p.userId));
      console.log(`⏳ Waiting for more votes (${totalPlayers - votesReceived} remaining)`);
      console.log(`Missing votes from:`, missingPlayers.map(p => p.name));
    }
  }

  private resolveVotes(): void {
    // Count votes for each node (mapVotes now includes everyone's votes)
    const voteCounts = new Map<string, string[]>();
    
    // Add all votes from mapVotes
    for (const [userId, nodeId] of this.mapVotes.entries()) {
      if (!voteCounts.has(nodeId)) {
        voteCounts.set(nodeId, []);
      }
      voteCounts.get(nodeId)!.push(userId);
    }
    
    // Find winner(s)
    let maxVotes = 0;
    let winningNodes: string[] = [];
    
    for (const [nodeId, voters] of voteCounts.entries()) {
      if (voters.length > maxVotes) {
        maxVotes = voters.length;
        winningNodes = [nodeId];
      } else if (voters.length === maxVotes) {
        winningNodes.push(nodeId);
      }
    }
    
    // Select winner (coin toss if tie)
    const selectedNodeId = winningNodes[Math.floor(Math.random() * winningNodes.length)];
    
    console.log(`Vote resolution: ${selectedNodeId} wins with ${maxVotes} votes`);
    
    // Convert Map to object for network
    const votesObject: { [nodeId: string]: string[] } = {};
    for (const [nodeId, voters] of voteCounts.entries()) {
      votesObject[nodeId] = voters;
    }
    
    // Broadcast result to other players
    if (this.lobbyId) {
      sendMapVoteResult(this.lobbyId, selectedNodeId, votesObject).catch(err => {
        console.error('Failed to send vote result:', err);
      });
    }
    
    // Clear vote indicators before transition
    this.clearVoteIndicators();
    
    // Host also transitions to the selected node
    const node = this.gameMap.nodes.get(selectedNodeId);
    if (node) {
      console.log(`Host transitioning to node: ${selectedNodeId}`);
      this.transitionToNode(node);
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
    const votesReceived = this.mapVotes.size;
    
    const statusText = this.add.text(0, -15, 'Voting for Path...', {
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
    
    // Show current user's vote
    const myVoteNodeId = this.mapVotes.get(this.userId!);
    if (myVoteNodeId) {
      const myVoteText = this.add.text(0, 30, `Your vote: ${this.getNodeTypeName(myVoteNodeId)}`, {
        fontSize: '12px',
        color: '#44ff88',
        fontFamily: 'Georgia, serif',
      });
      myVoteText.setOrigin(0.5);
      this.votingUI.add(myVoteText);
    }
  }

  private getNodeTypeName(nodeId: string): string {
    const node = this.gameMap.nodes.get(nodeId);
    if (!node) return 'Unknown';
    
    switch (node.type) {
      case NodeType.Battle: return 'Battle';
      case NodeType.Shop: return 'Shop';
      case NodeType.Event: return 'Event';
      case NodeType.Boss: return 'Boss';
      default: return 'Unknown';
    }
  }

  private createFantasyBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Use world-specific background
    const worldKey = (this as any).worldKey || 'world1';
    const bgKey = worldKey === 'world2' ? 'world2bg' : 'map_bg';
    console.log(`🗺️ Map scene loading background for ${worldKey}: ${bgKey}`);
    
    // Create background image
    const backgroundImage = this.add.image(width / 2, height / 2, bgKey);
    
    // Scale image to fit screen while maintaining aspect ratio
    const imageScale = Math.max(width / 1536, height / 1024);
    backgroundImage.setScale(imageScale);
    backgroundImage.setDepth(-100);
    
    // Add dark overlay for better text readability
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.3);
    overlay.fillRect(0, 0, width, height);
    overlay.setDepth(-99);
    
    // Add floating particles/embers in background
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 1.5 + 0.5;
      const particle = this.add.circle(x, y, size, 0xaa8866, 0.4);
      particle.setDepth(-80);
      
      // Floating animation
      this.tweens.add({
        targets: particle,
        y: y - 100 - Math.random() * 50,
        x: x + (Math.random() - 0.5) * 50,
        alpha: 0,
        duration: 3000 + Math.random() * 2000,
        repeat: -1,
        delay: Math.random() * 2000,
        ease: 'Sine.easeInOut',
        onRepeat: () => {
          particle.y = height + 20;
          particle.alpha = 0.4;
        }
      });
    }
    
    // Decorative corner elements
    this.createCornerDecorations();
  }

  private createCornerDecorations(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Top corners - fantasy brackets
    const cornerGraphics = this.add.graphics();
    cornerGraphics.lineStyle(3, 0x8b7355, 0.6);
    
    // Top left corner decoration
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(20, 140);
    cornerGraphics.lineTo(20, 20);
    cornerGraphics.lineTo(140, 20);
    cornerGraphics.strokePath();
    
    // Top right corner decoration
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(width - 20, 140);
    cornerGraphics.lineTo(width - 20, 20);
    cornerGraphics.lineTo(width - 140, 20);
    cornerGraphics.strokePath();
    
    // Bottom left corner decoration
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(20, height - 140);
    cornerGraphics.lineTo(20, height - 20);
    cornerGraphics.lineTo(140, height - 20);
    cornerGraphics.strokePath();
    
    // Bottom right corner decoration
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(width - 20, height - 140);
    cornerGraphics.lineTo(width - 20, height - 20);
    cornerGraphics.lineTo(width - 140, height - 20);
    cornerGraphics.strokePath();
    
    cornerGraphics.setDepth(999);
    cornerGraphics.setScrollFactor(0);
  }

  private createLegend(): void {
    const legendX = this.scale.width - 200;
    const legendY = 160;
    const container = this.add.container(legendX, legendY);
    container.setDepth(1000);
    container.setScrollFactor(0); // Fixed to camera

    // Fantasy-styled background
    const bg = this.add.rectangle(0, 0, 190, 200, 0x1a0f2e, 0.85);
    bg.setStrokeStyle(3, 0x8b7355, 0.8);
    container.add(bg);

    const legendTitle = this.add.text(0, -85, 'PATHS', {
      fontSize: '20px',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold italic',
      stroke: '#000000',
      strokeThickness: 2,
    });
    legendTitle.setOrigin(0.5);
    container.add(legendTitle);

    const entries = [
      { type: 'Battle', color: 0x8b1f31, border: 0xc74452, icon: '⚔' },
      { type: 'Shop', color: 0xa08028, border: 0xd4af37, icon: '💰' },
      { type: 'Event', color: 0x4a3a8d, border: 0x7b68bb, icon: '?' },
      { type: 'Boss', color: 0x660000, border: 0xcc3333, icon: '☠' },
    ];

    entries.forEach((entry, i) => {
      const y = -45 + i * 38;
      
      // Node preview with darker colors
      const bgCircle = this.add.circle(-55, y, 15, 0x0d0820, 0.6);
      container.add(bgCircle);
      
      const circle = this.add.circle(-55, y, 12, entry.color, 0.9);
      circle.setStrokeStyle(2, entry.border, 0.7);
      container.add(circle);
      
      const icon = this.add.text(-55, y, entry.icon, {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      });
      icon.setOrigin(0.5);
      container.add(icon);
      
      const text = this.add.text(-30, y, entry.type, {
        fontSize: '16px',
        color: '#b8a890',
        fontFamily: 'Georgia, serif',
      });
      text.setOrigin(0, 0.5);
      container.add(text);
    });
  }

  private renderMap(): void {
    // Create connection graphics container
    this.connectionGraphics = this.add.graphics();
    this.connectionGraphics.setDepth(1);

    // Draw all connections
    this.renderConnections();

    // Then draw nodes on top
    for (const node of this.gameMap.nodes.values()) {
      // Boss nodes are larger
      const radius = node.type === NodeType.Boss ? this.NODE_RADIUS * 1.5 : this.NODE_RADIUS;
      const visual = new NodeVisual(this, node, this.getNodePosition(node), radius);
      visual.on('click', () => this.handleNodeClick(node));
      this.nodeVisuals.set(node.id, visual);
    }
  }

  private renderConnections(): void {
    if (!this.connectionGraphics) return;
    
    // Clear previous connections
    this.connectionGraphics.clear();

    for (const node of this.gameMap.nodes.values()) {
      const nodePos = this.getNodePosition(node);
      
      for (const targetId of node.connections) {
        const targetNode = this.gameMap.nodes.get(targetId);
        if (targetNode) {
          const targetPos = this.getNodePosition(targetNode);
          
          // Create connection key for tracking
          const connectionKey = this.getConnectionKey(node.id, targetId);
          const isTraveled = this.traveledConnections.has(connectionKey);
          
          // Calculate line endpoints that stop at the edge of the circles
          const fromRadius = node.type === NodeType.Boss ? this.NODE_RADIUS * 1.5 : this.NODE_RADIUS;
          const toRadius = targetNode.type === NodeType.Boss ? this.NODE_RADIUS * 1.5 : this.NODE_RADIUS;
          
          // Calculate direction vector between nodes
          const dx = targetPos.x - nodePos.x;
          const dy = targetPos.y - nodePos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Normalize direction and scale by radius to get edge points
          const fromEdgeX = nodePos.x + (dx / distance) * fromRadius;
          const fromEdgeY = nodePos.y + (dy / distance) * fromRadius;
          const toEdgeX = targetPos.x - (dx / distance) * toRadius;
          const toEdgeY = targetPos.y - (dy / distance) * toRadius;
          
          // Create a slightly curved path using Phaser curves
          const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(fromEdgeX, fromEdgeY),
            new Phaser.Math.Vector2(
              (fromEdgeX + toEdgeX) / 2 + (Math.random() - 0.5) * 20,
              (fromEdgeY + toEdgeY) / 2
            ),
            new Phaser.Math.Vector2(toEdgeX, toEdgeY)
          );
          
          if (isTraveled) {
            // Solid line for traveled connections with white outline for visibility
            this.connectionGraphics.lineStyle(5, 0xffffff, 0.8); // White outline
            curve.draw(this.connectionGraphics, 32);
            this.connectionGraphics.lineStyle(3, 0x00ff00, 1.0); // Bright green center
            curve.draw(this.connectionGraphics, 32);
          } else {
            // Dotted line for untraveled connections - bright white with outline
            this.drawDottedLine(curve, 0xffffff, 1.0);
          }
        }
      }
    }
  }

  private getConnectionKey(fromId: string, toId: string): string {
    // Create a consistent key for the connection (bidirectional)
    return [fromId, toId].sort().join('_');
  }

  private drawDottedLine(curve: Phaser.Curves.QuadraticBezier, color: number, alpha: number): void {
    if (!this.connectionGraphics) return;
    
    // Get points along the curve
    const points = curve.getPoints(64); // More points for smoother curves
    
    // Draw dotted line with much shorter dashes like the example
    const dashLength = 3; // Very short dashes
    const gapLength = 3;  // Equal gap length
    
    // Draw dark outline first for contrast
    for (let i = 0; i < points.length - 1; i += dashLength + gapLength) {
      const startPoint = points[i];
      const endPoint = points[Math.min(i + dashLength, points.length - 1)];
      
      // Dark outline for contrast
      this.connectionGraphics.lineStyle(5, 0x000000, 0.8);
      this.connectionGraphics.beginPath();
      this.connectionGraphics.moveTo(startPoint.x, startPoint.y);
      this.connectionGraphics.lineTo(endPoint.x, endPoint.y);
      this.connectionGraphics.strokePath();
      
      // Bright white center
      this.connectionGraphics.lineStyle(3, color, alpha);
      this.connectionGraphics.beginPath();
      this.connectionGraphics.moveTo(startPoint.x, startPoint.y);
      this.connectionGraphics.lineTo(endPoint.x, endPoint.y);
      this.connectionGraphics.strokePath();
    }
  }

  private getNodePosition(node: MapNode): { x: number; y: number } {
    const layerNodes = getNodesInLayer(this.gameMap, node.layer);
    const layerWidth = (layerNodes.length - 1) * this.NODE_SPACING;
    
    // Calculate available width (screen width minus margins)
    const availableWidth = this.scale.width - this.MAP_MARGIN_LEFT - this.MAP_MARGIN_RIGHT;
    
    // Center the layer within available space
    const startX = this.MAP_MARGIN_LEFT + (availableWidth - layerWidth) / 2;
    
    // Add horizontal jitter for more organic, asymmetrical look
    // Use node ID as seed for consistent positions across rerenders
    const jitterSeed = parseInt(node.id.split('_').join(''), 36) % 1000;
    const jitter = ((jitterSeed / 1000) - 0.5) * 30; // ±15px variation (reduced from 40)
    
    return {
      x: startX + node.column * this.NODE_SPACING + jitter,
      y: this.MAP_START_Y - node.layer * this.LAYER_HEIGHT,
    };
  }

  private createPlayerMarker(nodeId: string): void {
    const node = this.gameMap.nodes.get(nodeId);
    if (!node) return;
    
    const pos = this.getNodePosition(node);
    
    // Remove old marker if exists
    if (this.playerMarker) {
      this.playerMarker.destroy();
    }
    
    // Create new marker
    this.playerMarker = this.add.container(pos.x, pos.y);
    this.playerMarker.setDepth(100); // Above nodes
    
    // Fantasy player marker (scaled to smaller nodes)
    const outerGlow = this.add.circle(0, 0, this.NODE_RADIUS + 15, 0xffd700, 0.4);
    this.playerMarker.add(outerGlow);
    
    // Multiple rings for fantasy effect
    const ring1 = this.add.circle(0, 0, this.NODE_RADIUS + 11, 0x44ff88, 0.3);
    ring1.setStrokeStyle(2, 0xffd700, 0.8);
    this.playerMarker.add(ring1);
    
    const innerCircle = this.add.circle(0, 0, this.NODE_RADIUS + 8, 0x32cd32, 0.95);
    innerCircle.setStrokeStyle(3, 0xffd700, 1);
    this.playerMarker.add(innerCircle);
    
    // Shadow for depth
    const iconShadow = this.add.text(1, 1, '⚔', {
      fontSize: '28px',
      color: '#000000',
    });
    iconShadow.setOrigin(0.5);
    iconShadow.setAlpha(0.5);
    this.playerMarker.add(iconShadow);
    
    const playerIcon = this.add.text(0, 0, '⚔', {
      fontSize: '28px',
    });
    playerIcon.setOrigin(0.5);
    this.playerMarker.add(playerIcon);
    
    // Pulsing glow animation
    this.tweens.add({
      targets: outerGlow,
      scale: { from: 1, to: 1.4 },
      alpha: { from: 0.4, to: 0.1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // Ring rotation for magical effect
    this.tweens.add({
      targets: ring1,
      angle: 360,
      duration: 4000,
      repeat: -1,
      ease: 'Linear',
    });
    
    console.log(`Created player marker at node ${nodeId}`);
  }

  private updateAvailableNodes(): void {
    // In debug mode, make all nodes available
    if (this.debugMode) {
      for (const [id, visual] of this.nodeVisuals.entries()) {
        const node = this.gameMap.nodes.get(id)!;
        const isCurrent = id === this.currentNodeId;
        visual.setAvailable(!isCurrent); // Make all nodes available except current
        visual.setVisited(node.visited);
        visual.setCurrent(isCurrent);
      }
      return;
    }
    
    // Get nodes that are directly connected from current node and in higher layer
    let availableIds = new Set<string>();
    
    if (this.currentNodeId) {
      const currentNode = this.gameMap.nodes.get(this.currentNodeId);
      if (currentNode) {
        console.log(`[updateAvailableNodes] Current node: ${this.currentNodeId} at layer ${currentNode.layer}`);
        console.log(`[updateAvailableNodes] Current node visited: ${currentNode.visited}`);
        console.log(`[updateAvailableNodes] Current node connections:`, currentNode.connections);
        
        // Only nodes connected to current node are available
        currentNode.connections.forEach(connectedId => {
          const connectedNode = this.gameMap.nodes.get(connectedId);
          if (connectedNode) {
            const isForward = connectedNode.layer > currentNode.layer;
            const isUnvisited = !connectedNode.visited;
            console.log(`[updateAvailableNodes] Checking ${connectedId}: layer=${connectedNode.layer}, visited=${connectedNode.visited}, forward=${isForward}, unvisited=${isUnvisited}`);
            
            // Only allow forward progression (higher layer = further up the map)
            if (isUnvisited && isForward) {
              availableIds.add(connectedId);
              console.log(`[updateAvailableNodes] ✓ Node ${connectedId} is available!`);
            }
          }
        });
        
        console.log(`[updateAvailableNodes] Total available nodes from ${this.currentNodeId}:`, Array.from(availableIds));
      } else {
        console.error(`[updateAvailableNodes] Current node ${this.currentNodeId} not found in map!`);
      }
    } else {
      console.log(`[updateAvailableNodes] No current node, using fallback`);
      // Fallback to old behavior if no current node
      const available = getAvailableNodes(this.gameMap);
      availableIds = new Set(available.map(n => n.id));
      console.log(`[updateAvailableNodes] Fallback available nodes:`, Array.from(availableIds));
    }
    
    for (const [id, visual] of this.nodeVisuals.entries()) {
      const node = this.gameMap.nodes.get(id)!;
      const isCurrent = id === this.currentNodeId;
      const isAvailable = availableIds.has(id);
      visual.setAvailable(isAvailable);
      visual.setVisited(node.visited);
      visual.setCurrent(isCurrent);
      
      if (node.layer > 0 && node.layer < 6) { // Only log middle layers to avoid spam
        console.log(`[updateAvailableNodes] Visual ${id}: available=${isAvailable}, visited=${node.visited}, current=${isCurrent}`);
      }
    }
  }

  private handleNodeClick(node: MapNode): void {
    // In debug mode, allow clicking any node
    if (this.debugMode) {
      console.log(`🔧 DEBUG: Traveling to ${node.id} (${node.type})`);
      this.transitionDirectly(node);
      return;
    }
    
    // Check if node is available (connected to current node and forward only)
    let isAvailable = false;
    
    if (this.currentNodeId) {
      const currentNode = this.gameMap.nodes.get(this.currentNodeId);
      if (currentNode) {
        isAvailable = currentNode.connections.includes(node.id) && 
                      !node.visited && 
                      node.layer > currentNode.layer;
      }
    } else {
      const available = getAvailableNodes(this.gameMap);
      isAvailable = available.some(n => n.id === node.id);
    }
    
    if (!isAvailable) {
      console.log('Node not available - can only move forward through connected paths');
      return;
    }

    console.log(`Selected node: ${node.id} (${node.type})`);
    
    // ALWAYS use voting in multiplayer (check both players AND lobbyId)
    if (this.players.length > 1 && this.lobbyId) {
      console.log('🗳️ Multiplayer detected - using voting system');
      // Multiplayer: Vote for this node
      this.voteForNode(node.id);
    } else {
      console.log('👤 Single player detected - direct transition');
      // Single player: Direct transition
      this.transitionDirectly(node);
    }
  }

  private async voteForNode(nodeId: string): Promise<void> {
    console.log(`=== VOTING FOR NODE: ${nodeId} ===`);
    
    // Record my vote locally immediately
    if (this.userId) {
      this.mapVotes.set(this.userId, nodeId);
      console.log(`My vote recorded: ${this.userId} -> ${nodeId}`);
    }
    this.updateVotingUI();
    
    // Show visual indicator for my vote immediately
    if (this.userId) {
      this.showVoteIndicator(this.userId, nodeId);
    }
    
    // Send vote to network (will echo back and be processed by handleRemoteVote)
    if (this.lobbyId) {
      try {
        await sendMapVote(this.lobbyId, nodeId);
        console.log(`✅ Vote sent successfully for node: ${nodeId}`);
      } catch (error) {
        console.error('❌ Failed to send vote:', error);
      }
    } else {
      console.log('⚠️ No lobbyId, not sending vote');
    }
    
    // If host, check if all votes are in
    if (this.isHost) {
      console.log('I am host, checking votes...');
      this.checkAllVotesIn();
    } else {
      console.log('I am not host, waiting for result...');
    }
  }

  private transitionDirectly(node: MapNode): void {
    // Mark connection as traveled
    if (this.currentNodeId) {
      const connectionKey = this.getConnectionKey(this.currentNodeId, node.id);
      this.traveledConnections.add(connectionKey);
      console.log(`Marked connection as traveled: ${connectionKey}`);
    }
    
    // Mark as visited and update current position
    visitNode(this.gameMap, node.id);
    this.currentNodeId = node.id;
    
    // Update visuals
    this.createPlayerMarker(this.currentNodeId);
    this.updateAvailableNodes();
    
    // Redraw connections to show solid lines
    this.renderConnections();
    
    // Transition based on node type
    this.time.delayedCall(300, () => {
      this.transitionToNode(node);
    });
  }

  private sendCursorPosition(x: number, y: number): void {
    // Throttle cursor updates
    const now = Date.now();
    if (now - this.cursorThrottle < this.CURSOR_THROTTLE_MS) {
      return;
    }
    this.cursorThrottle = now;
    
    if (!this.lobbyId || !this.userId) return;
    
    // Find player name
    const player = this.players.find(p => p.userId === this.userId);
    const userName = player?.name || 'Unknown';
    
    sendMapCursor(this.lobbyId, x, y, userName).catch(() => {
      // Silently fail - don't spam console with cursor errors
    });
  }

  private handleCursorMove(cursor: CursorPosition): void {
    // Don't show our own cursor
    if (cursor.userId === this.userId) {
      return;
    }
    
    // Get or create cursor visual
    let cursorContainer = this.remoteCursors.get(cursor.userId);
    
    if (!cursorContainer) {
      // Create new cursor
      cursorContainer = this.add.container(cursor.x, cursor.y);
      cursorContainer.setDepth(9999); // Above everything
      
      // Cursor pointer
      const cursorGraphic = this.add.graphics();
      cursorGraphic.fillStyle(0x44ff88, 1);
      cursorGraphic.fillTriangle(0, 0, 0, 20, 8, 12);
      cursorGraphic.lineStyle(2, 0x000000, 1);
      cursorGraphic.strokeTriangle(0, 0, 0, 20, 8, 12);
      cursorContainer.add(cursorGraphic);
      
      // Player name label
      const nameText = this.add.text(12, 0, cursor.userName || 'Player', {
        fontSize: '12px',
        color: '#44ff88',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#000000',
        padding: { x: 4, y: 2 },
      });
      nameText.setOrigin(0, 0);
      cursorContainer.add(nameText);
      
      this.remoteCursors.set(cursor.userId, cursorContainer);
    }
    
    // Update cursor position with smooth tween
    this.tweens.add({
      targets: cursorContainer,
      x: cursor.x,
      y: cursor.y,
      duration: 50,
      ease: 'Linear',
    });
  }

  private transitionToNode(node: MapNode): void {
    // Prevent duplicate transitions
    if (this.hasTransitioned) {
      console.log('[MapScene] Already transitioning, skipping...');
      return;
    }
    this.hasTransitioned = true;
    console.log(`[MapScene] Starting transition to ${node.type} node...`);
    
    // Mark connection as traveled
    if (this.currentNodeId) {
      const connectionKey = this.getConnectionKey(this.currentNodeId, node.id);
      this.traveledConnections.add(connectionKey);
      console.log(`Marked connection as traveled: ${connectionKey}`);
    }
    
    // Get list of visited node IDs from the map
    const visitedNodes = Array.from(this.gameMap.nodes.values())
      .filter(n => n.visited)
      .map(n => n.id);
    
    console.log(`[MapScene] Transitioning from node ${this.currentNodeId} to ${node.id}`);
    console.log(`[MapScene] Visited nodes being passed:`, visitedNodes);
    
    switch (node.type) {
      case NodeType.Battle:
        console.log(`Transitioning to battle... (Stage ${this.currentStage + 1})`);
        
        // Increment stage for each battle
        const nextStage = this.currentStage + 1;
        
        // CRITICAL: Kill all tweens and stop all sounds immediately
        console.log('🔇 Stopping all sounds and tweens before transition...');
        this.tweens.killAll();
        this.sound.stopAll();
        
        // Destroy sound manager to prevent lingering tweens
        if (this.soundManager) {
          console.log('🔇 Destroying sound manager...');
          this.soundManager.destroy();
          this.soundManager = null;
        }
        
        // Transition immediately without delay
        console.log('🚀 Transitioning to CardSelectScene...');
        this.scene.start('CardSelectScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.gameMap.seed, // Pass map seed to maintain continuity
          visitedNodes: visitedNodes, // Pass visited nodes to maintain progress
          currentNodeId: node.id, // Pass the TARGET node as current position (player is moving to this node)
          stage: nextStage, // Increment stage for next battle
          world: (this as any).worldKey,
        });
        break;
        
      case NodeType.Boss:
        console.log(`🔥 BOSS BATTLE! Transitioning to Stage 6...`);
        
        // Boss battles are always Stage 6 (regardless of current stage)
        const bossStage = 6;
        
        // CRITICAL: Kill all tweens and stop all sounds immediately
        console.log('🔇 Stopping all sounds and tweens before transition...');
        this.tweens.killAll();
        this.sound.stopAll();
        
        // Destroy sound manager to prevent lingering tweens
        if (this.soundManager) {
          console.log('🔇 Destroying sound manager...');
          this.soundManager.destroy();
          this.soundManager = null;
        }
        
        // Transition immediately without delay
        console.log('🚀 Transitioning to CardSelectScene...');
        this.scene.start('CardSelectScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.gameMap.seed, // Pass map seed to maintain continuity
          visitedNodes: visitedNodes, // Pass visited nodes to maintain progress
          currentNodeId: node.id, // Pass the TARGET node as current position (player is moving to this node)
          stage: bossStage, // Boss battles are always Stage 6
          world: (this as any).worldKey,
        });
        break;
        
      case NodeType.Shop:
        console.log('Transitioning to shop...');
        
        // CRITICAL: Kill all tweens and stop all sounds immediately
        this.tweens.killAll();
        this.sound.stopAll();
        if (this.soundManager) {
          this.soundManager.destroy();
          this.soundManager = null;
        }
        
        // Transition immediately
        this.scene.start('ShopScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.gameMap.seed,
          visitedNodes: visitedNodes,
          currentNodeId: node.id, // Pass the TARGET node as current position
          nodeId: node.id,
          stage: this.currentStage, // Pass stage (doesn't increment for shops)
        });
        break;
        
      case NodeType.Event:
        console.log('Transitioning to event...');
        
        // CRITICAL: Kill all tweens and stop all sounds immediately
        this.tweens.killAll();
        this.sound.stopAll();
        if (this.soundManager) {
          this.soundManager.destroy();
          this.soundManager = null;
        }
        
        // Transition immediately
        this.scene.start('EventScene', {
          lobbyId: this.lobbyId,
          players: this.players,
          mapSeed: this.gameMap.seed,
          visitedNodes: visitedNodes,
          currentNodeId: node.id, // Pass the TARGET node as current position
          nodeId: node.id,
          stage: this.currentStage, // Pass stage (doesn't increment for events)
        });
        break;
        
      case NodeType.Start:
        // Start node just opens up the next layer
        console.log('Journey begins...');
        break;
    }
  }

  /**
   * Show a vote indicator above a node
   */
  private showVoteIndicator(userId: string, nodeId: string): void {
    // Find the player who voted
    const player = this.players.find(p => p.userId === userId);
    const playerName = player ? player.name : 'Unknown';
    const isMyVote = userId === this.userId;
    
    // Get node visual
    const visual = this.nodeVisuals.get(nodeId);
    if (!visual) return;
    
    // Get node position
    const node = this.gameMap.nodes.get(nodeId);
    if (!node) return;
    const nodePos = this.getNodePosition(node);
    
    // Create or get indicators array for this node
    if (!this.voteIndicators.has(nodeId)) {
      this.voteIndicators.set(nodeId, []);
    }
    const indicators = this.voteIndicators.get(nodeId)!;
    
    // Check if this user already voted for this node
    const existingIndex = indicators.findIndex(ind => 
      (ind.getData('userId') as string) === userId
    );
    if (existingIndex !== -1) {
      console.log(`Vote indicator already exists for ${playerName} on node ${nodeId}`);
      return;
    }
    
    // Create vote indicator
    const yOffset = -50 - (indicators.length * 25); // Stack indicators above node
    const indicator = this.add.container(nodePos.x, nodePos.y + yOffset);
    indicator.setDepth(100);
    indicator.setData('userId', userId);
    
    // Background for indicator
    const bg = this.add.rectangle(0, 0, 80, 20, 0x1a0f2e, 0.9);
    bg.setStrokeStyle(2, isMyVote ? 0x44ff88 : 0xd4af37, 1);
    indicator.add(bg);
    
    // Player name text
    const nameText = this.add.text(0, 0, playerName.substring(0, 8), {
      fontSize: '12px',
      color: isMyVote ? '#44ff88' : '#d4af37',
      fontFamily: 'Arial Black',
    });
    nameText.setOrigin(0.5);
    indicator.add(nameText);
    
    // Add checkmark
    const checkmark = this.add.text(-35, 0, '✓', {
      fontSize: '14px',
      color: isMyVote ? '#44ff88' : '#ffffff',
      fontFamily: 'Arial',
    });
    checkmark.setOrigin(0.5);
    indicator.add(checkmark);
    
    // Fade in animation
    indicator.setAlpha(0);
    this.tweens.add({
      targets: indicator,
      alpha: 1,
      duration: 300,
      ease: 'Power2',
    });
    
    // Store indicator
    indicators.push(indicator);
    
    console.log(`✓ Vote indicator shown: ${playerName} voted for ${this.getNodeTypeName(nodeId)} (${indicators.length} votes on this node)`);
  }
  
  /**
   * Clear all vote indicators
   */
  private clearVoteIndicators(): void {
    console.log('Clearing all vote indicators...');
    for (const indicators of this.voteIndicators.values()) {
      for (const indicator of indicators) {
        if (indicator && indicator.scene === this) {
          indicator.destroy();
        }
      }
    }
    this.voteIndicators.clear();
    
    // Also clear the votes map for the next voting round
    this.mapVotes.clear();
    
    // Update UI to reflect cleared votes
    if (this.votingUI) {
      this.votingUI.destroy();
      this.votingUI = null;
    }
  }

  shutdown(): void {
    console.log('[MapScene] Shutting down and cleaning up...');
    
    // Clear vote indicators
    this.clearVoteIndicators();
    
    // Destroy all node visuals to prevent stacking
    for (const visual of this.nodeVisuals.values()) {
      visual.destroy();
    }
    this.nodeVisuals.clear();
    
    // Destroy connection graphics
    if (this.connectionGraphics) {
      this.connectionGraphics.destroy();
      this.connectionGraphics = null;
    }
    
    // Destroy player marker
    if (this.playerMarker) {
      this.playerMarker.destroy();
      this.playerMarker = null;
    }
    
    // Clean up debug mode
    if (this.debugText) {
      this.debugText.destroy();
      this.debugText = null;
    }
    this.debugMode = false;
    
    // Destroy voting UI
    if (this.votingUI) {
      this.votingUI.destroy();
      this.votingUI = null;
    }
    
    // Cleanup cursors
    for (const cursor of this.remoteCursors.values()) {
      cursor.destroy();
    }
    this.remoteCursors.clear();
    
    // Clear votes and traveled connections
    this.mapVotes.clear();
    this.traveledConnections.clear();
    
    // Unsubscribe from network
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    
    console.log('[MapScene] Cleanup complete');
  }

  destroy(): void {
    this.shutdown();
    if (this.soundManager) {
      this.soundManager.destroy();
      this.soundManager = null;
    }
  }
}

/**
 * Visual representation of a map node
 */
class NodeVisual extends Phaser.GameObjects.Container {
  private circle: Phaser.GameObjects.Arc;
  private icon: Phaser.GameObjects.Text | Phaser.GameObjects.Sprite | null = null;
  private node: MapNode;
  private isAvailable = false;
  private isVisited = false;
  private isCurrent = false;
  private glowCircle: Phaser.GameObjects.Arc;
  private redX: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, node: MapNode, position: { x: number; y: number }, radius: number) {
    super(scene, position.x, position.y);
    this.node = node;
    
    scene.add.existing(this);
    this.setDepth(10);

    // Simple outer glow (for available nodes only)
    this.glowCircle = scene.add.circle(0, 0, radius + 6, 0x888888, 0.3);
    this.glowCircle.setVisible(false);
    this.add(this.glowCircle);

    // Dark rim for better visibility
    const darkRim = scene.add.circle(0, 0, radius + 2, 0x000000, 0.8);
    this.add(darkRim);

    // Clean main circle
    this.circle = scene.add.circle(0, 0, radius, this.getNodeColor());
    this.circle.setStrokeStyle(2, this.getNodeBorderColor(), 1.0);
    this.add(this.circle);

    // Add content based on node type
    this.createNodeContent(scene, node, radius);

    // Create red X for completed nodes (initially hidden)
    this.redX = scene.add.text(0, 0, '✕', {
      fontSize: '32px',
      color: '#ff0000',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.redX.setOrigin(0.5);
    this.redX.setVisible(false);
    this.redX.setDepth(20); // Above everything else
    this.add(this.redX);

    // Interactive
    this.circle.setInteractive({ useHandCursor: true });
    this.circle.on('pointerover', () => this.onHover());
    this.circle.on('pointerout', () => this.onHoverOut());
    this.circle.on('pointerdown', () => this.onClick());
  }

  private createNodeContent(scene: Phaser.Scene, node: MapNode, _radius: number): void {
    const stageNumber = node.layer + 1; // Layer 0 = Start, Layer 1 = Stage 1, etc.

    if (node.type === NodeType.Battle || node.type === NodeType.Boss) {
      // Show enemy preview for battle nodes
      // Pass world info to the preview function from the MapScene
      const worldKey = (this.scene as any).worldKey || 'world1';
      (scene as any).worldKey = worldKey;
      const sprite = this.createEnemyPreview(scene, stageNumber, node.type === NodeType.Boss);
      if (sprite) {
        this.icon = sprite;
        this.add(sprite);
      } else {
        // Fallback to icon
        this.createTextIcon(scene, this.getNodeIcon());
      }
    } else if (node.type === NodeType.Shop) {
      // Shop gets a special sprite/icon
      this.createShopIcon(scene);
    } else if (node.type === NodeType.Event) {
      // Event gets a special sprite/icon
      this.createEventIcon(scene);
    } else {
      // Default text icon
      this.createTextIcon(scene, this.getNodeIcon());
    }
  }

  private createEnemyPreview(scene: Phaser.Scene, stage: number, isBoss: boolean): Phaser.GameObjects.Sprite | null {
    try {
      let spriteKey: string;
      const worldKey = (scene as any).worldKey || 'world1';
      
      // Match EXACT enemy from BattleScene.generateEnemiesForStage()
      if (isBoss) {
        // Boss - check world
        if (worldKey === 'world2') {
          spriteKey = 'demon_boss_idle';
        } else {
          spriteKey = 'minotaur_idle';
        }
      } else {
        switch (stage) {
          case 1:
            // Stage 1: Different enemy per world
            if (worldKey === 'world2') {
              spriteKey = 'stone_golem_idle';
            } else {
              spriteKey = 'skeleton_warrior_idle';
            }
            break;
          case 2:
            // Stage 2: Different enemy per world
            if (worldKey === 'world2') {
              spriteKey = 'stone_golem_idle';
            } else {
              spriteKey = 'skeleton_warrior_idle';
            }
            break;
          case 3:
            // Stage 3: Different enemy per world
            if (worldKey === 'world2') {
              spriteKey = 'stone_golem_idle';
            } else {
              spriteKey = 'skele_mage_idle'; // First enemy in World 1 Stage 3
            }
            break;
          case 4:
            // Stage 4: Different enemy per world
            if (worldKey === 'world2') {
              spriteKey = 'stone_golem_idle';
            } else {
              spriteKey = 'skeleton_warrior_idle'; // First enemy in World 1 Stage 4
            }
            break;
          case 5:
            // Stage 5: Different enemy per world
            if (worldKey === 'world2') {
              spriteKey = 'stone_golem_idle';
            } else {
              spriteKey = 'skele_mage_idle';
            }
            break;
          default:
            // Stage 7+: Default based on world
            if (worldKey === 'world2') {
              spriteKey = 'stone_golem_idle';
            } else {
              spriteKey = 'skele_mage_idle';
            }
        }
      }

      // Calculate position and scale based on enemy type
      let x = 0, y = 0;
      let scale = 0.7; // Default scale
      if (isBoss) {
        y = -15; // Boss position
        if (spriteKey === 'demon_boss_idle') {
          scale = 1.5; // Demon Boss is much larger
          y = -65; // Move Demon Boss up
        } else if (spriteKey === 'minotaur_idle') {
          scale = 1.5; // Minotaur is much larger
          x = 25; // Move Minotaur to the right
          y = -35; // Move Minotaur up a bit more
        }
      } else if (spriteKey === 'skele_mage_idle') {
        y = -15; // Move skele mages up 15px
        scale = 1.0; // Skele Mage is larger
      } else if (spriteKey === 'skeleton_warrior_idle') {
        x = -6; // Move skeleton warriors left 6px
        y = -10; // Move skeleton warriors up 10px
        scale = 1.2; // Skeleton Warrior is larger
      } else if (spriteKey === 'stone_golem_idle') {
        y = -10; // Stone Golem positioning
        scale = 1.2; // Stone Golem is larger
      }
      
      const sprite = scene.add.sprite(x, y, spriteKey);
      sprite.setScale(scale);
      sprite.setAlpha(1.0); // Ensure full opacity
      sprite.setTint(0xffffff); // Remove any tinting
      
      // Debug: Log skeleton warrior sprite creation
      if (spriteKey.includes('skeleton_warrior')) {
        console.log(`[MapScene] Created skeleton warrior preview: ${spriteKey}, alpha: ${sprite.alpha}, visible: ${sprite.visible}`);
      }
      
      // Add a subtle background circle behind the enemy for better visibility
      const enemyBg = scene.add.circle(x, y, 20, 0x000000, 0.3);
      enemyBg.setDepth(-1); // Behind the sprite
      
      // Play idle animation
      const animKey = spriteKey.replace('idle', 'idle_anim');
      if (scene.anims.exists(animKey)) {
        sprite.play(animKey);
      }
      
      return sprite;
    } catch (error) {
      console.error('Failed to create enemy preview:', error);
      return null;
    }
  }

  private createShopIcon(scene: Phaser.Scene): void {
    // Create shop icon using merchant image
    const merchantSprite = scene.add.image(0, 0, 'merchant');
    
    // Scale down the 500x500 image to fit nicely in the node circle
    // Node radius is typically 25px, so we want the image to be about 40px diameter
    const targetSize = 40;
    const scale = targetSize / 500; // 500 is the original image size
    merchantSprite.setScale(scale);
    merchantSprite.setOrigin(0.5, 0.5);
    
    this.icon = merchantSprite;
    this.add(merchantSprite);
  }

  private createEventIcon(scene: Phaser.Scene): void {
    // Create event icon using event image
    const eventSprite = scene.add.image(0, 0, 'event');
    
    // Scale down the 500x500 image to fit nicely in the node circle
    // Node radius is typically 25px, so we want the image to be about 40px diameter
    const targetSize = 40;
    const scale = targetSize / 500; // 500 is the original image size
    eventSprite.setScale(scale);
    eventSprite.setOrigin(0.5, 0.5);
    
    this.icon = eventSprite;
    this.add(eventSprite);
  }

  private createTextIcon(scene: Phaser.Scene, iconText: string): void {
    // Icon with subtle shadow
    const iconShadow = scene.add.text(1, 1, iconText, {
      fontSize: '20px',
      color: '#000000',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    iconShadow.setOrigin(0.5);
    iconShadow.setAlpha(0.3);
    this.add(iconShadow);

    this.icon = scene.add.text(0, 0, iconText, {
      fontSize: '20px',
      color: '#cccccc',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    this.icon.setOrigin(0.5);
    this.add(this.icon);
  }

  private getNodeColor(): number {
    switch (this.node.type) {
      case NodeType.Start:
        return 0x2a4a6a; // Blue for start (not in legend but keeping consistent)
      case NodeType.Battle:
        return 0x4a5d23; // Dark green for normal battles (distinct from boss red)
      case NodeType.Shop:
        return 0xa08028; // Match legend Shop color
      case NodeType.Event:
        return 0x4a3a8d; // Match legend Event color
      case NodeType.Boss:
        return 0x660000; // Match legend Boss color
      default:
        return 0x444444;
    }
  }

  private getNodeBorderColor(): number {
    switch (this.node.type) {
      case NodeType.Start:
        return 0x5a8ab8; // Light blue border for start
      case NodeType.Battle:
        return 0x6b7c33; // Light green border for normal battles
      case NodeType.Shop:
        return 0xd4af37; // Match legend Shop border
      case NodeType.Event:
        return 0x7b68bb; // Match legend Event border
      case NodeType.Boss:
        return 0xcc3333; // Match legend Boss border
      default:
        return 0x666666;
    }
  }

  private getNodeIcon(): string {
    switch (this.node.type) {
      case NodeType.Start:
        return '▲';
      case NodeType.Battle:
        return '⚔';
      case NodeType.Shop:
        return '◆';
      case NodeType.Event:
        return '?';
      case NodeType.Boss:
        return '☠';
      default:
        return '•';
    }
  }

  setAvailable(available: boolean): void {
    this.isAvailable = available;
    this.updateVisuals();
  }

  setVisited(visited: boolean): void {
    this.isVisited = visited;
    this.updateVisuals();
  }

  setCurrent(current: boolean): void {
    this.isCurrent = current;
    this.updateVisuals();
  }

  private updateVisuals(): void {
    // Show/hide red X based on visited state
    if (this.redX) {
      this.redX.setVisible(this.isVisited && !this.isCurrent);
    }
    
    // Current node is hidden (player marker is on top)
    if (this.isCurrent) {
      this.circle.setAlpha(0);
      if (this.icon) this.icon.setAlpha(0);
      this.glowCircle.setVisible(false);
    } else if (this.isVisited) {
      this.circle.setAlpha(0.2);
      if (this.icon) {
        // Keep enemy sprites more visible even when visited
        if (this.icon instanceof Phaser.GameObjects.Sprite) {
          this.icon.setAlpha(0.6); // More visible than other icons
        } else {
          this.icon.setAlpha(0.2);
        }
      }
      this.glowCircle.setVisible(false);
      this.circle.setStrokeStyle(2, 0x666666, 0.3);
    } else if (this.isAvailable) {
      this.circle.setAlpha(0.95);
      if (this.icon) {
        // Enemy sprites should be fully visible when available
        if (this.icon instanceof Phaser.GameObjects.Sprite) {
          this.icon.setAlpha(1.0); // Full opacity for enemy sprites
        } else {
          this.icon.setAlpha(1);
        }
      }
      this.glowCircle.setVisible(true);
      this.circle.setStrokeStyle(2, 0xcccccc, 0.9);
      
      // Subtle pulse animation for available nodes
      this.scene.tweens.add({
        targets: this.glowCircle,
        alpha: { from: 0.2, to: 0.4 },
        scale: { from: 1, to: 1.1 },
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.circle.setAlpha(0.4);
      if (this.icon) {
        // Keep enemy sprites fully visible even when unavailable
        if (this.icon instanceof Phaser.GameObjects.Sprite) {
          this.icon.setAlpha(1.0); // Fully visible for enemy sprites
        } else {
          this.icon.setAlpha(0.4);
        }
      }
      this.glowCircle.setVisible(false);
      this.circle.setStrokeStyle(2, 0x555555, 0.4);
    }
  }

  private onHover(): void {
    if (!this.isAvailable || this.isVisited) return;
    
    this.scene.tweens.add({
      targets: this,
      scale: 1.15,
      duration: 100,
      ease: 'Power2',
    });
  }

  private onHoverOut(): void {
    if (!this.isAvailable || this.isVisited) return;
    
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 100,
      ease: 'Power2',
    });
  }

  private onClick(): void {
    console.log(`[NodeVisual] Clicked node ${this.node.id}: isAvailable=${this.isAvailable}, isVisited=${this.isVisited}`);
    
    if (!this.isAvailable || this.isVisited) {
      console.log(`[NodeVisual] Click blocked for node ${this.node.id}`);
      return;
    }
    
    console.log(`[NodeVisual] Click accepted for node ${this.node.id}, emitting click event`);
    
    // Click animation
    this.scene.tweens.add({
      targets: this,
      scale: 0.9,
      duration: 100,
      yoyo: true,
      ease: 'Power2',
      onComplete: () => {
        this.emit('click');
      },
    });
  }

  showVoted(): void {
    // Visual feedback that this node was voted for
    this.scene.tweens.add({
      targets: this,
      scale: { from: 1, to: 1.2 },
      duration: 200,
      yoyo: true,
      ease: 'Bounce.easeOut',
    });
    
    // Add sparkle effect
    const sparkle = this.scene.add.text(0, -40, '✓', {
      fontSize: '32px',
      color: '#44ff88',
      fontStyle: 'bold',
    });
    sparkle.setOrigin(0.5);
    this.add(sparkle);
    
    // Fade out sparkle
    this.scene.tweens.add({
      targets: sparkle,
      y: -60,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => sparkle.destroy(),
    });
  }
}

